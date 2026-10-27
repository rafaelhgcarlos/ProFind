import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore'

import {
  ProfessionalReviewError,
  PROFESSIONAL_REVIEW_HISTORY_LIMIT,
  professionalReviewReasonCode,
  reviewEventId,
  type AdministrativeReviewDecision,
  type ProfessionalOperationalReview,
  type ProfessionalReviewAction,
  type ProfessionalReviewEvent,
  type ProfessionalReviewStatus,
} from '../types/professional-review'

export interface ReviewTransactionCoordinator {
  afterRead(operation: 'submit' | 'decide' | 'suspend' | 'set-active'): Promise<void>
}

interface RepositoryDependencies {
  firestore: Firestore
  coordinator?: ReviewTransactionCoordinator
}

interface ExpectedReviewState {
  professionalId: string
  actorId: string
  expectedVersion: number
  expectedRevision: number
}

export type SubmitReviewInput = ExpectedReviewState

export interface DecideReviewInput extends ExpectedReviewState {
  decision: AdministrativeReviewDecision
  feedback?: string
  internalNote?: string
}

export interface SuspendReviewInput extends ExpectedReviewState {
  reason: string
  internalNote?: string
}

export interface SetProfessionalActiveInput extends ExpectedReviewState {
  active: boolean
  reason: string
  internalNote?: string
}

export interface ReviewOperationResult {
  professionalId: string
  profileVersion: number
  revision: number
  reviewStatus: ProfessionalReviewStatus
  active: boolean
  eventId: string
  idempotent: boolean
}

function stringArray(data: DocumentData, field: string) {
  return Array.isArray(data[field])
    ? data[field].filter((value: unknown): value is string => typeof value === 'string')
    : []
}

function operationalFromData(data: DocumentData): ProfessionalOperationalReview {
  return {
    schemaVersion: data.schemaVersion === 1 ? 1 : 1,
    professionalId: typeof data.professionalId === 'string' ? data.professionalId : '',
    reviewStatus: data.reviewStatus as ProfessionalReviewStatus,
    active: data.active === true,
    profileVersion: typeof data.profileVersion === 'number' ? data.profileVersion : 0,
    submittedVersion:
      typeof data.submittedVersion === 'number' ? data.submittedVersion : null,
    approvedVersion:
      typeof data.approvedVersion === 'number' ? data.approvedVersion : null,
    revision: typeof data.revision === 'number' ? data.revision : 0,
    lastEventId: typeof data.lastEventId === 'string' ? data.lastEventId : null,
    professionalFeedback:
      typeof data.professionalFeedback === 'string'
        ? data.professionalFeedback
        : null,
    approvedCategoryIds: stringArray(data, 'approvedCategoryIds'),
    approvedSpecialtyIds: stringArray(data, 'approvedSpecialtyIds'),
    approvedBaseCityIbgeCode:
      typeof data.approvedBaseCityIbgeCode === 'string'
        ? data.approvedBaseCityIbgeCode
        : '',
    approvedSelectedCityIbgeCodes: stringArray(
      data,
      'approvedSelectedCityIbgeCodes',
    ),
    eligibleCityIbgeCodes: stringArray(data, 'eligibleCityIbgeCodes'),
  }
}

function reviewEventFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ProfessionalReviewEvent {
  const data = snapshot.data()
  if (!data) {
    throw new ProfessionalReviewError('not-found', 'Evento de análise não encontrado.')
  }
  const action = data.action as ProfessionalReviewAction
  const professionalId = typeof data.professionalId === 'string'
    ? data.professionalId
    : ''
  const createdAt = data.createdAt
  if (!(createdAt instanceof Timestamp) && !(createdAt instanceof Date)) {
    throw new ProfessionalReviewError('unknown', 'Evento de análise inválido.')
  }

  return {
    eventId: snapshot.id,
    entityType: 'PROFESSIONAL',
    entityId:
      typeof data.entityId === 'string' ? data.entityId : professionalId,
    professionalId,
    actorId: typeof data.actorId === 'string' ? data.actorId : '',
    actorRole: data.actorRole === 'ADMIN' ? 'ADMIN' : 'PROFESSIONAL',
    action,
    reasonCode:
      typeof data.reasonCode === 'string'
        ? data.reasonCode as ProfessionalReviewEvent['reasonCode']
        : professionalReviewReasonCode(action),
    fromStatus: data.fromStatus as ProfessionalReviewStatus,
    toStatus: data.toStatus as ProfessionalReviewStatus,
    profileVersion:
      typeof data.profileVersion === 'number' ? data.profileVersion : 0,
    reviewedVersion:
      typeof data.reviewedVersion === 'number' ? data.reviewedVersion : null,
    reason: typeof data.reason === 'string' ? data.reason : null,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : createdAt,
  }
}

function historyPageSize(pageSize?: number) {
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    return PROFESSIONAL_REVIEW_HISTORY_LIMIT
  }
  return Math.max(
    1,
    Math.min(Math.trunc(pageSize), PROFESSIONAL_REVIEW_HISTORY_LIMIT),
  )
}

function resultFor(
  operational: ProfessionalOperationalReview,
  eventId: string,
  idempotent: boolean,
): ReviewOperationResult {
  return {
    professionalId: operational.professionalId,
    profileVersion: operational.profileVersion,
    revision: operational.revision,
    reviewStatus: operational.reviewStatus,
    active: operational.active,
    eventId,
    idempotent,
  }
}

function assertExpected(
  operational: ProfessionalOperationalReview,
  input: ExpectedReviewState,
) {
  if (operational.professionalId !== input.professionalId) {
    throw new ProfessionalReviewError('not-found', 'Cadastro profissional não encontrado.')
  }
  if (operational.profileVersion !== input.expectedVersion) {
    throw new ProfessionalReviewError(
      'stale-version',
      'O perfil mudou desde a leitura. Recarregue os dados antes de decidir.',
    )
  }
  if (operational.revision !== input.expectedRevision) {
    throw new ProfessionalReviewError(
      'stale-revision',
      'O estado da análise mudou. Recarregue os dados antes de continuar.',
    )
  }
}

function eligibleCities(profile: DocumentData) {
  const baseCode = profile.baseLocation?.ibgeCode
  const selected = stringArray(profile, 'selectedCityIbgeCodes')
  return [...new Set([
    ...(typeof baseCode === 'string' && baseCode ? [baseCode] : []),
    ...selected,
  ])]
}

export function createProfessionalReviewRepository({
  firestore,
  coordinator,
}: RepositoryDependencies) {
  function references(professionalId: string, revision: number) {
    const operationalReference = doc(
      firestore,
      'professionalOperationalProfiles',
      professionalId,
    )
    const eventId = reviewEventId(revision)
    return {
      operationalReference,
      eventId,
      eventReference: doc(operationalReference, 'events', eventId),
      internalReference: doc(
        firestore,
        'professionalReviewInternal',
        professionalId,
        'events',
        eventId,
      ),
    }
  }

  async function findByProfessionalId(professionalId: string) {
    const snapshot = await getDoc(
      doc(firestore, 'professionalOperationalProfiles', professionalId),
    )
    return snapshot.exists() ? operationalFromData(snapshot.data()) : null
  }

  async function listHistory(professionalId: string, pageSize?: number) {
    const snapshot = await getDocs(
      query(
        collection(
          firestore,
          'professionalOperationalProfiles',
          professionalId,
          'events',
        ),
        orderBy('createdAt', 'desc'),
        limit(historyPageSize(pageSize)),
      ),
    )
    return snapshot.docs.map(reviewEventFromSnapshot)
  }

  async function submitForReview(
    input: SubmitReviewInput,
  ): Promise<ReviewOperationResult> {
    return runTransaction(firestore, async (transaction) => {
      const currentReferences = references(
        input.professionalId,
        input.expectedRevision + 1,
      )
      const profileReference = doc(
        firestore,
        'professionalProfiles',
        input.professionalId,
      )
      const [operationalSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(currentReferences.operationalReference),
        transaction.get(profileReference),
      ])
      if (!operationalSnapshot.exists() || !profileSnapshot.exists()) {
        throw new ProfessionalReviewError('not-found', 'Cadastro profissional não encontrado.')
      }
      const operational = operationalFromData(operationalSnapshot.data())
      await coordinator?.afterRead('submit')

      if (
        operational.reviewStatus === 'UNDER_REVIEW' &&
        operational.submittedVersion === input.expectedVersion
      ) {
        return resultFor(
          operational,
          operational.lastEventId ?? reviewEventId(operational.revision),
          true,
        )
      }
      assertExpected(operational, input)
      if (!['DRAFT', 'CHANGES_REQUESTED'].includes(operational.reviewStatus)) {
        throw new ProfessionalReviewError(
          'invalid-transition',
          'Este cadastro não pode ser enviado para análise no estado atual.',
        )
      }
      if (profileSnapshot.data().status !== 'PUBLISHED') {
        throw new ProfessionalReviewError(
          'invalid-profile',
          'Complete e publique o perfil antes de enviá-lo para análise.',
        )
      }

      const revision = operational.revision + 1
      const refs = references(input.professionalId, revision)
      const action: ProfessionalReviewAction =
        operational.reviewStatus === 'DRAFT'
          ? 'PROFILE_SUBMITTED'
          : 'PROFILE_RESUBMITTED'
      const timestamp = serverTimestamp()
      transaction.set(refs.operationalReference, {
        ...operational,
        schemaVersion: 1,
        reviewStatus: 'UNDER_REVIEW',
        submittedVersion: operational.profileVersion,
        revision,
        lastEventId: refs.eventId,
        professionalFeedback: null,
        updatedAt: timestamp,
      })
      transaction.set(refs.eventReference, {
        eventId: refs.eventId,
        entityType: 'PROFESSIONAL',
        entityId: input.professionalId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        actorRole: 'PROFESSIONAL',
        action,
        reasonCode: professionalReviewReasonCode(action),
        fromStatus: operational.reviewStatus,
        toStatus: 'UNDER_REVIEW',
        profileVersion: operational.profileVersion,
        reviewedVersion: null,
        reason: null,
        createdAt: timestamp,
      })

      return resultFor(
        {
          ...operational,
          reviewStatus: 'UNDER_REVIEW',
          submittedVersion: operational.profileVersion,
          revision,
          lastEventId: refs.eventId,
          professionalFeedback: null,
        },
        refs.eventId,
        false,
      )
    })
  }

  async function decide(input: DecideReviewInput): Promise<ReviewOperationResult> {
    const feedback = input.feedback?.trim() || null
    if (
      ['CHANGES_REQUESTED', 'REJECTED'].includes(input.decision) &&
      !feedback
    ) {
      throw new ProfessionalReviewError(
        'reason-required',
        'Informe ao profissional o motivo desta decisão.',
      )
    }

    return runTransaction(firestore, async (transaction) => {
      const profileReference = doc(
        firestore,
        'professionalProfiles',
        input.professionalId,
      )
      const opReference = doc(
        firestore,
        'professionalOperationalProfiles',
        input.professionalId,
      )
      const [operationalSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(opReference),
        transaction.get(profileReference),
      ])
      if (!operationalSnapshot.exists() || !profileSnapshot.exists()) {
        throw new ProfessionalReviewError('not-found', 'Cadastro profissional não encontrado.')
      }
      const operational = operationalFromData(operationalSnapshot.data())
      await coordinator?.afterRead('decide')

      const nextRevision = input.expectedRevision + 1
      const refs = references(input.professionalId, nextRevision)
      if (
        operational.revision === nextRevision &&
        operational.lastEventId === refs.eventId &&
        operational.reviewStatus === input.decision
      ) {
        return resultFor(operational, refs.eventId, true)
      }
      assertExpected(operational, input)
      const canDecideUnderReview = operational.reviewStatus === 'UNDER_REVIEW'
      const canRequestChangesAgain =
        input.decision === 'CHANGES_REQUESTED' &&
        ['REJECTED', 'SUSPENDED'].includes(operational.reviewStatus)
      if (!canDecideUnderReview && !canRequestChangesAgain) {
        throw new ProfessionalReviewError(
          'invalid-transition',
          'A decisão não é permitida para o estado atual.',
        )
      }
      if (
        operational.reviewStatus === 'UNDER_REVIEW' &&
        operational.submittedVersion !== input.expectedVersion
      ) {
        throw new ProfessionalReviewError(
          'stale-version',
          'A versão enviada para análise não corresponde à versão lida.',
        )
      }

      const profile = profileSnapshot.data()
      const approved = input.decision === 'APPROVED'
      const timestamp = serverTimestamp()
      const commonUpdate = {
        schemaVersion: 1 as const,
        professionalId: input.professionalId,
        profileVersion: operational.profileVersion,
        reviewStatus: input.decision,
        submittedVersion: approved ? operational.profileVersion : null,
        approvedVersion: approved ? operational.profileVersion : null,
        active: approved ? operational.active : false,
        revision: nextRevision,
        lastEventId: refs.eventId,
        professionalFeedback: feedback,
        approvedCategoryIds: approved ? stringArray(profile, 'categoryIds') : [],
        approvedSpecialtyIds: approved ? stringArray(profile, 'specialtyIds') : [],
        approvedBaseCityIbgeCode:
          approved && typeof profile.baseLocation?.ibgeCode === 'string'
            ? profile.baseLocation.ibgeCode
            : '',
        approvedSelectedCityIbgeCodes: approved
          ? stringArray(profile, 'selectedCityIbgeCodes')
          : [],
        eligibleCityIbgeCodes: approved ? eligibleCities(profile) : [],
        updatedAt: timestamp,
      }
      transaction.set(refs.operationalReference, commonUpdate)
      transaction.set(refs.eventReference, {
        eventId: refs.eventId,
        entityType: 'PROFESSIONAL',
        entityId: input.professionalId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        actorRole: 'ADMIN',
        action: input.decision,
        reasonCode: professionalReviewReasonCode(input.decision),
        fromStatus: operational.reviewStatus,
        toStatus: input.decision,
        profileVersion: operational.profileVersion,
        reviewedVersion: input.expectedVersion,
        reason: feedback,
        createdAt: timestamp,
      })
      transaction.set(refs.internalReference, {
        eventId: refs.eventId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        action: input.decision,
        reviewedVersion: input.expectedVersion,
        note: input.internalNote?.trim() ?? '',
        createdAt: timestamp,
      })

      return resultFor(
        { ...operational, ...commonUpdate },
        refs.eventId,
        false,
      )
    })
  }

  async function suspend(
    input: SuspendReviewInput,
  ): Promise<ReviewOperationResult> {
    const reason = input.reason.trim()
    if (!reason) {
      throw new ProfessionalReviewError('reason-required', 'Informe o motivo da suspensão.')
    }
    return runTransaction(firestore, async (transaction) => {
      const opReference = doc(
        firestore,
        'professionalOperationalProfiles',
        input.professionalId,
      )
      const snapshot = await transaction.get(opReference)
      if (!snapshot.exists()) {
        throw new ProfessionalReviewError('not-found', 'Cadastro profissional não encontrado.')
      }
      const operational = operationalFromData(snapshot.data())
      await coordinator?.afterRead('suspend')
      const nextRevision = input.expectedRevision + 1
      const refs = references(input.professionalId, nextRevision)
      if (
        operational.revision === nextRevision &&
        operational.lastEventId === refs.eventId &&
        operational.reviewStatus === 'SUSPENDED'
      ) {
        return resultFor(operational, refs.eventId, true)
      }
      assertExpected(operational, input)
      if (operational.reviewStatus !== 'APPROVED') {
        throw new ProfessionalReviewError(
          'invalid-transition',
          'Somente um cadastro aprovado pode ser suspenso.',
        )
      }
      const timestamp = serverTimestamp()
      transaction.set(refs.operationalReference, {
        ...operational,
        schemaVersion: 1,
        reviewStatus: 'SUSPENDED',
        active: false,
        submittedVersion: null,
        revision: nextRevision,
        lastEventId: refs.eventId,
        professionalFeedback: reason,
        updatedAt: timestamp,
      })
      transaction.set(refs.eventReference, {
        eventId: refs.eventId,
        entityType: 'PROFESSIONAL',
        entityId: input.professionalId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        actorRole: 'ADMIN',
        action: 'SUSPENDED',
        reasonCode: professionalReviewReasonCode('SUSPENDED'),
        fromStatus: 'APPROVED',
        toStatus: 'SUSPENDED',
        profileVersion: operational.profileVersion,
        reviewedVersion: operational.approvedVersion,
        reason,
        createdAt: timestamp,
      })
      transaction.set(refs.internalReference, {
        eventId: refs.eventId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        action: 'SUSPENDED',
        reviewedVersion: operational.approvedVersion,
        note: input.internalNote?.trim() ?? '',
        createdAt: timestamp,
      })
      return resultFor(
        {
          ...operational,
          reviewStatus: 'SUSPENDED',
          active: false,
          submittedVersion: null,
          revision: nextRevision,
          lastEventId: refs.eventId,
          professionalFeedback: reason,
        },
        refs.eventId,
        false,
      )
    })
  }

  async function setActive(
    input: SetProfessionalActiveInput,
  ): Promise<ReviewOperationResult> {
    const reason = input.reason.trim()
    if (!reason) {
      throw new ProfessionalReviewError(
        'reason-required',
        'Informe o motivo da alteração de ativação.',
      )
    }
    return runTransaction(firestore, async (transaction) => {
      const opReference = doc(
        firestore,
        'professionalOperationalProfiles',
        input.professionalId,
      )
      const snapshot = await transaction.get(opReference)
      if (!snapshot.exists()) {
        throw new ProfessionalReviewError('not-found', 'Cadastro profissional não encontrado.')
      }
      const operational = operationalFromData(snapshot.data())
      await coordinator?.afterRead('set-active')
      if (operational.active === input.active) {
        return resultFor(
          operational,
          operational.lastEventId ?? reviewEventId(operational.revision),
          true,
        )
      }
      assertExpected(operational, input)
      if (
        input.active &&
        (operational.reviewStatus !== 'APPROVED' ||
          operational.approvedVersion !== operational.profileVersion)
      ) {
        throw new ProfessionalReviewError(
          'invalid-transition',
          'Somente a versão aprovada atual pode ser ativada.',
        )
      }
      const revision = operational.revision + 1
      const refs = references(input.professionalId, revision)
      const action = input.active ? 'ACTIVATED' : 'DEACTIVATED'
      const timestamp = serverTimestamp()
      transaction.set(refs.operationalReference, {
        ...operational,
        schemaVersion: 1,
        active: input.active,
        revision,
        lastEventId: refs.eventId,
        updatedAt: timestamp,
      })
      transaction.set(refs.eventReference, {
        eventId: refs.eventId,
        entityType: 'PROFESSIONAL',
        entityId: input.professionalId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        actorRole: 'ADMIN',
        action,
        reasonCode: professionalReviewReasonCode(action),
        fromStatus: operational.reviewStatus,
        toStatus: operational.reviewStatus,
        profileVersion: operational.profileVersion,
        reviewedVersion: operational.approvedVersion,
        reason,
        createdAt: timestamp,
      })
      transaction.set(refs.internalReference, {
        eventId: refs.eventId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        action,
        reviewedVersion: operational.approvedVersion,
        note: input.internalNote?.trim() ?? '',
        createdAt: timestamp,
      })
      return resultFor(
        { ...operational, active: input.active, revision, lastEventId: refs.eventId },
        refs.eventId,
        false,
      )
    })
  }

  return {
    findByProfessionalId,
    listHistory,
    submitForReview,
    decide,
    suspend,
    setActive,
  }
}
