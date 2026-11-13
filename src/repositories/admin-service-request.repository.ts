import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'

import type {
  AdminAssignment,
  AdminDistributionRound,
  AdminRequestDetail,
  AdminRequestFilters,
  AdminRequestListItem,
  AdminRequestPage,
} from '../types/admin-service-request'
import { AdminRequestError } from '../types/admin-service-request'
import type {
  ServicePeriod,
  ServiceRequestEvent,
  ServiceRequestPrivateData,
  ServiceRequestStatus,
  ServiceRequestSummary,
} from '../types/service-request'
import {
  assignmentDocumentId,
  roundDocumentId,
} from '../services/service-period-policy'

const ADMIN_REQUEST_PAGE_SIZE = 12
const ADMIN_REQUEST_MAX_PAGE_SIZE = 25
const ADMIN_DETAIL_LIMIT = 50

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

function dateValue(value: unknown, field: string) {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  throw new AdminRequestError('unknown', `Campo temporal inválido: ${field}.`)
}

function nullableDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

function requestFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): { request: ServiceRequestSummary; createdAt: Date; updatedAt: Date } {
  if (!snapshot.exists()) {
    throw new AdminRequestError('not-found', 'Pedido não encontrado.')
  }
  const data = snapshot.data()
  const period = stringValue(data, 'period') as ServicePeriod
  const status = stringValue(data, 'status') as ServiceRequestStatus
  if (
    !['MORNING', 'AFTERNOON', 'EVENING'].includes(period) ||
    !['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)
  ) {
    throw new AdminRequestError('unknown', 'O pedido possui dados inválidos.')
  }
  return {
    request: {
      requestId: snapshot.id,
      operationKey: stringValue(data, 'operationKey'),
      clientId: stringValue(data, 'clientId'),
      categoryId: stringValue(data, 'categoryId'),
      specialtyId: stringValue(data, 'specialtyId'),
      cityIbgeCode: stringValue(data, 'cityIbgeCode'),
      serviceDate: stringValue(data, 'serviceDate'),
      period,
      periodStartAt: dateValue(data.periodStartAt, 'periodStartAt'),
      acceptUntil: dateValue(data.acceptUntil, 'acceptUntil'),
      status,
      round: typeof data.round === 'number' ? data.round : 0,
      currentRoundId: stringValue(data, 'currentRoundId'),
      assignedProfessionalId: nullableString(data, 'assignedProfessionalId'),
      currentAssignmentId: nullableString(data, 'currentAssignmentId'),
      reopenReason: data.reopenReason === 'PROFESSIONAL_CANCELLATION'
        ? 'PROFESSIONAL_CANCELLATION'
        : null,
      excludedProfessionalIds: stringArray(data, 'excludedProfessionalIds'),
    },
    createdAt: dateValue(data.createdAt, 'createdAt'),
    updatedAt: dateValue(data.updatedAt, 'updatedAt'),
  }
}

function privateFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ServiceRequestPrivateData {
  if (!snapshot.exists()) {
    throw new AdminRequestError('not-found', 'Dados privados do pedido não encontrados.')
  }
  const data = snapshot.data()
  const address = typeof data.address === 'object' && data.address !== null
    ? data.address as DocumentData
    : null
  if (!address) throw new AdminRequestError('unknown', 'Endereço privado inválido.')
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

function eventFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ServiceRequestEvent {
  const data = snapshot.data()
  if (!data) {
    throw new AdminRequestError('not-found', 'Evento do pedido não encontrado.')
  }
  return {
    eventId: snapshot.id,
    entityType: 'SERVICE_REQUEST',
    entityId: stringValue(data, 'entityId') || stringValue(data, 'requestId'),
    requestId: stringValue(data, 'requestId'),
    type: stringValue(data, 'type') as ServiceRequestEvent['type'],
    reasonCode: stringValue(data, 'reasonCode') as ServiceRequestEvent['reasonCode'],
    actorId: stringValue(data, 'actorId'),
    actorRole: data.actorRole === 'CLIENT' ? 'CLIENT' : 'PROFESSIONAL',
    round: typeof data.round === 'number' ? data.round : 0,
    assignmentId: nullableString(data, 'assignmentId'),
    fromStatus: stringValue(data, 'fromStatus') as ServiceRequestStatus,
    toStatus: stringValue(data, 'toStatus') as ServiceRequestStatus,
    ...(typeof data.targetRound === 'number' ? { targetRound: data.targetRound } : {}),
    ...(typeof data.operationKey === 'string' ? { operationKey: data.operationKey } : {}),
    ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
    createdAt: dateValue(data.createdAt, 'createdAt'),
  }
}

function profileName(snapshot: DocumentSnapshot<DocumentData> | null) {
  const value = snapshot?.data()?.publicName
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function createAdminServiceRequestRepository(firestore: Firestore) {
  async function listItem(
    snapshot: DocumentSnapshot<DocumentData>,
  ): Promise<AdminRequestListItem> {
    const parsed = requestFromSnapshot(snapshot)
    const [privateSnapshot, professionalSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'serviceRequestPrivate', snapshot.id)),
      parsed.request.assignedProfessionalId
        ? getDoc(doc(firestore, 'professionalProfiles', parsed.request.assignedProfessionalId))
        : Promise.resolve(null),
    ])
    const privateData = privateFromSnapshot(privateSnapshot)
    return {
      request: parsed.request,
      city: privateData.address.city,
      stateCode: privateData.address.stateCode,
      createdAt: parsed.createdAt,
      responsibleName: profileName(professionalSnapshot),
    }
  }

  async function listRequests(input: AdminRequestFilters = {}): Promise<AdminRequestPage> {
    if (input.requestId?.trim()) {
      const snapshot = await getDoc(
        doc(firestore, 'serviceRequests', input.requestId.trim()),
      )
      if (!snapshot.exists()) return { items: [], nextCursor: null }
      return { items: [await listItem(snapshot)], nextCursor: null }
    }

    const pageSize = Math.max(
      1,
      Math.min(Math.trunc(input.pageSize ?? ADMIN_REQUEST_PAGE_SIZE), ADMIN_REQUEST_MAX_PAGE_SIZE),
    )
    const constraints: QueryConstraint[] = [
      ...(input.status ? [where('status', '==', input.status)] : []),
      ...(input.period ? [where('period', '==', input.period)] : []),
      ...(input.scheduledFrom ? [where('serviceDate', '>=', input.scheduledFrom)] : []),
      ...(input.scheduledTo ? [where('serviceDate', '<=', input.scheduledTo)] : []),
      orderBy('serviceDate', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(input.cursor
        ? [startAfter(input.cursor.serviceDate, input.cursor.requestId)]
        : []),
      limit(pageSize + 1),
    ]
    const snapshot = await getDocs(
      query(collection(firestore, 'serviceRequests'), ...constraints),
    )
    const visible = snapshot.docs.slice(0, pageSize)
    const items = await Promise.all(visible.map(listItem))
    const last = visible.at(-1)
    return {
      items,
      nextCursor: snapshot.docs.length > pageSize && last
        ? { serviceDate: stringValue(last.data(), 'serviceDate'), requestId: last.id }
        : null,
    }
  }

  async function getDetail(requestId: string): Promise<AdminRequestDetail> {
    const requestReference = doc(firestore, 'serviceRequests', requestId)
    const [requestSnapshot, privateSnapshot, historySnapshot] =
      await Promise.all([
        getDoc(requestReference),
        getDoc(doc(firestore, 'serviceRequestPrivate', requestId)),
        getDocs(query(
          collection(requestReference, 'events'),
          orderBy('createdAt', 'desc'),
          limit(ADMIN_DETAIL_LIMIT),
        )),
      ])
    const parsed = requestFromSnapshot(requestSnapshot)
    const privateData = privateFromSnapshot(privateSnapshot)
    const lastRound = Math.max(1, parsed.request.round)
    const firstRound = Math.max(1, lastRound - ADMIN_DETAIL_LIMIT + 1)
    const roundNumbers = Array.from(
      { length: lastRound - firstRound + 1 },
      (_, index) => lastRound - index,
    )
    const [roundSnapshots, assignmentSnapshots] = await Promise.all([
      Promise.all(roundNumbers.map((round) => getDoc(
        doc(requestReference, 'rounds', roundDocumentId(round)),
      ))),
      Promise.all(roundNumbers.map((round) => getDoc(
        doc(requestReference, 'assignments', assignmentDocumentId(round)),
      ))),
    ])
    const availableRounds = roundSnapshots.filter((snapshot) => snapshot.exists())
    const availableAssignments = assignmentSnapshots.filter((snapshot) => snapshot.exists())
    const professionalIds = new Set<string>()
    if (parsed.request.assignedProfessionalId) {
      professionalIds.add(parsed.request.assignedProfessionalId)
    }
    for (const assignment of availableAssignments) {
      const professionalId = stringValue(assignment.data(), 'professionalId')
      if (professionalId) professionalIds.add(professionalId)
    }
    const profiles = new Map<string, string | null>()
    await Promise.all([...professionalIds].map(async (professionalId) => {
      const snapshot = await getDoc(doc(firestore, 'professionalProfiles', professionalId))
      profiles.set(professionalId, profileName(snapshot))
    }))

    const rounds = availableRounds.map((snapshot): AdminDistributionRound => {
      const data = snapshot.data()
      return {
        roundId: snapshot.id,
        round: typeof data.round === 'number' ? data.round : 0,
        status: data.status === 'OPEN' ? 'OPEN' : 'CLOSED',
        reason: stringValue(data, 'reason') as AdminDistributionRound['reason'],
        previousAssignmentId: nullableString(data, 'previousAssignmentId'),
        excludedProfessionalIds: stringArray(data, 'excludedProfessionalIds'),
        openedAt: nullableDate(data.openedAt),
        closedAt: nullableDate(data.closedAt),
        closedReason: nullableString(data, 'closedReason'),
      }
    })
    const assignments = availableAssignments.map((snapshot): AdminAssignment => {
      const data = snapshot.data()
      const professionalId = stringValue(data, 'professionalId')
      return {
        assignmentId: snapshot.id,
        professionalId,
        professionalName: profiles.get(professionalId) ?? null,
        round: typeof data.round === 'number' ? data.round : 0,
        status: stringValue(data, 'status') as AdminAssignment['status'],
        acceptedAt: nullableDate(data.acceptedAt),
        startedAt: nullableDate(data.startedAt),
        endedAt: nullableDate(data.endedAt),
        endedReason: nullableString(data, 'endReason'),
      }
    })
    return {
      request: parsed.request,
      privateData,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      responsibleName: parsed.request.assignedProfessionalId
        ? profiles.get(parsed.request.assignedProfessionalId) ?? null
        : null,
      rounds,
      assignments,
      history: historySnapshot.docs.map(eventFromSnapshot),
    }
  }

  return { listRequests, getDetail }
}
