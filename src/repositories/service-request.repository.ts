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
  getOpportunityIneligibilityReason,
  hasCurrentApprovedProfessionalAccess,
  opportunityAvailabilitySlot,
  opportunityOperationalProfile,
  opportunityProfessionalProfile,
  type OpportunityEligibilityContext,
} from '../services/opportunity-eligibility'
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
  OPPORTUNITY_QUERY_VERSION,
  type OpportunityPage,
  type OpportunityPageCursor,
  type ProfessionalOpportunitySummary,
  type ServicePeriod,
  type ServiceRequestEvent,
  type ServiceRequestPrivateData,
  type ServiceRequestSummary,
} from '../types/service-request'

export interface TransactionCoordinator {
  afterRead(operation: 'create' | 'client-cancel' | 'accept' | 'refuse' | 'cancel', key: string): Promise<void>
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
  pageSize?: number
  cursor?: OpportunityPageCursor | null
}

export interface ServiceHistoryQuery {
  requestId: string
  actorId?: string
  pageSize?: number
}

export const OPPORTUNITY_QUERY_LIMIT = 50

export interface CreateRequestInput {
  operationKey: string
  clientId: string
  categoryId: string
  specialtyId: string
  cityIbgeCode: string
  serviceDate: string
  period: ServicePeriod
  periodStartAt: Date
  acceptUntil: Date
  contactName: string
  contactPhone: string
  description: string
  address: ServiceRequestPrivateData['address']
}

export interface CreatedRequestResult {
  request: ServiceRequestSummary
  idempotent: boolean
}

export interface CancelledClientRequestResult {
  request: ServiceRequestSummary
  idempotent: boolean
}

export interface AcceptOpportunityInput {
  requestId: string
  professionalId: string
  expectedRound: number
}

export type DeclineOpportunityInput = AcceptOpportunityInput
export type AcceptRequestInput = AcceptOpportunityInput
export type RefuseRequestInput = DeclineOpportunityInput

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
    operationKey: stringValue(data, 'operationKey'),
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
    type === 'REQUEST_CREATED'
      ? 'CLIENT_REQUEST'
      : type === 'REQUEST_CANCELLED'
        ? 'CLIENT_CANCELLATION'
      : type === 'REQUEST_ASSIGNED'
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
    actorRole: data.actorRole === 'CLIENT' ? 'CLIENT' : 'PROFESSIONAL',
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

function eligibilityContext(
  professionalId: string,
  operationalData: DocumentData | undefined,
  profileData: DocumentData | undefined,
  availabilityData: DocumentData | undefined,
  reservationExists: boolean,
  refusalExists: boolean,
  currentTime: Date,
): OpportunityEligibilityContext {
  return {
    professionalId,
    operationalProfile: opportunityOperationalProfile(operationalData),
    professionalProfile: opportunityProfessionalProfile(profileData),
    availability: opportunityAvailabilitySlot(availabilityData),
    reservationExists,
    refusalExists,
    now: currentTime,
  }
}

function assertEligibleOpportunity(
  request: ServiceRequestSummary,
  context: OpportunityEligibilityContext,
) {
  const reason = getOpportunityIneligibilityReason(request, context)
  if (!reason) return

  if (reason === 'expired-request') {
    throw new ServiceRequestError(
      'request-expired',
      'O período permitido para aceitar esta solicitação terminou.',
    )
  }
  if (reason === 'refused-round') {
    throw new ServiceRequestError(
      'already-refused',
      'O profissional recusou esta rodada.',
    )
  }
  if (reason === 'reserved-slot') {
    throw new ServiceRequestError(
      'slot-conflict',
      'O período já está reservado.',
    )
  }
  if (reason === 'professional-access') {
    throw new ServiceRequestError(
      'professional-restricted',
      'Seu cadastro profissional não está aprovado, atualizado e ativo.',
    )
  }
  if (reason === 'excluded-from-round') {
    throw new ServiceRequestError(
      'excluded-from-round',
      'Você não participa desta rodada de distribuição.',
    )
  }
  throw new ServiceRequestError(
    'not-eligible',
    reason === 'unavailable-slot'
      ? 'O período não está disponível.'
      : 'O profissional não atende aos critérios desta oportunidade.',
  )
}

function assertOpenRound(request: ServiceRequestSummary, expectedRound: number) {
  if (request.round !== expectedRound) {
    throw new ServiceRequestError(
      'round-changed',
      'A rodada da solicitação foi alterada.',
    )
  }
  if (request.status !== 'OPEN') {
    if (request.status === 'ASSIGNED') {
      throw new ServiceRequestError(
        'opportunity-taken',
        'Outro profissional já confirmou esta oportunidade.',
      )
    }
    throw new ServiceRequestError(
      'not-open',
      'Esta oportunidade não está mais aberta para aceite.',
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

function opportunityPageSize(pageSize?: number) {
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    return OPPORTUNITY_QUERY_LIMIT
  }
  return Math.max(1, Math.min(Math.trunc(pageSize), OPPORTUNITY_QUERY_LIMIT))
}

function assertValidOpportunityCursor(cursor?: OpportunityPageCursor | null) {
  if (!cursor) return
  if (
    cursor.version !== OPPORTUNITY_QUERY_VERSION ||
    !(cursor.acceptUntil instanceof Date) ||
    Number.isNaN(cursor.acceptUntil.getTime()) ||
    !cursor.requestId
  ) {
    throw new ServiceRequestError(
      'validation',
      'O cursor da consulta de oportunidades é inválido.',
    )
  }
}

function professionalOpportunitySummary(
  request: ServiceRequestSummary,
): ProfessionalOpportunitySummary {
  return {
    requestId: request.requestId,
    categoryId: request.categoryId,
    specialtyId: request.specialtyId,
    cityIbgeCode: request.cityIbgeCode,
    serviceDate: request.serviceDate,
    period: request.period,
    periodStartAt: request.periodStartAt,
    acceptUntil: request.acceptUntil,
    round: request.round,
    reopenReason: request.reopenReason,
  }
}

export function createServiceRequestRepository({
  firestore,
  now = () => new Date(),
  coordinator,
}: RepositoryDependencies) {
  async function assertProfessionalOpportunityAccess(professionalId: string) {
    const [operationalSnapshot, profileSnapshot] = await Promise.all([
      getDoc(
        doc(
          firestore,
          'professionalOperationalProfiles',
          professionalId,
        ),
      ),
      getDoc(doc(firestore, 'professionalProfiles', professionalId)),
    ])
    const hasAccess = hasCurrentApprovedProfessionalAccess({
      professionalId,
      operationalProfile: opportunityOperationalProfile(
        operationalSnapshot.data(),
      ),
      professionalProfile: opportunityProfessionalProfile(
        profileSnapshot.data(),
      ),
    })
    if (!hasAccess) {
      throw new ServiceRequestError(
        'professional-restricted',
        'Seu cadastro profissional precisa estar aprovado, atualizado e ativo.',
      )
    }
  }

  async function diagnoseOpportunityAction(input: AcceptOpportunityInput) {
    const requestReference = doc(
      firestore,
      'serviceRequests',
      input.requestId,
    )
    const request = requestFromSnapshot(await getDoc(requestReference))
    assertOpenRound(request, input.expectedRound)
    if (request.clientId === input.professionalId) {
      throw new ServiceRequestError(
        'not-eligible',
        'O cliente não pode aceitar o próprio pedido.',
      )
    }
    if (request.excludedProfessionalIds.includes(input.professionalId)) {
      throw new ServiceRequestError(
        'excluded-from-round',
        'Você não participa desta rodada de distribuição.',
      )
    }

    const slotId = serviceSlotId(request.serviceDate, request.period)
    const roundReference = doc(
      requestReference,
      'rounds',
      request.currentRoundId,
    )
    const [
      roundSnapshot,
      operationalSnapshot,
      profileSnapshot,
      availabilitySnapshot,
      refusalSnapshot,
      reservationSnapshot,
    ] = await Promise.all([
      getDoc(roundReference),
      getDoc(
        doc(
          firestore,
          'professionalOperationalProfiles',
          input.professionalId,
        ),
      ),
      getDoc(
        doc(firestore, 'professionalProfiles', input.professionalId),
      ),
      getDoc(
        doc(
          firestore,
          'professionalAvailability',
          input.professionalId,
          'slots',
          slotId,
        ),
      ),
      getDoc(
        doc(
          roundReference,
          'refusals',
          input.professionalId,
        ),
      ),
      getDoc(
        doc(
          firestore,
          'professionalReservations',
          input.professionalId,
          'slots',
          slotId,
        ),
      ),
    ])
    if (!roundSnapshot.exists() || roundSnapshot.data().status !== 'OPEN') {
      throw new ServiceRequestError(
        'round-changed',
        'A rodada da oportunidade não está mais aberta.',
      )
    }
    assertEligibleOpportunity(
      request,
      eligibilityContext(
        input.professionalId,
        operationalSnapshot.data(),
        profileSnapshot.data(),
        availabilitySnapshot.data(),
        reservationSnapshot.exists(),
        refusalSnapshot.exists(),
        now(),
      ),
    )
  }

  async function getOwnRequest(requestId: string, clientId: string) {
    const snapshot = await getDoc(doc(firestore, 'serviceRequests', requestId))
    const request = requestFromSnapshot(snapshot)
    if (request.clientId !== clientId) {
      throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
    }
    return request
  }

  async function createRequest(
    input: CreateRequestInput,
  ): Promise<CreatedRequestResult> {
    const requestId = input.operationKey
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', requestId)
      const privateReference = doc(firestore, 'serviceRequestPrivate', requestId)
      const roundReference = doc(requestReference, 'rounds', 'round-1')
      const eventReference = doc(requestReference, 'events', 'created')
      const requestSnapshot = await transaction.get(requestReference)

      await coordinator?.afterRead('create', requestId)

      if (requestSnapshot.exists()) {
        const existing = requestFromSnapshot(requestSnapshot)
        if (
          existing.clientId !== input.clientId ||
          existing.operationKey !== input.operationKey
        ) {
          throw new ServiceRequestError(
            'already-created',
            'Esta chave de envio já foi usada em outra solicitação.',
          )
        }
        return { request: existing, idempotent: true }
      }

      const timestamp = serverTimestamp()
      transaction.set(requestReference, {
        requestId,
        operationKey: input.operationKey,
        clientId: input.clientId,
        categoryId: input.categoryId,
        specialtyId: input.specialtyId,
        cityIbgeCode: input.cityIbgeCode,
        serviceDate: input.serviceDate,
        period: input.period,
        periodStartAt: Timestamp.fromDate(input.periodStartAt),
        acceptUntil: Timestamp.fromDate(input.acceptUntil),
        status: 'OPEN',
        round: 1,
        currentRoundId: 'round-1',
        assignedProfessionalId: null,
        currentAssignmentId: null,
        reopenReason: null,
        excludedProfessionalIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      transaction.set(privateReference, {
        requestId,
        operationKey: input.operationKey,
        clientId: input.clientId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        notes: input.description,
        address: { ...input.address, complement: input.address.complement ?? '' },
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      transaction.set(roundReference, {
        roundId: 'round-1',
        requestId,
        round: 1,
        status: 'OPEN',
        reason: 'INITIAL',
        excludedProfessionalIds: [],
        previousAssignmentId: null,
        openedAt: timestamp,
        closedAt: null,
        closedReason: null,
        updatedAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId: 'created',
        entityType: 'SERVICE_REQUEST',
        entityId: requestId,
        requestId,
        type: 'REQUEST_CREATED',
        reasonCode: 'CLIENT_REQUEST',
        actorId: input.clientId,
        actorRole: 'CLIENT',
        round: 1,
        assignmentId: null,
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        createdAt: timestamp,
      })

      return {
        request: {
          requestId,
          operationKey: input.operationKey,
          clientId: input.clientId,
          categoryId: input.categoryId,
          specialtyId: input.specialtyId,
          cityIbgeCode: input.cityIbgeCode,
          serviceDate: input.serviceDate,
          period: input.period,
          periodStartAt: input.periodStartAt,
          acceptUntil: input.acceptUntil,
          status: 'OPEN',
          round: 1,
          currentRoundId: 'round-1',
          assignedProfessionalId: null,
          currentAssignmentId: null,
          reopenReason: null,
          excludedProfessionalIds: [],
        },
        idempotent: false,
      }
    })
  }

  async function cancelOwnRequest(
    requestId: string,
    clientId: string,
  ): Promise<CancelledClientRequestResult> {
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', requestId)
      const requestSnapshot = await transaction.get(requestReference)
      const request = requestFromSnapshot(requestSnapshot)
      if (request.clientId !== clientId) {
        throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
      }

      const eventReference = doc(
        requestReference,
        'events',
        'cancelled-by-client',
      )
      if (request.status === 'CANCELLED') {
        const eventSnapshot = await transaction.get(eventReference)
        if (
          !eventSnapshot.exists() ||
          eventSnapshot.data().type !== 'REQUEST_CANCELLED' ||
          eventSnapshot.data().actorId !== clientId
        ) {
          throw new ServiceRequestError(
            'unknown',
            'O histórico do cancelamento está inconsistente.',
          )
        }
        return { request, idempotent: true }
      }
      if (request.status !== 'OPEN') {
        throw new ServiceRequestError(
          'not-open',
          'Somente uma solicitação em procura pode ser cancelada aqui.',
        )
      }

      const roundReference = doc(
        requestReference,
        'rounds',
        request.currentRoundId,
      )
      const [roundSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(roundReference),
        transaction.get(eventReference),
      ])
      await coordinator?.afterRead('client-cancel', requestId)
      if (
        !roundSnapshot.exists() ||
        roundSnapshot.data().status !== 'OPEN' ||
        eventSnapshot.exists()
      ) {
        throw new ServiceRequestError(
          'round-changed',
          'A rodada da solicitação foi alterada.',
        )
      }

      const timestamp = serverTimestamp()
      transaction.update(requestReference, {
        status: 'CANCELLED',
        updatedAt: timestamp,
      })
      transaction.update(roundReference, {
        status: 'CLOSED',
        closedAt: timestamp,
        closedReason: 'CLIENT_CANCELLATION',
        updatedAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId: 'cancelled-by-client',
        entityType: 'SERVICE_REQUEST',
        entityId: requestId,
        requestId,
        type: 'REQUEST_CANCELLED',
        reasonCode: 'CLIENT_CANCELLATION',
        actorId: clientId,
        actorRole: 'CLIENT',
        round: request.round,
        assignmentId: null,
        fromStatus: 'OPEN',
        toStatus: 'CANCELLED',
        createdAt: timestamp,
      })

      return {
        request: { ...request, status: 'CANCELLED' },
        idempotent: false,
      }
    })
  }

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

  async function listOpenOpportunities(
    input: OpportunityQuery,
    professionalId: string,
  ): Promise<OpportunityPage> {
    assertValidOpportunityCursor(input.cursor)
    const currentTime = now()
    const slotId = serviceSlotId(input.serviceDate, input.period)
    const operationalReference = doc(
      firestore,
      'professionalOperationalProfiles',
      professionalId,
    )
    const profileReference = doc(
      firestore,
      'professionalProfiles',
      professionalId,
    )
    const availabilityReference = doc(
      firestore,
      'professionalAvailability',
      professionalId,
      'slots',
      slotId,
    )
    const reservationReference = doc(
      firestore,
      'professionalReservations',
      professionalId,
      'slots',
      slotId,
    )
    const [operationalSnapshot, profileSnapshot, availabilitySnapshot, reservationSnapshot] =
      await Promise.all([
        getDoc(operationalReference),
        getDoc(profileReference),
        getDoc(availabilityReference),
        getDoc(reservationReference),
      ])
    const baseContext = eligibilityContext(
      professionalId,
      operationalSnapshot.data(),
      profileSnapshot.data(),
      availabilitySnapshot.data(),
      reservationSnapshot.exists(),
      false,
      currentTime,
    )

    if (!hasCurrentApprovedProfessionalAccess(baseContext)) {
      throw new ServiceRequestError(
        'not-eligible',
        'Seu cadastro precisa estar aprovado, atual e ativo para consultar oportunidades.',
      )
    }
    const operational = baseContext.operationalProfile!
    if (
      !operational.approvedCategoryIds.includes(input.categoryId) ||
      !operational.approvedSpecialtyIds.includes(input.specialtyId) ||
      !operational.eligibleCityIbgeCodes.includes(input.cityIbgeCode)
    ) {
      throw new ServiceRequestError(
        'not-eligible',
        'Os filtros não pertencem ao cadastro profissional aprovado.',
      )
    }
    if (
      !baseContext.availability ||
      baseContext.availability.professionalId !== professionalId ||
      baseContext.availability.serviceDate !== input.serviceDate ||
      baseContext.availability.period !== input.period ||
      !baseContext.availability.available ||
      baseContext.reservationExists
    ) {
      return { items: [], nextCursor: null }
    }

    const pageLimit = opportunityPageSize(input.pageSize)
    const constraints = [
      where('status', '==', 'OPEN'),
      where('categoryId', '==', input.categoryId),
      where('specialtyId', '==', input.specialtyId),
      where('cityIbgeCode', '==', input.cityIbgeCode),
      where('serviceDate', '==', input.serviceDate),
      where('period', '==', input.period),
      where('acceptUntil', '>', Timestamp.fromDate(currentTime)),
      orderBy('acceptUntil', 'asc'),
      orderBy(documentId(), 'asc'),
      ...(input.cursor
        ? [
            startAfter(
              Timestamp.fromDate(input.cursor.acceptUntil),
              input.cursor.requestId,
            ),
          ]
        : []),
      limit(pageLimit),
    ]
    const snapshot = await getDocs(
      query(collection(firestore, 'serviceRequests'), ...constraints),
    )
    const requests = snapshot.docs.map(requestFromSnapshot)
    const refusalSnapshots = await Promise.all(
      requests.map((request) =>
        getDoc(
          doc(
            firestore,
            'serviceRequests',
            request.requestId,
            'rounds',
            request.currentRoundId,
            'refusals',
            professionalId,
          ),
        ),
      ),
    )
    const items = requests
      .filter(
        (request, index) =>
          getOpportunityIneligibilityReason(request, {
            ...baseContext,
            refusalExists: refusalSnapshots[index].exists(),
            now: now(),
          }) === null,
      )
      .map(professionalOpportunitySummary)
    const lastRequest = requests.at(-1)

    return {
      items,
      nextCursor:
        requests.length === pageLimit && lastRequest
          ? {
              version: OPPORTUNITY_QUERY_VERSION,
              acceptUntil: lastRequest.acceptUntil,
              requestId: lastRequest.requestId,
            }
          : null,
    }
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
        throw new ServiceRequestError(
          'excluded-from-round',
          'Você não participa desta rodada de distribuição.',
        )
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
      assertEligibleOpportunity(
        request,
        eligibilityContext(
          professionalId,
          operationalSnapshot.data(),
          profileSnapshot.data(),
          availabilitySnapshot.data(),
          reservationSnapshot.exists(),
          refusalSnapshot.exists(),
          now(),
        ),
      )

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
      const slotId = serviceSlotId(request.serviceDate, request.period)
      const availabilityReference = doc(
        firestore,
        'professionalAvailability',
        professionalId,
        'slots',
        slotId,
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
        refusalSnapshot,
        operationalSnapshot,
        profileSnapshot,
        availabilitySnapshot,
        reservationSnapshot,
      ] =
        await Promise.all([
          transaction.get(roundReference),
          transaction.get(refusalReference),
          transaction.get(operationalReference),
          transaction.get(profileReference),
          transaction.get(availabilityReference),
          transaction.get(reservationReference),
        ])

      await coordinator?.afterRead('refuse', `${requestId}:${professionalId}`)

      if (roundSnapshot.data()?.status !== 'OPEN') {
        throw new ServiceRequestError('round-changed', 'A rodada não está mais aberta.')
      }
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
      assertEligibleOpportunity(
        request,
        eligibilityContext(
          professionalId,
          operationalSnapshot.data(),
          profileSnapshot.data(),
          availabilitySnapshot.data(),
          reservationSnapshot.exists(),
          false,
          now(),
        ),
      )

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
    assertProfessionalOpportunityAccess,
    diagnoseOpportunityAction,
    getOwnRequest,
    createRequest,
    cancelOwnRequest,
    listRequestHistory,
    listOpenOpportunities,
    acceptOpportunity: acceptRequest,
    declineOpportunity: refuseRequest,
    acceptRequest,
    refuseRequest,
    cancelAssignment,
  }
}
