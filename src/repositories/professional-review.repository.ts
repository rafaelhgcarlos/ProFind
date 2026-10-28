import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
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
  afterRead(operation: 'submit' | 'decide' | 'suspend' | 'set-active' | 'assist'): Promise<void>
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
  activateOnApproval?: boolean
  feedback?: string
  internalNote?: string
}

export interface AssistProfessionalProfileInput extends ExpectedReviewState {
  changes: {
    publicName: string
    headline: string
    bio: string
    experienceYears: number | null
  }
  internalNote: string
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

export interface ProfessionalReviewQueueInput {
  statuses?: ProfessionalReviewStatus[]
  active?: boolean
  pageSize?: number
  cursor?: string | null
}

export interface ProfessionalReviewQueuePage {
  items: ProfessionalReviewQueueItem[]
  nextCursor: string | null
}

export interface ProfessionalReviewQueueItem {
  operational: ProfessionalOperationalReview
  publicName: string
  headline: string
  profileImageUrl: string | null
}

export interface AdminProfessionalProfileSnapshot {
  professionalId: string
  publicName: string
  headline: string
  bio: string
  categoryIds: string[]
  specialtyIds: string[]
  experienceYears: number | null
  baseLocation: { city: string; stateCode: string; ibgeCode: string }
  serviceMode: string | null
  serviceRadiusKm: number | null
  selectedCities: Array<{ city: string; stateCode: string; ibgeCode: string }>
  availability: string
  contactVisibility: string
  publicPhone: string | null
  status: string
  profileImage: { url: string; altText: string } | null
  portfolioImages: Array<{ url: string; altText: string; order: number }>
}

export interface ProfessionalReviewInternalEvent {
  eventId: string
  professionalId: string
  actorId: string
  action: ProfessionalReviewAction
  reviewedVersion: number | null
  note: string
  createdAt: Date
}

export interface ConfirmedProfessionalEngagement {
  requestId: string
  status: 'ASSIGNED' | 'IN_PROGRESS'
  serviceDate: string
  period: string
}

export interface AdminProfessionalReviewDetail {
  operational: ProfessionalOperationalReview
  profile: AdminProfessionalProfileSnapshot
  history: ProfessionalReviewEvent[]
  internalHistory: ProfessionalReviewInternalEvent[]
  confirmedEngagements: ConfirmedProfessionalEngagement[]
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

function dateValue(value: unknown, errorMessage: string) {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  throw new ProfessionalReviewError('unknown', errorMessage)
}

function locationValue(value: unknown) {
  const location = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
  return {
    city: typeof location.city === 'string' ? location.city : '',
    stateCode: typeof location.stateCode === 'string' ? location.stateCode : '',
    ibgeCode: typeof location.ibgeCode === 'string' ? location.ibgeCode : '',
  }
}

function imageValue(value: unknown, fallbackOrder = 0) {
  if (typeof value !== 'object' || value === null) return null
  const image = value as Record<string, unknown>
  if (typeof image.url !== 'string') return null
  return {
    url: image.url,
    altText: typeof image.altText === 'string' ? image.altText : '',
    order: typeof image.order === 'number' ? image.order : fallbackOrder,
  }
}

function adminProfileFromData(
  professionalId: string,
  data: DocumentData,
): AdminProfessionalProfileSnapshot {
  const portfolioImages = Array.isArray(data.portfolioImages)
    ? data.portfolioImages
        .map((image: unknown, index: number) => imageValue(image, index))
        .filter((image): image is NonNullable<ReturnType<typeof imageValue>> => image !== null)
        .sort((first, second) => first.order - second.order)
    : []
  const profileImage = imageValue(data.profileImage)
  return {
    professionalId,
    publicName: typeof data.publicName === 'string' ? data.publicName : '',
    headline: typeof data.headline === 'string' ? data.headline : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    categoryIds: stringArray(data, 'categoryIds'),
    specialtyIds: stringArray(data, 'specialtyIds'),
    experienceYears:
      typeof data.experienceYears === 'number' ? data.experienceYears : null,
    baseLocation: locationValue(data.baseLocation),
    serviceMode: typeof data.serviceMode === 'string' ? data.serviceMode : null,
    serviceRadiusKm:
      typeof data.serviceRadiusKm === 'number' ? data.serviceRadiusKm : null,
    selectedCities: Array.isArray(data.selectedCities)
      ? data.selectedCities.map(locationValue)
      : [],
    availability: typeof data.availability === 'string' ? data.availability : '',
    contactVisibility:
      typeof data.contactVisibility === 'string' ? data.contactVisibility : 'PRIVATE',
    publicPhone: typeof data.phone === 'string' ? data.phone : null,
    status: typeof data.status === 'string' ? data.status : 'DRAFT',
    profileImage: profileImage
      ? { url: profileImage.url, altText: profileImage.altText }
      : null,
    portfolioImages,
  }
}

function internalEventFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ProfessionalReviewInternalEvent {
  const data = snapshot.data()
  if (!data) {
    throw new ProfessionalReviewError('not-found', 'Nota interna não encontrada.')
  }
  return {
    eventId: snapshot.id,
    professionalId:
      typeof data.professionalId === 'string' ? data.professionalId : '',
    actorId: typeof data.actorId === 'string' ? data.actorId : '',
    action: data.action as ProfessionalReviewAction,
    reviewedVersion:
      typeof data.reviewedVersion === 'number' ? data.reviewedVersion : null,
    note: typeof data.note === 'string' ? data.note : '',
    createdAt: dateValue(data.createdAt, 'Nota interna inválida.'),
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

  async function listQueue(
    input: ProfessionalReviewQueueInput = {},
  ): Promise<ProfessionalReviewQueuePage> {
    const pageSize = Math.max(1, Math.min(Math.trunc(input.pageSize ?? 12), 25))
    const statuses = [...new Set(input.statuses ?? [])]
    const constraints = [
      ...(statuses.length === 1
        ? [where('reviewStatus', '==', statuses[0])]
        : statuses.length > 1
          ? [where('reviewStatus', 'in', statuses)]
          : []),
      ...(typeof input.active === 'boolean'
        ? [where('active', '==', input.active)]
        : []),
      orderBy(documentId(), 'asc'),
      ...(input.cursor ? [startAfter(input.cursor)] : []),
      limit(pageSize + 1),
    ]
    const snapshot = await getDocs(
      query(collection(firestore, 'professionalOperationalProfiles'), ...constraints),
    )
    const hasNextPage = snapshot.docs.length > pageSize
    const pageDocuments = snapshot.docs.slice(0, pageSize)
    const profileSnapshots = await Promise.all(
      pageDocuments.map((document) =>
        getDoc(doc(firestore, 'professionalProfiles', document.id)),
      ),
    )
    return {
      items: pageDocuments.map((document, index) => {
        const profileData = profileSnapshots[index]?.data()
        const profileImage = imageValue(profileData?.profileImage)
        return {
          operational: operationalFromData(document.data()),
          publicName:
            typeof profileData?.publicName === 'string'
              ? profileData.publicName
              : 'Cadastro profissional',
          headline:
            typeof profileData?.headline === 'string' ? profileData.headline : '',
          profileImageUrl: profileImage?.url ?? null,
        }
      }),
      nextCursor: hasNextPage
        ? pageDocuments.at(-1)?.id ?? null
        : null,
    }
  }

  async function listInternalHistory(professionalId: string) {
    const snapshot = await getDocs(
      query(
        collection(
          firestore,
          'professionalReviewInternal',
          professionalId,
          'events',
        ),
        orderBy('createdAt', 'desc'),
        limit(PROFESSIONAL_REVIEW_HISTORY_LIMIT),
      ),
    )
    return snapshot.docs.map(internalEventFromSnapshot)
  }

  async function listConfirmedEngagements(professionalId: string) {
    const snapshot = await getDocs(
      query(
        collection(firestore, 'serviceRequests'),
        where('assignedProfessionalId', '==', professionalId),
        where('status', 'in', ['ASSIGNED', 'IN_PROGRESS']),
        limit(20),
      ),
    )
    return snapshot.docs.map((document): ConfirmedProfessionalEngagement => {
      const data = document.data()
      return {
        requestId: document.id,
        status: data.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED',
        serviceDate: typeof data.serviceDate === 'string' ? data.serviceDate : '',
        period: typeof data.period === 'string' ? data.period : '',
      }
    })
  }

  async function findAdminDetail(
    professionalId: string,
  ): Promise<AdminProfessionalReviewDetail | null> {
    const [operationalSnapshot, profileSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'professionalOperationalProfiles', professionalId)),
      getDoc(doc(firestore, 'professionalProfiles', professionalId)),
    ])
    if (!operationalSnapshot.exists() || !profileSnapshot.exists()) return null

    const [history, internalHistory, confirmedEngagements] = await Promise.all([
      listHistory(professionalId),
      listInternalHistory(professionalId),
      listConfirmedEngagements(professionalId),
    ])
    return {
      operational: operationalFromData(operationalSnapshot.data()),
      profile: adminProfileFromData(professionalId, profileSnapshot.data()),
      history,
      internalHistory,
      confirmedEngagements,
    }
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
      const action: ProfessionalReviewAction =
        approved && !operational.active && input.activateOnApproval === true
          ? 'APPROVED_AND_ACTIVATED'
          : input.decision
      const timestamp = serverTimestamp()
      const commonUpdate = {
        schemaVersion: 1 as const,
        professionalId: input.professionalId,
        profileVersion: operational.profileVersion,
        reviewStatus: input.decision,
        submittedVersion: approved ? operational.profileVersion : null,
        approvedVersion: approved ? operational.profileVersion : null,
        active: approved
          ? operational.active || input.activateOnApproval === true
          : false,
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
        action,
        reasonCode: professionalReviewReasonCode(action),
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
        action,
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

  async function assistProfile(
    input: AssistProfessionalProfileInput,
  ): Promise<ReviewOperationResult> {
    const changes = {
      publicName: input.changes.publicName.trim(),
      headline: input.changes.headline.trim(),
      bio: input.changes.bio.trim(),
      experienceYears: input.changes.experienceYears,
    }
    const internalNote = input.internalNote.trim()
    if (
      changes.publicName.length > 120 ||
      changes.headline.length > 120 ||
      changes.bio.length > 1_200 ||
      (changes.experienceYears !== null &&
        (!Number.isInteger(changes.experienceYears) ||
          changes.experienceYears < 0 ||
          changes.experienceYears > 80))
    ) {
      throw new ProfessionalReviewError(
        'invalid-profile',
        'Revise os campos do cadastro antes de salvar o auxílio.',
      )
    }
    if (!internalNote) {
      throw new ProfessionalReviewError(
        'reason-required',
        'Registre uma nota interna explicando o auxílio administrativo.',
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
      const nextRevision = input.expectedRevision + 1
      const refs = references(input.professionalId, nextRevision)
      const [operationalSnapshot, profileSnapshot, eventSnapshot, internalSnapshot] =
        await Promise.all([
          transaction.get(opReference),
          transaction.get(profileReference),
          transaction.get(refs.eventReference),
          transaction.get(refs.internalReference),
        ])
      if (!operationalSnapshot.exists() || !profileSnapshot.exists()) {
        throw new ProfessionalReviewError('not-found', 'Cadastro profissional não encontrado.')
      }
      const operational = operationalFromData(operationalSnapshot.data())
      const profile = profileSnapshot.data()
      await coordinator?.afterRead('assist')

      const profileAlreadyMatches =
        profile.publicName === changes.publicName &&
        profile.headline === changes.headline &&
        (profile.bio ?? '') === changes.bio &&
        (profile.experienceYears ?? null) === changes.experienceYears
      if (
        operational.revision === nextRevision &&
        operational.lastEventId === refs.eventId &&
        profileAlreadyMatches &&
        eventSnapshot.exists() &&
        eventSnapshot.data().actorId === input.actorId &&
        internalSnapshot.exists() &&
        internalSnapshot.data().actorId === input.actorId
      ) {
        return resultFor(operational, refs.eventId, true)
      }

      assertExpected(operational, input)
      if (profileAlreadyMatches) {
        throw new ProfessionalReviewError(
          'invalid-profile',
          'Nenhuma alteração foi informada para o cadastro.',
        )
      }

      const nextVersion = operational.profileVersion + 1
      const nextStatus: ProfessionalReviewStatus =
        ['APPROVED', 'UNDER_REVIEW'].includes(operational.reviewStatus)
          ? 'UNDER_REVIEW'
          : operational.reviewStatus
      const action: ProfessionalReviewAction =
        nextStatus === 'UNDER_REVIEW'
          ? 'REANALYSIS_REQUIRED'
          : 'PROFILE_UPDATED'
      const timestamp = serverTimestamp()
      const operationalUpdate = {
        ...operational,
        schemaVersion: 1 as const,
        reviewStatus: nextStatus,
        profileVersion: nextVersion,
        submittedVersion: nextStatus === 'UNDER_REVIEW' ? nextVersion : null,
        revision: nextRevision,
        lastEventId: refs.eventId,
        professionalFeedback:
          nextStatus === 'UNDER_REVIEW'
            ? null
            : operational.professionalFeedback,
        updatedAt: timestamp,
      }
      transaction.update(profileReference, { ...changes, updatedAt: timestamp })
      transaction.set(refs.operationalReference, operationalUpdate)
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
        toStatus: nextStatus,
        profileVersion: nextVersion,
        reviewedVersion: null,
        reason: null,
        createdAt: timestamp,
      })
      transaction.set(refs.internalReference, {
        eventId: refs.eventId,
        professionalId: input.professionalId,
        actorId: input.actorId,
        action,
        reviewedVersion: null,
        note: internalNote,
        createdAt: timestamp,
      })
      return resultFor(
        { ...operational, ...operationalUpdate },
        refs.eventId,
        false,
      )
    })
  }

  return {
    findByProfessionalId,
    listHistory,
    listQueue,
    findAdminDetail,
    submitForReview,
    decide,
    suspend,
    setActive,
    assistProfile,
  }
}
