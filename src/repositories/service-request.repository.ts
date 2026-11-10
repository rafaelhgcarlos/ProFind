import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
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
  type QueryConstraint,
  type Unsubscribe,
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
  clientEditEventId,
  isAcceptanceAllowed,
  isProfessionalCancellationAllowed,
  isServiceStartAllowed,
  refusalEventId,
  roundDocumentId,
  serviceSlotId,
  startEventId,
} from '../services/service-period-policy'
import {
  ServiceRequestError,
  SERVICE_EVENT_HISTORY_LIMIT,
  OPPORTUNITY_FEED_CURSOR_VERSION,
  OPPORTUNITY_QUERY_VERSION,
  type OpportunityFeedCursor,
  type OwnServiceRequestDetails,
  type OpportunityFeedPage,
  type OpportunityPage,
  type OpportunityPageCursor,
  type ProfessionalOpportunitySummary,
  type ProfessionalAssignmentDetails,
  type ProfessionalAppointmentDetails,
  type ProfessionalAppointmentsCursor,
  type ProfessionalAppointmentsPage,
  type ProfessionalAppointmentSummary,
  type ServicePeriod,
  type ServiceRequestEvent,
  type ServiceRequestPrivateData,
  type ServiceRequestSummary,
} from '../types/service-request'
import type { ServiceCatalog } from '../types/catalog'

export interface TransactionCoordinator {
  afterRead(operation: 'create' | 'client-edit' | 'client-cancel' | 'accept' | 'refuse' | 'cancel' | 'start', key: string): Promise<void>
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

export interface OpportunityFeedPageInput {
  catalog: ServiceCatalog
  pageSize?: number
  cursor?: OpportunityFeedCursor | null
}

export interface OpportunityFeedPageSnapshot {
  page: OpportunityFeedPage
  fromCache: boolean
}

export interface OpportunityFeedListeners {
  onAccessChange(eligible: boolean): void
  onPage(snapshot: OpportunityFeedPageSnapshot): void
  onError(error: unknown): void
}

export interface ProfessionalAppointmentsPageInput {
  pageSize?: number
  cursor?: ProfessionalAppointmentsCursor | null
}

export interface ProfessionalAppointmentsPageSnapshot {
  page: ProfessionalAppointmentsPage
  fromCache: boolean
}

export interface ProfessionalAppointmentsListeners {
  onPage(snapshot: ProfessionalAppointmentsPageSnapshot): void
  onError(error: unknown): void
}

export interface ProfessionalAppointmentDetailsSnapshot {
  details: ProfessionalAppointmentDetails
  fromCache: boolean
}

export interface ProfessionalAppointmentDetailsListeners {
  onDetails(snapshot: ProfessionalAppointmentDetailsSnapshot): void
  onUnavailable(error: ServiceRequestError): void
  onError(error: unknown): void
}

export interface OwnRequestDetailsSnapshot {
  details: OwnServiceRequestDetails
  fromCache: boolean
}

export interface OwnRequestDetailsListeners {
  onDetails(snapshot: OwnRequestDetailsSnapshot): void
  onError(error: unknown): void
}

export interface ServiceHistoryQuery {
  requestId: string
  actorId?: string
  pageSize?: number
}

export const OPPORTUNITY_QUERY_LIMIT = 50
export const OPPORTUNITY_FEED_PAGE_SIZE = 12
export const PROFESSIONAL_APPOINTMENTS_PAGE_SIZE = 12

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

export interface UpdateRequestInput {
  requestId: string
  operationKey: string
  clientId: string
  expectedRound: number
  categoryId: string
  specialtyId: string
  cityIbgeCode: string
  serviceDate: string
  period: ServicePeriod
  periodStartAt: Date
  acceptUntil: Date
  description: string
  address: ServiceRequestPrivateData['address']
}

export interface UpdatedRequestResult {
  request: ServiceRequestSummary
  idempotent: boolean
}

export interface CancelClientRequestInput {
  requestId: string
  operationKey: string
  clientId: string
  expectedRound: number
  expectedAssignmentId: string | null
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
  reason: string
}

export interface StartAssignmentInput {
  requestId: string
  professionalId: string
  expectedAssignmentId: string
  expectedRound: number
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
  replacementSearchOpen: boolean
  idempotent: boolean
}

export interface StartedAssignmentResult {
  requestId: string
  assignmentId: string
  round: number
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

function privateRequestFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ServiceRequestPrivateData {
  if (!snapshot.exists()) {
    throw new ServiceRequestError('not-found', 'Dados privados da solicitação não encontrados.')
  }
  const data = snapshot.data()
  const address = data.address as DocumentData | undefined
  if (!address) {
    throw new ServiceRequestError('unknown', 'Endereço da solicitação inválido.')
  }
  return {
    requestId: stringValue(data, 'requestId'),
    operationKey: stringValue(data, 'operationKey'),
    clientId: stringValue(data, 'clientId'),
    contactName: stringValue(data, 'contactName'),
    contactPhone: stringValue(data, 'contactPhone'),
    notes: stringValue(data, 'notes'),
    address: {
      street: stringValue(address, 'street'),
      number: stringValue(address, 'number'),
      complement: stringValue(address, 'complement'),
      neighborhood: stringValue(address, 'neighborhood'),
      city: stringValue(address, 'city'),
      stateCode: stringValue(address, 'stateCode'),
      postalCode: stringValue(address, 'postalCode'),
      ibgeCode: stringValue(address, 'ibgeCode'),
    },
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
      : type === 'REQUEST_EDITED'
        ? 'CLIENT_EDIT'
      : type === 'REQUEST_CANCELLED'
        ? 'CLIENT_CANCELLATION'
      : type === 'REQUEST_ASSIGNED'
      ? 'PROFESSIONAL_ACCEPTANCE'
      : type === 'PROFESSIONAL_REFUSED'
        ? 'PROFESSIONAL_REFUSAL'
        : type === 'SERVICE_STARTED'
          ? 'PROFESSIONAL_START'
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
    ...(typeof data.operationKey === 'string'
      ? { operationKey: data.operationKey }
      : {}),
    ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
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

function professionalAppointmentSummary(
  request: ServiceRequestSummary,
): ProfessionalAppointmentSummary {
  if (
    (request.status !== 'ASSIGNED' && request.status !== 'IN_PROGRESS') ||
    !request.currentAssignmentId
  ) {
    throw new ServiceRequestError(
      'stale-assignment',
      'Este atendimento não possui uma atribuição atual válida.',
    )
  }
  return {
    requestId: request.requestId,
    assignmentId: request.currentAssignmentId,
    categoryId: request.categoryId,
    specialtyId: request.specialtyId,
    serviceDate: request.serviceDate,
    period: request.period,
    periodStartAt: request.periodStartAt,
    status: request.status,
    round: request.round,
  }
}

function professionalAppointmentsPageSize(pageSize?: number) {
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    return PROFESSIONAL_APPOINTMENTS_PAGE_SIZE
  }
  return Math.max(1, Math.min(Math.trunc(pageSize), 24))
}

function assertValidAppointmentsCursor(
  cursor?: ProfessionalAppointmentsCursor | null,
) {
  if (!cursor) return
  if (!cursor.requestId) {
    throw new ServiceRequestError(
      'validation',
      'O cursor da lista de atendimentos é inválido.',
    )
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

  async function diagnoseClientCancellation(
    requestId: string,
    clientId: string,
    expectedRound?: number,
    expectedAssignmentId?: string | null,
  ) {
    const request = requestFromSnapshot(
      await getDoc(doc(firestore, 'serviceRequests', requestId)),
    )
    if (request.clientId !== clientId) {
      throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
    }
    if (
      expectedRound !== undefined &&
      (request.round !== expectedRound ||
        request.currentAssignmentId !== expectedAssignmentId)
    ) {
      throw new ServiceRequestError(
        'round-changed',
        'A solicitação mudou. Recarregue os dados antes de cancelar.',
      )
    }
    if (request.status !== 'OPEN' && request.status !== 'ASSIGNED') {
      throw new ServiceRequestError(
        'intervention-required',
        'Este atendimento não pode ser cancelado por aqui. Procure o suporte.',
      )
    }
    if (!isProfessionalCancellationAllowed(now(), request.periodStartAt)) {
      throw new ServiceRequestError(
        'intervention-required',
        'O período do atendimento já começou. Procure o suporte.',
      )
    }
  }

  async function getOwnRequest(requestId: string, clientId: string) {
    const snapshot = await getDoc(doc(firestore, 'serviceRequests', requestId))
    const request = requestFromSnapshot(snapshot)
    if (request.clientId !== clientId) {
      throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
    }
    return request
  }

  async function getOwnRequestDetails(
    requestId: string,
    clientId: string,
  ): Promise<OwnServiceRequestDetails> {
    const [requestSnapshot, privateSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'serviceRequests', requestId)),
      getDoc(doc(firestore, 'serviceRequestPrivate', requestId)),
    ])
    const request = requestFromSnapshot(requestSnapshot)
    const privateData = privateRequestFromSnapshot(privateSnapshot)
    if (request.clientId !== clientId || privateData.clientId !== clientId) {
      throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
    }
    return { request, privateData }
  }

  function subscribeOwnRequestDetails(
    requestId: string,
    clientId: string,
    listeners: OwnRequestDetailsListeners,
  ) {
    let requestSnapshot: DocumentSnapshot<DocumentData> | undefined
    let privateSnapshot: DocumentSnapshot<DocumentData> | undefined

    const emit = () => {
      if (!requestSnapshot || !privateSnapshot) return
      try {
        const request = requestFromSnapshot(requestSnapshot)
        const privateData = privateRequestFromSnapshot(privateSnapshot)
        if (request.clientId !== clientId || privateData.clientId !== clientId) {
          throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
        }
        listeners.onDetails({
          details: { request, privateData },
          fromCache:
            requestSnapshot.metadata.fromCache || privateSnapshot.metadata.fromCache,
        })
      } catch (error) {
        listeners.onError(error)
      }
    }

    const requestUnsubscribe = onSnapshot(
      doc(firestore, 'serviceRequests', requestId),
      { includeMetadataChanges: true },
      (snapshot) => {
        requestSnapshot = snapshot
        emit()
      },
      listeners.onError,
    )
    const privateUnsubscribe = onSnapshot(
      doc(firestore, 'serviceRequestPrivate', requestId),
      { includeMetadataChanges: true },
      (snapshot) => {
        privateSnapshot = snapshot
        emit()
      },
      listeners.onError,
    )
    return () => {
      requestUnsubscribe()
      privateUnsubscribe()
    }
  }

  async function getCurrentProfessionalAssignment(
    requestId: string,
    expectedAssignmentId: string,
    professionalId: string,
  ): Promise<ProfessionalAssignmentDetails> {
    const requestReference = doc(firestore, 'serviceRequests', requestId)
    const [requestSnapshot, assignmentSnapshot] = await Promise.all([
      getDoc(requestReference),
      getDoc(doc(requestReference, 'assignments', expectedAssignmentId)),
    ])
    const request = requestFromSnapshot(requestSnapshot)
    if (
      !assignmentSnapshot.exists() ||
      assignmentSnapshot.data().professionalId !== professionalId ||
      assignmentSnapshot.data().status !== 'ACTIVE' ||
      request.status !== 'ASSIGNED' ||
      request.assignedProfessionalId !== professionalId ||
      request.currentAssignmentId !== expectedAssignmentId
    ) {
      throw new ServiceRequestError(
        'stale-assignment',
        'Este atendimento não está mais atribuído a você.',
      )
    }
    return {
      opportunity: professionalOpportunitySummary(request),
      assignmentId: expectedAssignmentId,
    }
  }

  function subscribeProfessionalAppointmentsPage(
    input: ProfessionalAppointmentsPageInput,
    professionalId: string,
    listeners: ProfessionalAppointmentsListeners,
  ) {
    assertValidAppointmentsCursor(input.cursor)
    const pageSize = professionalAppointmentsPageSize(input.pageSize)
    const constraints: QueryConstraint[] = [
      where('assignedProfessionalId', '==', professionalId),
      where('status', 'in', ['ASSIGNED', 'IN_PROGRESS']),
      orderBy(documentId(), 'asc'),
      limit(pageSize + 1),
    ]
    if (input.cursor) {
      constraints.splice(
        constraints.length - 1,
        0,
        startAfter(input.cursor.requestId),
      )
    }

    return onSnapshot(
      query(collection(firestore, 'serviceRequests'), ...constraints),
      { includeMetadataChanges: true },
      (snapshot) => {
        const visibleDocuments = snapshot.docs.slice(0, pageSize)
        const items = visibleDocuments.map((item) =>
          professionalAppointmentSummary(requestFromSnapshot(item)),
        )
        const last = visibleDocuments.at(-1)
        listeners.onPage({
          page: {
            items,
            nextCursor:
              snapshot.docs.length > pageSize && last
                ? {
                    requestId: last.id,
                  }
                : null,
          },
          fromCache: snapshot.metadata.fromCache,
        })
      },
      listeners.onError,
    )
  }

  function subscribeProfessionalAppointmentDetails(
    requestId: string,
    professionalId: string,
    listeners: ProfessionalAppointmentDetailsListeners,
  ) {
    const requestReference = doc(firestore, 'serviceRequests', requestId)
    let privateUnsubscribe: Unsubscribe | undefined
    let detailGeneration = 0

    const requestUnsubscribe = onSnapshot(
      requestReference,
      { includeMetadataChanges: true },
      (requestSnapshot) => {
        detailGeneration += 1
        const version = detailGeneration
        privateUnsubscribe?.()
        privateUnsubscribe = undefined

        try {
          const request = requestFromSnapshot(requestSnapshot)
          if (
            request.assignedProfessionalId !== professionalId ||
            !request.currentAssignmentId ||
            (request.status !== 'ASSIGNED' && request.status !== 'IN_PROGRESS')
          ) {
            listeners.onUnavailable(
              new ServiceRequestError(
                'stale-assignment',
                'Este atendimento não está mais atribuído a você.',
              ),
            )
            return
          }
          const appointment = professionalAppointmentSummary(request)
          privateUnsubscribe = onSnapshot(
            doc(firestore, 'serviceRequestPrivate', requestId),
            { includeMetadataChanges: true },
            (privateSnapshot) => {
              if (detailGeneration !== version) return
              try {
                listeners.onDetails({
                  details: {
                    appointment,
                    privateData: privateRequestFromSnapshot(privateSnapshot),
                  },
                  fromCache:
                    requestSnapshot.metadata.fromCache ||
                    privateSnapshot.metadata.fromCache,
                })
              } catch (error) {
                listeners.onError(error)
              }
            },
            (error) => {
              if (detailGeneration === version) listeners.onError(error)
            },
          )
        } catch (error) {
          if (error instanceof ServiceRequestError) {
            listeners.onUnavailable(error)
          } else {
            listeners.onError(error)
          }
        }
      },
      listeners.onError,
    )

    return () => {
      detailGeneration += 1
      requestUnsubscribe()
      privateUnsubscribe?.()
    }
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

  async function updateOwnRequest(
    input: UpdateRequestInput,
  ): Promise<UpdatedRequestResult> {
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', input.requestId)
      const privateReference = doc(firestore, 'serviceRequestPrivate', input.requestId)
      const requestSnapshot = await transaction.get(requestReference)
      const request = requestFromSnapshot(requestSnapshot)
      if (request.clientId !== input.clientId) {
        throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
      }

      const nextRound = input.expectedRound + 1
      const nextRoundId = roundDocumentId(nextRound)
      const eventId = clientEditEventId(nextRound)
      const eventReference = doc(requestReference, 'events', eventId)
      const oldRoundReference = doc(
        requestReference,
        'rounds',
        roundDocumentId(input.expectedRound),
      )
      const nextRoundReference = doc(requestReference, 'rounds', nextRoundId)
      const [privateSnapshot, oldRoundSnapshot, nextRoundSnapshot, eventSnapshot] =
        await Promise.all([
          transaction.get(privateReference),
          transaction.get(oldRoundReference),
          transaction.get(nextRoundReference),
          transaction.get(eventReference),
        ])

      if (request.round !== input.expectedRound) {
        if (
          eventSnapshot.exists() &&
          eventSnapshot.data().type === 'REQUEST_EDITED' &&
          eventSnapshot.data().actorId === input.clientId &&
          eventSnapshot.data().operationKey === input.operationKey
        ) {
          return { request, idempotent: true }
        }
        throw new ServiceRequestError(
          'round-changed',
          'A solicitação mudou. Recarregue os dados antes de editar novamente.',
        )
      }
      if (
        request.status !== 'OPEN' ||
        request.assignedProfessionalId !== null ||
        request.currentAssignmentId !== null
      ) {
        throw new ServiceRequestError(
          'not-open',
          'Somente um pedido em procura e sem atribuição pode ser editado.',
        )
      }

      await coordinator?.afterRead('client-edit', input.requestId)
      if (
        !privateSnapshot.exists() ||
        privateSnapshot.data().clientId !== input.clientId ||
        !oldRoundSnapshot.exists() ||
        oldRoundSnapshot.data().status !== 'OPEN' ||
        nextRoundSnapshot.exists() ||
        eventSnapshot.exists()
      ) {
        throw new ServiceRequestError(
          'round-changed',
          'A rodada da solicitação mudou. Recarregue os dados.',
        )
      }

      const timestamp = serverTimestamp()
      transaction.update(requestReference, {
        categoryId: input.categoryId,
        specialtyId: input.specialtyId,
        cityIbgeCode: input.cityIbgeCode,
        serviceDate: input.serviceDate,
        period: input.period,
        periodStartAt: Timestamp.fromDate(input.periodStartAt),
        acceptUntil: Timestamp.fromDate(input.acceptUntil),
        round: nextRound,
        currentRoundId: nextRoundId,
        reopenReason: null,
        excludedProfessionalIds: [],
        updatedAt: timestamp,
      })
      transaction.update(privateReference, {
        notes: input.description,
        address: { ...input.address, complement: input.address.complement ?? '' },
        updatedAt: timestamp,
      })
      transaction.update(oldRoundReference, {
        status: 'CLOSED',
        closedAt: timestamp,
        closedReason: 'CLIENT_EDIT',
        updatedAt: timestamp,
      })
      transaction.set(nextRoundReference, {
        roundId: nextRoundId,
        requestId: input.requestId,
        round: nextRound,
        status: 'OPEN',
        reason: 'CLIENT_EDIT',
        excludedProfessionalIds: [],
        previousAssignmentId: null,
        openedAt: timestamp,
        closedAt: null,
        closedReason: null,
        updatedAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId,
        entityType: 'SERVICE_REQUEST',
        entityId: input.requestId,
        requestId: input.requestId,
        type: 'REQUEST_EDITED',
        reasonCode: 'CLIENT_EDIT',
        actorId: input.clientId,
        actorRole: 'CLIENT',
        round: request.round,
        assignmentId: null,
        targetRound: nextRound,
        operationKey: input.operationKey,
        fromStatus: 'OPEN',
        toStatus: 'OPEN',
        createdAt: timestamp,
      })

      return {
        request: {
          ...request,
          categoryId: input.categoryId,
          specialtyId: input.specialtyId,
          cityIbgeCode: input.cityIbgeCode,
          serviceDate: input.serviceDate,
          period: input.period,
          periodStartAt: input.periodStartAt,
          acceptUntil: input.acceptUntil,
          round: nextRound,
          currentRoundId: nextRoundId,
          reopenReason: null,
          excludedProfessionalIds: [],
        },
        idempotent: false,
      }
    })
  }

  async function cancelOwnRequest(
    input: CancelClientRequestInput,
  ): Promise<CancelledClientRequestResult> {
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', input.requestId)
      const eventReference = doc(requestReference, 'events', 'cancelled-by-client')
      const [requestSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(requestReference),
        transaction.get(eventReference),
      ])
      const request = requestFromSnapshot(requestSnapshot)
      if (request.clientId !== input.clientId) {
        throw new ServiceRequestError('not-found', 'Solicitação não encontrada.')
      }
      if (request.status === 'CANCELLED') {
        if (
          !eventSnapshot.exists() ||
          eventSnapshot.data().type !== 'REQUEST_CANCELLED' ||
          eventSnapshot.data().actorId !== input.clientId ||
          eventSnapshot.data().operationKey !== input.operationKey
        ) {
          throw new ServiceRequestError(
            'stale-assignment',
            'Este cancelamento não corresponde à operação já concluída.',
          )
        }
        return { request, idempotent: true }
      }
      if (
        request.round !== input.expectedRound ||
        request.currentAssignmentId !== input.expectedAssignmentId
      ) {
        throw new ServiceRequestError(
          'round-changed',
          'A solicitação mudou. Recarregue os dados antes de cancelar.',
        )
      }
      if (request.status !== 'OPEN' && request.status !== 'ASSIGNED') {
        throw new ServiceRequestError(
          'intervention-required',
          'Este atendimento não pode ser cancelado por aqui. Procure o suporte.',
        )
      }
      if (!isProfessionalCancellationAllowed(now(), request.periodStartAt)) {
        throw new ServiceRequestError(
          'intervention-required',
          'O período do atendimento já começou. Procure o suporte.',
        )
      }

      const roundReference = doc(requestReference, 'rounds', request.currentRoundId)
      const roundSnapshot = await transaction.get(roundReference)
      let assignmentReference: ReturnType<typeof doc> | null = null
      let reservationReference: ReturnType<typeof doc> | null = null
      let assignmentSnapshot: DocumentSnapshot<DocumentData> | null = null
      let reservationSnapshot: DocumentSnapshot<DocumentData> | null = null

      if (request.status === 'ASSIGNED' && input.expectedAssignmentId) {
        assignmentReference = doc(
          requestReference,
          'assignments',
          input.expectedAssignmentId,
        )
        assignmentSnapshot = await transaction.get(assignmentReference)
        const reservationId = assignmentSnapshot.exists()
          ? stringValue(assignmentSnapshot.data(), 'reservationId')
          : ''
        const professionalId = assignmentSnapshot.exists()
          ? stringValue(assignmentSnapshot.data(), 'professionalId')
          : ''
        reservationReference = doc(
          firestore,
          'professionalReservations',
          professionalId,
          'slots',
          reservationId,
        )
        reservationSnapshot = await transaction.get(reservationReference)
      }

      await coordinator?.afterRead('client-cancel', input.requestId)
      if (!roundSnapshot.exists() || eventSnapshot.exists()) {
        throw new ServiceRequestError('round-changed', 'A solicitação mudou.')
      }
      if (request.status === 'OPEN' && roundSnapshot.data().status !== 'OPEN') {
        throw new ServiceRequestError('round-changed', 'A rodada não está mais aberta.')
      }
      if (
        request.status === 'ASSIGNED' &&
        (!assignmentReference ||
          !assignmentSnapshot?.exists() ||
          assignmentSnapshot.data().status !== 'ACTIVE' ||
          assignmentSnapshot.data().professionalId !== request.assignedProfessionalId ||
          !reservationReference ||
          !reservationSnapshot?.exists() ||
          reservationSnapshot.data().requestId !== input.requestId ||
          reservationSnapshot.data().assignmentId !== input.expectedAssignmentId)
      ) {
        throw new ServiceRequestError(
          'stale-assignment',
          'A atribuição mudou. Recarregue os dados.',
        )
      }

      const timestamp = serverTimestamp()
      transaction.update(requestReference, {
        status: 'CANCELLED',
        assignedProfessionalId: null,
        currentAssignmentId: null,
        updatedAt: timestamp,
      })
      transaction.update(roundReference, {
        status: 'CLOSED',
        closedAt: timestamp,
        closedReason: 'CLIENT_CANCELLATION',
        updatedAt: timestamp,
      })
      if (assignmentReference && reservationReference) {
        transaction.update(assignmentReference, {
          status: 'CANCELLED',
          endedAt: timestamp,
          endReason: 'CLIENT_CANCELLATION',
          endedEventId: 'cancelled-by-client',
        })
        transaction.delete(reservationReference)
      }
      transaction.set(eventReference, {
        eventId: 'cancelled-by-client',
        entityType: 'SERVICE_REQUEST',
        entityId: input.requestId,
        requestId: input.requestId,
        type: 'REQUEST_CANCELLED',
        reasonCode: 'CLIENT_CANCELLATION',
        actorId: input.clientId,
        actorRole: 'CLIENT',
        round: request.round,
        assignmentId: input.expectedAssignmentId,
        operationKey: input.operationKey,
        fromStatus: request.status,
        toStatus: 'CANCELLED',
        createdAt: timestamp,
      })

      return {
        request: {
          ...request,
          status: 'CANCELLED',
          assignedProfessionalId: null,
          currentAssignmentId: null,
        },
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

  function subscribeOpportunityFeedPage(
    input: OpportunityFeedPageInput,
    professionalId: string,
    listeners: OpportunityFeedListeners,
  ): Unsubscribe {
    const feedPage = input.cursor?.page ?? 1
    if (
      input.cursor &&
      (input.cursor.version !== OPPORTUNITY_FEED_CURSOR_VERSION ||
        !Number.isSafeInteger(input.cursor.page) ||
        input.cursor.page < 1)
    ) {
      throw new ServiceRequestError(
        'validation',
        'O cursor do feed de oportunidades é inválido.',
      )
    }
    const pageLimit = opportunityPageSize(
      input.pageSize ?? OPPORTUNITY_FEED_PAGE_SIZE,
    )
    const cumulativeLimit = Math.min(
      pageLimit * feedPage,
      OPPORTUNITY_QUERY_LIMIT,
    )
    const pageStart = (feedPage - 1) * pageLimit
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
    let operationalSnapshot: DocumentSnapshot<DocumentData> | null = null
    let profileSnapshot: DocumentSnapshot<DocumentData> | null = null
    let accessFingerprint = ''
    let stopped = false
    let emission = 0
    let queryUnsubscribers: Unsubscribe[] = []

    const clearRequestListeners = () => {
      emission += 1
      for (const unsubscribe of queryUnsubscribers) unsubscribe()
      queryUnsubscribers = []
    }

    const emitEmptyPage = () => {
      listeners.onPage({
        page: { items: [], nextCursor: null },
        fromCache: false,
      })
    }

    const rebuildRequestListeners = () => {
      if (stopped || !operationalSnapshot || !profileSnapshot) return
      const operationalProfile = opportunityOperationalProfile(
        operationalSnapshot.data(),
      )
      const professionalProfile = opportunityProfessionalProfile(
        profileSnapshot.data(),
      )
      const eligible = hasCurrentApprovedProfessionalAccess({
        professionalId,
        operationalProfile,
        professionalProfile,
      })
      listeners.onAccessChange(eligible)

      if (!eligible || !operationalProfile) {
        accessFingerprint = ''
        clearRequestListeners()
        emitEmptyPage()
        return
      }

      const scopes = input.catalog.specialties
        .filter(
          (specialty) =>
            operationalProfile.approvedCategoryIds.includes(
              specialty.categoryId,
            ) &&
            operationalProfile.approvedSpecialtyIds.includes(specialty.id),
        )
        .flatMap((specialty) =>
          operationalProfile.eligibleCityIbgeCodes.map((cityIbgeCode) => ({
            categoryId: specialty.categoryId,
            specialtyId: specialty.id,
            cityIbgeCode,
          })),
        )
      const nextFingerprint = JSON.stringify({
        version: operationalProfile.profileVersion,
        approvedVersion: operationalProfile.approvedVersion,
        scopes,
        feedPage,
        pageLimit,
      })
      if (nextFingerprint === accessFingerprint) return

      accessFingerprint = nextFingerprint
      clearRequestListeners()
      if (scopes.length === 0) {
        emitEmptyPage()
        return
      }

      const queryStates = new Map<
        string,
        {
          ready: boolean
          fromCache: boolean
          documents: DocumentSnapshot<DocumentData>[]
        }
      >()
      const currentEmission = emission

      const emitMergedPage = async () => {
        if (
          stopped ||
          currentEmission !== emission ||
          Array.from(queryStates.values()).some((state) => !state.ready)
        ) {
          return
        }

        const requestsById = new Map<string, ServiceRequestSummary>()
        for (const state of queryStates.values()) {
          for (const document of state.documents) {
            const request = requestFromSnapshot(document)
            requestsById.set(request.requestId, request)
          }
        }
        const requests = Array.from(requestsById.values()).sort(
          (left, right) =>
            left.acceptUntil.getTime() - right.acceptUntil.getTime() ||
            left.requestId.localeCompare(right.requestId),
        )
        const items: ProfessionalOpportunitySummary[] = []

        for (const request of requests) {
          const slotId = serviceSlotId(request.serviceDate, request.period)
          const [availability, reservation, refusal] = await Promise.all([
            getDoc(
              doc(
                firestore,
                'professionalAvailability',
                professionalId,
                'slots',
                slotId,
              ),
            ),
            getDoc(
              doc(
                firestore,
                'professionalReservations',
                professionalId,
                'slots',
                slotId,
              ),
            ),
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
          ])
          if (stopped || currentEmission !== emission) return
          if (
            getOpportunityIneligibilityReason(request, {
              professionalId,
              operationalProfile,
              professionalProfile,
              availability: opportunityAvailabilitySlot(availability.data()),
              reservationExists: reservation.exists(),
              refusalExists: refusal.exists(),
              now: now(),
            }) === null
          ) {
            items.push(professionalOpportunitySummary(request))
          }
        }

        const sourceMayHaveMore = Array.from(queryStates.values()).some(
          (state) =>
            state.documents.length === cumulativeLimit &&
            cumulativeLimit < OPPORTUNITY_QUERY_LIMIT,
        )
        const pageItems = items.slice(pageStart, pageStart + pageLimit)
        const hasMore =
          items.length > pageStart + pageLimit || sourceMayHaveMore
        listeners.onPage({
          page: {
            items: pageItems,
            nextCursor:
              hasMore
                ? {
                    version: OPPORTUNITY_FEED_CURSOR_VERSION,
                    page: feedPage + 1,
                  }
                : null,
          },
          fromCache: Array.from(queryStates.values()).some(
            (state) => state.fromCache,
          ),
        })
      }

      for (const scope of scopes) {
        const scopeKey = `${scope.categoryId}:${scope.specialtyId}:${scope.cityIbgeCode}`
        queryStates.set(scopeKey, {
          ready: false,
          fromCache: false,
          documents: [],
        })
        const constraints = [
          where('status', '==', 'OPEN'),
          where('categoryId', '==', scope.categoryId),
          where('specialtyId', '==', scope.specialtyId),
          where('cityIbgeCode', '==', scope.cityIbgeCode),
          limit(cumulativeLimit),
        ]
        queryUnsubscribers.push(
          onSnapshot(
            query(
              collection(firestore, 'serviceRequests'),
              ...constraints,
            ),
            { includeMetadataChanges: true },
            (snapshot) => {
              queryStates.set(scopeKey, {
                ready: true,
                fromCache: snapshot.metadata.fromCache,
                documents: snapshot.docs,
              })
              void emitMergedPage().catch(listeners.onError)
            },
            listeners.onError,
          ),
        )
      }
    }

    const accessError = (error: unknown) => listeners.onError(error)
    const unsubscribeOperational = onSnapshot(
      operationalReference,
      (snapshot) => {
        operationalSnapshot = snapshot
        rebuildRequestListeners()
      },
      accessError,
    )
    const unsubscribeProfile = onSnapshot(
      profileReference,
      (snapshot) => {
        profileSnapshot = snapshot
        rebuildRequestListeners()
      },
      accessError,
    )

    return () => {
      stopped = true
      clearRequestListeners()
      unsubscribeOperational()
      unsubscribeProfile()
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
        startedAt: null,
        startedEventId: null,
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

  async function startAssignment(
    input: StartAssignmentInput,
  ): Promise<StartedAssignmentResult> {
    const {
      requestId,
      professionalId,
      expectedAssignmentId,
      expectedRound,
    } = input
    return runTransaction(firestore, async (transaction) => {
      const requestReference = doc(firestore, 'serviceRequests', requestId)
      const assignmentReference = doc(
        requestReference,
        'assignments',
        expectedAssignmentId,
      )
      const eventId = startEventId(expectedRound)
      const eventReference = doc(requestReference, 'events', eventId)
      const requestSnapshot = await transaction.get(requestReference)
      const assignmentSnapshot = await transaction.get(assignmentReference)
      const request = requestFromSnapshot(requestSnapshot)
      const reservationId = assignmentSnapshot.exists()
        ? stringValue(assignmentSnapshot.data(), 'reservationId')
        : serviceSlotId(request.serviceDate, request.period)
      const reservationReference = doc(
        firestore,
        'professionalReservations',
        professionalId,
        'slots',
        reservationId,
      )
      const reservationSnapshot = await transaction.get(reservationReference)
      const eventSnapshot = await transaction.get(eventReference)

      await coordinator?.afterRead('start', requestId)

      const assignment = assignmentSnapshot.data()
      if (
        request.status === 'IN_PROGRESS' &&
        request.assignedProfessionalId === professionalId &&
        request.currentAssignmentId === expectedAssignmentId &&
        request.round === expectedRound &&
        assignmentSnapshot.exists() &&
        assignment?.professionalId === professionalId &&
        assignment.status === 'ACTIVE' &&
        assignment.startedEventId === eventId &&
        reservationSnapshot.exists() &&
        reservationSnapshot.data().assignmentId === expectedAssignmentId &&
        eventSnapshot.exists() &&
        eventSnapshot.data().type === 'SERVICE_STARTED' &&
        eventSnapshot.data().actorId === professionalId &&
        eventSnapshot.data().assignmentId === expectedAssignmentId
      ) {
        return {
          requestId,
          assignmentId: expectedAssignmentId,
          round: expectedRound,
          idempotent: true,
        }
      }

      if (
        request.round !== expectedRound ||
        request.currentAssignmentId !== expectedAssignmentId
      ) {
        throw new ServiceRequestError(
          'round-changed',
          'A atribuição mudou. Recarregue o atendimento antes de iniciar.',
        )
      }
      if (
        request.status !== 'ASSIGNED' ||
        request.assignedProfessionalId !== professionalId
      ) {
        throw new ServiceRequestError(
          request.status === 'IN_PROGRESS'
            ? 'stale-assignment'
            : 'not-assigned-professional',
          'Este atendimento não pode mais ser iniciado por esta atribuição.',
        )
      }
      if (!isServiceStartAllowed(now(), request.periodStartAt)) {
        throw new ServiceRequestError(
          'intervention-required',
          'O atendimento só pode ser iniciado a partir do começo do período agendado.',
        )
      }
      if (
        !assignmentSnapshot.exists() ||
        assignment?.status !== 'ACTIVE' ||
        assignment.professionalId !== professionalId ||
        assignment.round !== expectedRound ||
        assignment.requestId !== requestId ||
        reservationId !== serviceSlotId(request.serviceDate, request.period)
      ) {
        throw new ServiceRequestError(
          'stale-assignment',
          'A atribuição deste atendimento está desatualizada.',
        )
      }
      if (
        !reservationSnapshot.exists() ||
        reservationSnapshot.data().requestId !== requestId ||
        reservationSnapshot.data().assignmentId !== expectedAssignmentId ||
        reservationSnapshot.data().professionalId !== professionalId
      ) {
        throw new ServiceRequestError(
          'stale-assignment',
          'A reserva deste atendimento está desatualizada.',
        )
      }
      if (eventSnapshot.exists()) {
        throw new ServiceRequestError(
          'stale-assignment',
          'O registro de início não corresponde ao estado atual.',
        )
      }

      const timestamp = serverTimestamp()
      transaction.update(requestReference, {
        status: 'IN_PROGRESS',
        updatedAt: timestamp,
      })
      transaction.update(assignmentReference, {
        startedAt: timestamp,
        startedEventId: eventId,
      })
      transaction.set(eventReference, {
        eventId,
        entityType: 'SERVICE_REQUEST',
        entityId: requestId,
        requestId,
        type: 'SERVICE_STARTED',
        reasonCode: 'PROFESSIONAL_START',
        actorId: professionalId,
        actorRole: 'PROFESSIONAL',
        round: expectedRound,
        assignmentId: expectedAssignmentId,
        fromStatus: 'ASSIGNED',
        toStatus: 'IN_PROGRESS',
        createdAt: timestamp,
      })

      return {
        requestId,
        assignmentId: expectedAssignmentId,
        round: expectedRound,
        idempotent: false,
      }
    })
  }

  async function cancelAssignment(
    input: CancelAssignmentInput,
  ): Promise<ReopenedRequestResult> {
    const { requestId, professionalId, expectedAssignmentId } = input
    const cancellationReason = input.reason.trim().replace(/\s+/g, ' ')
    if (cancellationReason.length < 10 || cancellationReason.length > 500) {
      throw new ServiceRequestError(
        'validation',
        'Informe o motivo do cancelamento em 10 a 500 caracteres.',
      )
    }
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
          eventSnapshot.data().actorId !== professionalId ||
          eventSnapshot.data().reason !== cancellationReason
        ) {
          throw new ServiceRequestError('unknown', 'O cancelamento anterior está inconsistente.')
        }
        return {
          requestId,
          cancelledAssignmentId: expectedAssignmentId,
          reopenedRound: Number(assignment.round) + 1,
          replacementSearchOpen: isAcceptanceAllowed(now(), request.acceptUntil),
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
        cancellationReason,
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
        reason: cancellationReason,
        fromStatus: 'ASSIGNED',
        toStatus: 'OPEN',
        createdAt: timestamp,
      })

      return {
        requestId,
        cancelledAssignmentId: expectedAssignmentId,
        reopenedRound,
        replacementSearchOpen: isAcceptanceAllowed(now(), request.acceptUntil),
        idempotent: false,
      }
    })
  }

  return {
    assertProfessionalOpportunityAccess,
    diagnoseOpportunityAction,
    diagnoseClientCancellation,
    getOwnRequest,
    getOwnRequestDetails,
    subscribeOwnRequestDetails,
    getCurrentProfessionalAssignment,
    subscribeProfessionalAppointmentsPage,
    subscribeProfessionalAppointmentDetails,
    createRequest,
    updateOwnRequest,
    cancelOwnRequest,
    listRequestHistory,
    listOpenOpportunities,
    subscribeOpportunityFeedPage,
    acceptOpportunity: acceptRequest,
    declineOpportunity: refuseRequest,
    acceptRequest,
    refuseRequest,
    startAssignment,
    cancelAssignment,
  }
}
