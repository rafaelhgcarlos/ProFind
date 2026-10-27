import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore'

import {
  assignmentDocumentId,
  assignmentEventId,
  cancellationEventId,
  isAcceptanceAllowed,
  isProfessionalCancellationAllowed,
  refusalEventId,
  roundDocumentId,
  serviceSlotId,
} from '../services/service-period-policy'
import {
  ServiceRequestError,
  SERVICE_EVENT_HISTORY_LIMIT,
  type ProfessionalOperationalProfile,
  type ServicePeriod,
  type ServiceRequestEvent,
  type ServiceRequestSummary,
} from '../types/service-request'

export interface TransactionCoordinator {
  afterRead(operation: 'accept' | 'refuse' | 'cancel', key: string): Promise<void>
}

interface RepositoryDependencies {
  firestore: Firestore
  now?: () => Date
  coordinator?: TransactionCoordinator
}

export interface OpportunityQuery {
  categoryId: string
  specialtyId: string
  cityIbgeCode: string
  serviceDate: string
  period: ServicePeriod
}

export interface ServiceHistoryQuery {
  requestId: string
  actorId?: string
  pageSize?: number
}

export const OPPORTUNITY_QUERY_LIMIT = 50

export interface AcceptRequestInput {
  requestId: string
  professionalId: string
  expectedRound: number
}

export type RefuseRequestInput = AcceptRequestInput

export interface CancelAssignmentInput {
  requestId: string
  professionalId: string
  expectedAssignmentId: string
}

export interface AcceptedRequestResult {
  requestId: string
  assignmentId: string
  reservationId: string
  round: number
  idempotent: boolean
}

export interface RefusedRequestResult {
  requestId: string
  round: number
  idempotent: boolean
}

export interface ReopenedRequestResult {
  requestId: string
  cancelledAssignmentId: string
  reopenedRound: number
  idempotent: boolean
}

function stringValue(data: DocumentData, field: string) {
  return typeof data[field] === 'string' ? data[field] : ''
}

function nullableString(data: DocumentData, field: string) {
  return typeof data[field] === 'string' ? data[field] : null
}

function stringArray(data: DocumentData, field: string) {
  return Array.isArray(data[field])
    ? data[field].filter((value: unknown): value is string => typeof value === 'string')
    : []
}

function dateValue(data: DocumentData, field: string) {
  const value = data[field]
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  throw new ServiceRequestError('unknown', `Campo temporal inválido: ${field}.`)
}

function requestFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ServiceRequestSummary {
  if (!snapshot.exists()) {
    throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
  }

  const data = snapshot.data()
  const period = stringValue(data, 'period')
  const status = stringValue(data, 'status')
  if (
    !['MORNING', 'AFTERNOON', 'EVENING'].includes(period) ||
    !['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)
  ) {
    throw new ServiceRequestError('unknown', 'Solicitação com dados inválidos.')
  }

  return {
    requestId: snapshot.id,
    clientId: stringValue(data, 'clientId'),
    categoryId: stringValue(data, 'categoryId'),
    specialtyId: stringValue(data, 'specialtyId'),
    cityIbgeCode: stringValue(data, 'cityIbgeCode'),
    serviceDate: stringValue(data, 'serviceDate'),
    period: period as ServicePeriod,
    periodStartAt: dateValue(data, 'periodStartAt'),
    acceptUntil: dateValue(data, 'acceptUntil'),
    status: status as ServiceRequestSummary['status'],
    round: typeof data.round === 'number' ? data.round : 0,
    currentRoundId: stringValue(data, 'currentRoundId'),
    assignedProfessionalId: nullableString(data, 'assignedProfessionalId'),
    currentAssignmentId: nullableString(data, 'currentAssignmentId'),
    reopenReason:
      data.reopenReason === 'PROFESSIONAL_CANCELLATION'
        ? 'PROFESSIONAL_CANCELLATION'
        : null,
    excludedProfessionalIds: stringArray(data, 'excludedProfessionalIds'),
  }
}

function serviceEventFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ServiceRequestEvent {
  const data = snapshot.data()
  if (!data) {
    throw new ServiceRequestError('not-found', 'Evento do atendimento não encontrado.')
  }
  const type = stringValue(data, 'type') as ServiceRequestEvent['type']
  const requestId = stringValue(data, 'requestId')
  const fallbackReason =
    type === 'REQUEST_ASSIGNED'
      ? 'PROFESSIONAL_ACCEPTANCE'
      : type === 'PROFESSIONAL_REFUSED'
        ? 'PROFESSIONAL_REFUSAL'
        : 'PROFESSIONAL_CANCELLATION'

  return {
    eventId: snapshot.id,
    entityType: 'SERVICE_REQUEST',
    entityId: stringValue(data, 'entityId') || requestId,
    requestId,
    type,
    reasonCode: (stringValue(data, 'reasonCode') || fallbackReason) as ServiceRequestEvent['reasonCode'],
    actorId: stringValue(data, 'actorId'),
    actorRole: 'PROFESSIONAL',
    round: typeof data.round === 'number' ? data.round : 0,
    assignmentId: nullableString(data, 'assignmentId'),
    fromStatus: stringValue(data, 'fromStatus') as ServiceRequestEvent['fromStatus'],
    toStatus: stringValue(data, 'toStatus') as ServiceRequestEvent['toStatus'],
    ...(typeof data.targetRound === 'number'
      ? { targetRound: data.targetRound }
      : {}),
    createdAt: dateValue(data, 'createdAt'),
  }
}

function historyPageSize(pageSize?: number) {
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    return SERVICE_EVENT_HISTORY_LIMIT
  }
  return Math.max(1, Math.min(Math.trunc(pageSize), SERVICE_EVENT_HISTORY_LIMIT))
}

function operationalProfile(data: DocumentData): ProfessionalOperationalProfile {
  return {
    professionalId: stringValue(data, 'professionalId'),
    reviewStatus: stringValue(
      data,
      'reviewStatus',
    ) as ProfessionalOperationalProfile['reviewStatus'],
    active: data.active === true,
    profileVersion: typeof data.profileVersion === 'number' ? data.profileVersion : 0,
    approvedVersion:
      typeof data.approvedVersion === 'number' ? data.approvedVersion : null,
    approvedCategoryIds: stringArray(data, 'approvedCategoryIds'),
    approvedSpecialtyIds: stringArray(data, 'approvedSpecialtyIds'),
    approvedBaseCityIbgeCode: stringValue(data, 'approvedBaseCityIbgeCode'),
    approvedSelectedCityIbgeCodes: stringArray(
      data,
      'approvedSelectedCityIbgeCodes',
    ),
    eligibleCityIbgeCodes: stringArray(data, 'eligibleCityIbgeCodes'),
  }
}

function sameStrings(first: string[], second: unknown) {
  return (
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((value, index) => second[index] === value)
  )
}

function assertApprovedMatch(
  request: ServiceRequestSummary,
  professionalId: string,
  operationalData: DocumentData | undefined,
  profileData: DocumentData | undefined,
) {
  if (!operationalData || !profileData) {
    throw new ServiceRequestError(
      'not-eligible',
      'O profissional não possui aprovação operacional válida.',
    )
  }

  const operational = operationalProfile(operationalData)
  const profileBaseLocation = profileData.baseLocation as
    | Record<string, unknown>
    | undefined
  const profileMatchesApprovedSnapshot =
    profileData.ownerId === professionalId &&
    sameStrings(operational.approvedCategoryIds, profileData.categoryIds) &&
    sameStrings(operational.approvedSpecialtyIds, profileData.specialtyIds) &&
    profileBaseLocation?.ibgeCode === operational.approvedBaseCityIbgeCode &&
    sameStrings(
      operational.approvedSelectedCityIbgeCodes,
      profileData.selectedCityIbgeCodes ?? [],
    )

  if (
    operational.professionalId !== professionalId ||
    operational.reviewStatus !== 'APPROVED' ||
    !operational.active ||
    operational.approvedVersion === null ||
    operational.approvedVersion !== operational.profileVersion ||
    !profileMatchesApprovedSnapshot ||
    !operational.approvedCategoryIds.includes(request.categoryId) ||
    !operational.approvedSpecialtyIds.includes(request.specialtyId) ||
    !operational.eligibleCityIbgeCodes.includes(request.cityIbgeCode)
  ) {
    throw new ServiceRequestError(
      'not-eligible',
      'O profissional não atende aos critérios desta oportunidade.',
    )
  }
}

function assertOpenRound(request: ServiceRequestSummary, expectedRound: number) {
  if (request.round !== expectedRound) {
    throw new ServiceRequestError(
      'round-changed',
      'A rodada da solicitação foi alterada.',
    )
  }
  if (request.status !== 'OPEN') {
    throw new ServiceRequestError(
      'not-open',
      'Esta solicitação não está mais aberta.',
    )
  }
}

function assertBeforeAcceptanceDeadline(request: ServiceRequestSummary, now: Date) {
  if (!isAcceptanceAllowed(now, request.acceptUntil)) {
    throw new ServiceRequestError(
      'request-expired',
      'O período permitido para aceitar esta solicitação terminou.',
    )
  }
}

export function createServiceRequestRepository({
  firestore,
  now = () => new Date(),
  coordinator,
}: RepositoryDependencies) {
  async function listRequestHistory(input: ServiceHistoryQuery) {
    const constraints = [
      ...(input.actorId ? [where('actorId', '==', input.actorId)] : []),
      orderBy('createdAt', 'desc'),
      limit(historyPageSize(input.pageSize)),
    ]
    const snapshot = await getDocs(
      query(
        collection(firestore, 'serviceRequests', input.requestId, 'events'),
        ...constraints,
      ),
    )
    return snapshot.docs.map(serviceEventFromSnapshot)
  }

  async function listOpenOpportunities(input: OpportunityQuery) {
    const snapshot = await getDocs(
      query(
        collection(firestore, 'serviceRequests'),
        where('status', '==', 'OPEN'),
        where('categoryId', '==', input.categoryId),
        where('specialtyId', '==', input.specialtyId),
        where('cityIbgeCode', '==', input.cityIbgeCode),
        where('serviceDate', '==', input.serviceDate),
        where('period', '==', input.period),
        where('acceptUntil', '>', Timestamp.fromDate(now())),
        orderBy('acceptUntil', 'asc'),
        limit(OPPORTUNITY_QUERY_LIMIT),
      ),
    )
    return snapshot.docs.map(requestFromSnapshot)
  }

  async function acceptRequest({
    requestId,
    professionalId,
    expectedRound,
  }: AcceptRequestInput): Promise<AcceptedRequestResult> {
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', requestId)
      const requestSnapshot = await transaction.get(requestReference)
      const request = requestFromSnapshot(requestSnapshot)
      const expectedAssignmentId = assignmentDocumentId(expectedRound)

      if (
        request.status === 'ASSIGNED' &&
        request.round === expectedRound &&
        request.assignedProfessionalId === professionalId &&
        request.currentAssignmentId === expectedAssignmentId
      ) {
        const assignmentReference = doc(
          requestReference,
          'assignments',
          expectedAssignmentId,
        )
        const assignmentSnapshot = await transaction.get(assignmentReference)
        if (!assignmentSnapshot.exists()) {
          throw new ServiceRequestError('unknown', 'A atribuição confirmada está inconsistente.')
        }
        const assignment = assignmentSnapshot.data()
        const acceptedEventId = stringValue(assignment, 'acceptedEventId')
        const eventSnapshot = await transaction.get(
          doc(requestReference, 'events', acceptedEventId),
        )
        if (
          !acceptedEventId ||
          !eventSnapshot.exists() ||
          eventSnapshot.data().type !== 'REQUEST_ASSIGNED' ||
          eventSnapshot.data().requestId !== requestId ||
          eventSnapshot.data().actorId !== professionalId
        ) {
          throw new ServiceRequestError('unknown', 'O histórico do aceite está inconsistente.')
        }
        return {
          requestId,
          assignmentId: expectedAssignmentId,
          reservationId: serviceSlotId(request.serviceDate, request.period),
          round: expectedRound,
          idempotent: true,
        }
      }

      assertOpenRound(request, expectedRound)
      const roundId = request.currentRoundId
      if (request.clientId === professionalId) {
        throw new ServiceRequestError('not-eligible', 'O cliente não pode aceitar o próprio pedido.')
      }
      if (request.excludedProfessionalIds.includes(professionalId)) {
        throw new ServiceRequestError('not-eligible', 'O profissional está excluído desta rodada.')
      }

      const slotId = serviceSlotId(request.serviceDate, request.period)
      const roundReference = doc(requestReference, 'rounds', roundId)
      const operationalReference = doc(
        firestore,
        'professionalOperationalProfiles',
        professionalId,
      )
      const profileReference = doc(firestore, 'professionalProfiles', professionalId)
      const availabilityReference = doc(
        firestore,
        'professionalAvailability',
        professionalId,
        'slots',
        slotId,
      )
      const refusalReference = doc(
        roundReference,
        'refusals',
        professionalId,
      )
      const reservationReference = doc(
        firestore,
        'professionalReservations',
        professionalId,
        'slots',
        slotId,
      )
      const [
        roundSnapshot,
        operationalSnapshot,
        profileSnapshot,
        availabilitySnapshot,
        refusalSnapshot,
        reservationSnapshot,
      ] = await Promise.all([
        transaction.get(roundReference),
        transaction.get(operationalReference),
        transaction.get(profileReference),
        transaction.get(availabilityReference),
        transaction.get(refusalReference),
        transaction.get(reservationReference),
      ])

      await coordinator?.afterRead('accept', `${requestId}:${professionalId}`)

      const roundData = roundSnapshot.data()
      if (!roundSnapshot.exists() || roundData?.status !== 'OPEN') {
        throw new ServiceRequestError('round-changed', 'A rodada não está mais aberta.')
      }
      assertApprovedMatch(
        request,
        professionalId,
        operationalSnapshot.data(),
        profileSnapshot.data(),
      )
      if (
        !availabilitySnapshot.exists() ||
        availabilitySnapshot.data().professionalId !== professionalId ||
        availabilitySnapshot.data().available !== true
      ) {
        throw new ServiceRequestError('not-eligible', 'O período não está disponível.')
      }
      if (refusalSnapshot.exists()) {
        throw new ServiceRequestError('already-refused', 'O profissional recusou esta rodada.')
      }
      if (reservationSnapshot.exists()) {
        throw new ServiceRequestError('slot-conflict', 'O período já está reservado.')
      }
      assertBeforeAcceptanceDeadline(request, now())

      const assignmentId = expectedAssignmentId
      const eventId = assignmentEventId(expectedRound)
      const assignmentReference = doc(
        requestReference,
        'assignments',
        assignmentId,
      )
      const eventReference = doc(requestReference, 'events', eventId)
      const timestamp = serverTimestamp()

      transaction.update(requestReference, {
        status: 'ASSIGNED',
        assignedProfessionalId: professionalId,
        currentAssignmentId: assignmentId,
        updatedAt: timestamp,
      })
      transaction.update(roundReference, {
        status: 'CLOSED',
        closedAt: timestamp,
        closedReason: 'ASSIGNED',
        updatedAt: timestamp,
      })
      transaction.set(assignmentReference, {
        assignmentId,
        requestId,
        clientId: request.clientId,
        professionalId,
        round: expectedRound,
        status: 'ACTIVE',
        serviceDate: request.serviceDate,
        period: request.period,
        reservationId: slotId,
        acceptedEventId: eventId,
        acceptedAt: timestamp,
        endedAt: null,
        endReason: null,
      })
      transaction.set(reservationReference, {
        reservationId: slotId,
        professionalId,
        requestId,
        assignmentId,
        serviceDate: request.serviceDate,
        period: request.period,
        round: expectedRound,
        createdAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId,
        entityType: 'SERVICE_REQUEST',
        entityId: requestId,
        requestId,
        type: 'REQUEST_ASSIGNED',
        reasonCode: 'PROFESSIONAL_ACCEPTANCE',
        actorId: professionalId,
        actorRole: 'PROFESSIONAL',
        round: expectedRound,
        assignmentId,
        fromStatus: 'OPEN',
        toStatus: 'ASSIGNED',
        createdAt: timestamp,
      })

      return {
        requestId,
        assignmentId,
        reservationId: slotId,
        round: expectedRound,
        idempotent: false,
      }
    })
  }

  async function refuseRequest({
    requestId,
    professionalId,
    expectedRound,
  }: RefuseRequestInput): Promise<RefusedRequestResult> {
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', requestId)
      const requestSnapshot = await transaction.get(requestReference)
      const request = requestFromSnapshot(requestSnapshot)
      assertOpenRound(request, expectedRound)
      assertBeforeAcceptanceDeadline(request, now())

      const roundId = request.currentRoundId
      if (
        request.clientId === professionalId ||
        request.excludedProfessionalIds.includes(professionalId)
      ) {
        throw new ServiceRequestError('not-eligible', 'O profissional não participa desta rodada.')
      }

      const roundReference = doc(requestReference, 'rounds', roundId)
      const refusalReference = doc(roundReference, 'refusals', professionalId)
      const operationalReference = doc(
        firestore,
        'professionalOperationalProfiles',
        professionalId,
      )
      const profileReference = doc(firestore, 'professionalProfiles', professionalId)
      const [roundSnapshot, refusalSnapshot, operationalSnapshot, profileSnapshot] =
        await Promise.all([
          transaction.get(roundReference),
          transaction.get(refusalReference),
          transaction.get(operationalReference),
          transaction.get(profileReference),
        ])

      await coordinator?.afterRead('refuse', `${requestId}:${professionalId}`)

      if (roundSnapshot.data()?.status !== 'OPEN') {
        throw new ServiceRequestError('round-changed', 'A rodada não está mais aberta.')
      }
      assertApprovedMatch(
        request,
        professionalId,
        operationalSnapshot.data(),
        profileSnapshot.data(),
      )
      if (refusalSnapshot.exists()) {
        const refusalEventId = stringValue(refusalSnapshot.data(), 'eventId')
        const eventSnapshot = await transaction.get(
          doc(requestReference, 'events', refusalEventId),
        )
        if (
          !refusalEventId ||
          !eventSnapshot.exists() ||
          eventSnapshot.data().type !== 'PROFESSIONAL_REFUSED' ||
          eventSnapshot.data().requestId !== requestId ||
          eventSnapshot.data().actorId !== professionalId
        ) {
          throw new ServiceRequestError('unknown', 'O histórico da recusa está inconsistente.')
        }
        return { requestId, round: expectedRound, idempotent: true }
      }

      const eventId = refusalEventId(expectedRound, professionalId)
      const timestamp = serverTimestamp()
      transaction.set(refusalReference, {
        requestId,
        roundId,
        round: expectedRound,
        professionalId,
        decision: 'REFUSED',
        eventId,
        createdAt: timestamp,
      })
      transaction.set(doc(requestReference, 'events', eventId), {
        eventId,
        entityType: 'SERVICE_REQUEST',
        entityId: requestId,
        requestId,
        type: 'PROFESSIONAL_REFUSED',
        reasonCode: 'PROFESSIONAL_REFUSAL',
        actorId: professionalId,
        actorRole: 'PROFESSIONAL',
        round: expectedRound,
        assignmentId: null,
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        createdAt: timestamp,
      })

      return { requestId, round: expectedRound, idempotent: false }
    })
  }

  async function cancelAssignment({
    requestId,
    professionalId,
    expectedAssignmentId,
  }: CancelAssignmentInput): Promise<ReopenedRequestResult> {
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', requestId)
      const assignmentReference = doc(
        requestReference,
        'assignments',
        expectedAssignmentId,
      )
      const [requestSnapshot, assignmentSnapshot] = await Promise.all([
        transaction.get(requestReference),
        transaction.get(assignmentReference),
      ])
      const request = requestFromSnapshot(requestSnapshot)
      if (!assignmentSnapshot.exists()) {
        throw new ServiceRequestError('stale-assignment', 'A atribuição informada não existe.')
      }
      const assignment = assignmentSnapshot.data()

      if (
        assignment.professionalId === professionalId &&
        assignment.status === 'CANCELLED' &&
        typeof assignment.endedEventId === 'string'
      ) {
        const eventSnapshot = await transaction.get(
          doc(requestReference, 'events', assignment.endedEventId),
        )
        if (
          !eventSnapshot.exists() ||
          eventSnapshot.data().type !== 'PROFESSIONAL_CANCELLED_AND_REOPENED' ||
          eventSnapshot.data().requestId !== requestId ||
          eventSnapshot.data().actorId !== professionalId
        ) {
          throw new ServiceRequestError('unknown', 'O cancelamento anterior está inconsistente.')
        }
        return {
          requestId,
          cancelledAssignmentId: expectedAssignmentId,
          reopenedRound: Number(assignment.round) + 1,
          idempotent: true,
        }
      }

      if (
        request.status === 'IN_PROGRESS' ||
        !isProfessionalCancellationAllowed(now(), request.periodStartAt)
      ) {
        throw new ServiceRequestError(
          'intervention-required',
          'O atendimento exige intervenção administrativa para ser alterado.',
        )
      }
      if (request.status === 'COMPLETED' || request.status === 'CANCELLED') {
        throw new ServiceRequestError(
          'intervention-required',
          'Esta solicitação não pode ser reaberta.',
        )
      }
      if (
        request.status !== 'ASSIGNED' ||
        request.assignedProfessionalId !== professionalId
      ) {
        throw new ServiceRequestError(
          'not-assigned-professional',
          'Somente o profissional atualmente designado pode cancelar.',
        )
      }
      if (
        request.currentAssignmentId !== expectedAssignmentId ||
        assignment.status !== 'ACTIVE' ||
        assignment.professionalId !== professionalId
      ) {
        throw new ServiceRequestError(
          'stale-assignment',
          'A atribuição mudou. Atualize os dados antes de tentar novamente.',
        )
      }

      const reservationId = stringValue(assignment, 'reservationId')
      const reservationReference = doc(
        firestore,
        'professionalReservations',
        professionalId,
        'slots',
        reservationId,
      )
      const reopenedRound = request.round + 1
      const nextRoundId = roundDocumentId(reopenedRound)
      const nextRoundReference = doc(requestReference, 'rounds', nextRoundId)
      const [reservationSnapshot, nextRoundSnapshot] = await Promise.all([
        transaction.get(reservationReference),
        transaction.get(nextRoundReference),
      ])

      await coordinator?.afterRead('cancel', `${requestId}:${professionalId}`)

      if (
        !reservationSnapshot.exists() ||
        reservationSnapshot.data().requestId !== requestId ||
        reservationSnapshot.data().assignmentId !== expectedAssignmentId
      ) {
        throw new ServiceRequestError('unknown', 'A reserva da atribuição está inconsistente.')
      }
      if (nextRoundSnapshot.exists()) {
        throw new ServiceRequestError('round-changed', 'A solicitação já foi reaberta.')
      }

      const eventId = cancellationEventId(request.round)
      const timestamp = serverTimestamp()
      transaction.update(requestReference, {
        status: 'OPEN',
        round: reopenedRound,
        currentRoundId: nextRoundId,
        assignedProfessionalId: null,
        currentAssignmentId: null,
        reopenReason: 'PROFESSIONAL_CANCELLATION',
        excludedProfessionalIds: [professionalId],
        updatedAt: timestamp,
      })
      transaction.update(assignmentReference, {
        status: 'CANCELLED',
        endedAt: timestamp,
        endReason: 'PROFESSIONAL_CANCELLATION',
        endedEventId: eventId,
      })
      transaction.delete(reservationReference)
      transaction.set(nextRoundReference, {
        roundId: nextRoundId,
        requestId,
        round: reopenedRound,
        status: 'OPEN',
        reason: 'PROFESSIONAL_CANCELLATION',
        excludedProfessionalIds: [professionalId],
        previousAssignmentId: expectedAssignmentId,
        openedAt: timestamp,
        closedAt: null,
        closedReason: null,
        updatedAt: timestamp,
      })
      transaction.set(doc(requestReference, 'events', eventId), {
        eventId,
        entityType: 'SERVICE_REQUEST',
        entityId: requestId,
        requestId,
        type: 'PROFESSIONAL_CANCELLED_AND_REOPENED',
        reasonCode: 'PROFESSIONAL_CANCELLATION',
        actorId: professionalId,
        actorRole: 'PROFESSIONAL',
        round: request.round,
        targetRound: reopenedRound,
        assignmentId: expectedAssignmentId,
        fromStatus: 'ASSIGNED',
        toStatus: 'OPEN',
        createdAt: timestamp,
      })

      return {
        requestId,
        cancelledAssignmentId: expectedAssignmentId,
        reopenedRound,
        idempotent: false,
      }
    })
  }

  return {
    listRequestHistory,
    listOpenOpportunities,
    acceptRequest,
    refuseRequest,
    cancelAssignment,
  }
}
