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
  AdminEligibilityResult,
  AdminPendingKind,
  AdminRelatedReport,
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
  serviceSlotId,
} from '../services/service-period-policy'
import {
  getOpportunityIneligibilityReason,
  opportunityAvailabilitySlot,
  opportunityOperationalProfile,
  opportunityProfessionalProfile,
} from '../services/opportunity-eligibility'

const ADMIN_REQUEST_PAGE_SIZE = 12
const ADMIN_REQUEST_MAX_PAGE_SIZE = 25
const ADMIN_DETAIL_LIMIT = 50
const ADMIN_PENDING_SCAN_LIMIT = 100
const ADMIN_ELIGIBILITY_LIMIT = 50

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
        : data.reopenReason === 'ADMIN_INTERVENTION'
          ? 'ADMIN_INTERVENTION'
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
    actorRole: data.actorRole === 'CLIENT'
      ? 'CLIENT'
      : data.actorRole === 'ADMIN'
        ? 'ADMIN'
        : 'PROFESSIONAL',
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

function professionalIsRestricted(snapshot: DocumentSnapshot<DocumentData> | null) {
  if (!snapshot?.exists()) return false
  const data = snapshot.data()
  return data.active !== true || data.reviewStatus !== 'APPROVED'
}

function relatedReportFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): AdminRelatedReport {
  const data = snapshot.data() ?? {}
  return {
    reportId: snapshot.id,
    status: stringValue(data, 'status') as AdminRelatedReport['status'],
    reason: stringValue(data, 'reason') as AdminRelatedReport['reason'],
    createdAt: dateValue(data.createdAt, 'createdAt'),
  }
}

function isOpenReport(report: AdminRelatedReport) {
  return report.status === 'OPEN' || report.status === 'UNDER_REVIEW'
}

function matchesOperationalState(
  request: ServiceRequestSummary,
  state: AdminRequestFilters['operationalState'],
) {
  if (!state) return true
  if (state === 'REPLACEMENT') {
    return request.status === 'OPEN' && request.reopenReason !== null
  }
  if (state === 'OPEN') {
    return request.status === 'OPEN' && request.reopenReason === null
  }
  return request.status === state
}

function matchesPending(
  item: AdminRequestListItem,
  pending: AdminPendingKind | undefined,
  now: Date,
) {
  if (!pending) return true
  const { request } = item
  const withoutAcceptance = request.status === 'OPEN' && !request.currentAssignmentId
  const acceptanceExpired = withoutAcceptance && request.acceptUntil.getTime() <= now.getTime()
  const periodOverdue = !['COMPLETED', 'CANCELLED'].includes(request.status)
    && request.periodStartAt.getTime() <= now.getTime()
  const restrictedCommitment = item.responsibleRestricted
    && ['ASSIGNED', 'IN_PROGRESS'].includes(request.status)
  const hasPending = withoutAcceptance
    || acceptanceExpired
    || periodOverdue
    || item.openReportCount > 0
    || restrictedCommitment

  if (pending === 'ALL') return hasPending
  if (pending === 'WITHOUT_ACCEPTANCE') return withoutAcceptance
  if (pending === 'ACCEPTANCE_EXPIRED') return acceptanceExpired
  if (pending === 'PERIOD_OVERDUE') return periodOverdue
  if (pending === 'OPEN_REPORT') return item.openReportCount > 0
  if (pending === 'RESTRICTED_PROFESSIONAL') return restrictedCommitment
  return item.eligibilityVerification === 'NONE_FOUND'
}

export function createAdminServiceRequestRepository(firestore: Firestore) {
  async function verifyRequestEligibility(
    request: ServiceRequestSummary,
  ): Promise<AdminEligibilityResult> {
    if (request.status !== 'OPEN') {
      return {
        verification: 'NOT_CHECKED',
        checkedProfessionals: 0,
        eligibleProfessionalIds: [],
      }
    }
    const operationalSnapshot = await getDocs(query(
      collection(firestore, 'professionalOperationalProfiles'),
      where('reviewStatus', '==', 'APPROVED'),
      where('active', '==', true),
      orderBy(documentId(), 'asc'),
      limit(ADMIN_ELIGIBILITY_LIMIT + 1),
    ))
    const candidates = operationalSnapshot.docs.slice(0, ADMIN_ELIGIBILITY_LIMIT)
    const slotId = serviceSlotId(request.serviceDate, request.period)
    const eligibleProfessionalIds = (await Promise.all(candidates.map(async (operational) => {
      const professionalId = operational.id
      const [profile, availability, reservation, refusal] = await Promise.all([
        getDoc(doc(firestore, 'professionalProfiles', professionalId)),
        getDoc(doc(firestore, 'professionalAvailability', professionalId, 'slots', slotId)),
        getDoc(doc(firestore, 'professionalReservations', professionalId, 'slots', slotId)),
        getDoc(doc(
          firestore,
          'serviceRequests',
          request.requestId,
          'rounds',
          request.currentRoundId,
          'refusals',
          professionalId,
        )),
      ])
      const reason = getOpportunityIneligibilityReason(request, {
        professionalId,
        operationalProfile: opportunityOperationalProfile(operational.data()),
        professionalProfile: opportunityProfessionalProfile(profile.data()),
        availability: opportunityAvailabilitySlot(availability.data()),
        reservationExists: reservation.exists(),
        refusalExists: refusal.exists(),
        now: new Date(),
      })
      return reason === null ? professionalId : null
    }))).filter((value): value is string => value !== null)

    return {
      verification: eligibleProfessionalIds.length > 0
        ? 'ELIGIBLE_FOUND'
        : operationalSnapshot.size <= ADMIN_ELIGIBILITY_LIMIT
          ? 'NONE_FOUND'
          : 'INCONCLUSIVE',
      checkedProfessionals: candidates.length,
      eligibleProfessionalIds,
    }
  }

  async function listItem(
    snapshot: DocumentSnapshot<DocumentData>,
    verifyEligibility = false,
  ): Promise<AdminRequestListItem> {
    const parsed = requestFromSnapshot(snapshot)
    const [privateSnapshot, professionalSnapshot, operationalSnapshot, reportsSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'serviceRequestPrivate', snapshot.id)),
      parsed.request.assignedProfessionalId
        ? getDoc(doc(firestore, 'professionalProfiles', parsed.request.assignedProfessionalId))
        : Promise.resolve(null),
      parsed.request.assignedProfessionalId
        ? getDoc(doc(
            firestore,
            'professionalOperationalProfiles',
            parsed.request.assignedProfessionalId,
          ))
        : Promise.resolve(null),
      getDocs(query(
        collection(firestore, 'serviceReports'),
        where('requestId', '==', snapshot.id),
        limit(25),
      )),
    ])
    const privateData = privateFromSnapshot(privateSnapshot)
    const reports = reportsSnapshot.docs.map(relatedReportFromSnapshot)
    const eligibility = verifyEligibility
      ? await verifyRequestEligibility(parsed.request)
      : null
    return {
      request: parsed.request,
      city: privateData.address.city,
      stateCode: privateData.address.stateCode,
      createdAt: parsed.createdAt,
      responsibleName: profileName(professionalSnapshot),
      responsibleRestricted: professionalIsRestricted(operationalSnapshot),
      openReportCount: reports.filter(isOpenReport).length,
      eligibilityVerification: eligibility?.verification ?? 'NOT_CHECKED',
    }
  }

  async function listRequests(input: AdminRequestFilters = {}): Promise<AdminRequestPage> {
    if (input.requestId?.trim()) {
      const snapshot = await getDoc(
        doc(firestore, 'serviceRequests', input.requestId.trim()),
      )
      if (!snapshot.exists()) return { items: [], nextCursor: null }
      const item = await listItem(snapshot, input.pending === 'NO_ELIGIBLE')
      return {
        items: matchesOperationalState(item.request, input.operationalState)
          && matchesPending(item, input.pending, new Date())
          ? [item]
          : [],
        nextCursor: null,
      }
    }

    const pageSize = Math.max(
      1,
      Math.min(Math.trunc(input.pageSize ?? ADMIN_REQUEST_PAGE_SIZE), ADMIN_REQUEST_MAX_PAGE_SIZE),
    )
    const operationalState = input.operationalState ?? input.status
    const queryStatus = operationalState === 'REPLACEMENT'
      ? 'OPEN'
      : operationalState ?? (input.pending === 'NO_ELIGIBLE' ? 'OPEN' : undefined)
    const needsApplicationFilter = Boolean(input.pending)
      || operationalState === 'OPEN'
      || operationalState === 'REPLACEMENT'
    const queryPageSize = needsApplicationFilter ? ADMIN_REQUEST_MAX_PAGE_SIZE : pageSize + 1
    const matches: Array<{
      item: AdminRequestListItem
      snapshot: DocumentSnapshot<DocumentData>
    }> = []
    let scanCursor = input.cursor ?? null
    let scanned = 0
    let exhausted = false
    let lastScanned: DocumentSnapshot<DocumentData> | undefined
    const now = new Date()

    while (
      scanned < ADMIN_PENDING_SCAN_LIMIT
      && matches.length < pageSize + 1
      && !exhausted
    ) {
      const constraints: QueryConstraint[] = [
        ...(queryStatus ? [where('status', '==', queryStatus)] : []),
        ...(input.period ? [where('period', '==', input.period)] : []),
        ...(input.scheduledFrom ? [where('serviceDate', '>=', input.scheduledFrom)] : []),
        ...(input.scheduledTo ? [where('serviceDate', '<=', input.scheduledTo)] : []),
        orderBy('serviceDate', 'desc'),
        orderBy(documentId(), 'desc'),
        ...(scanCursor
          ? [startAfter(scanCursor.serviceDate, scanCursor.requestId)]
          : []),
        limit(queryPageSize),
      ]
      const snapshot = await getDocs(
        query(collection(firestore, 'serviceRequests'), ...constraints),
      )
      exhausted = snapshot.size < queryPageSize
      if (snapshot.empty) break
      for (const requestSnapshot of snapshot.docs) {
        scanned += 1
        lastScanned = requestSnapshot
        const item = await listItem(
          requestSnapshot,
          input.pending === 'NO_ELIGIBLE',
        )
        if (
          matchesOperationalState(item.request, operationalState)
          && matchesPending(item, input.pending, now)
        ) {
          matches.push({ item, snapshot: requestSnapshot })
        }
        if (matches.length >= pageSize + 1 || scanned >= ADMIN_PENDING_SCAN_LIMIT) break
      }
      const last = snapshot.docs.at(-1)
      scanCursor = last
        ? { serviceDate: stringValue(last.data(), 'serviceDate'), requestId: last.id }
        : null
      if (!needsApplicationFilter) break
    }

    const visible = matches.slice(0, pageSize)
    const lastVisible = visible.at(-1)?.snapshot
    const continuation = matches.length > pageSize
      ? lastVisible
      : !exhausted && scanned >= ADMIN_PENDING_SCAN_LIMIT
        ? lastScanned
        : undefined
    return {
      items: visible.map(({ item }) => item),
      nextCursor: continuation
        ? { serviceDate: stringValue(continuation.data() ?? {}, 'serviceDate'), requestId: continuation.id }
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
    const [roundSnapshots, assignmentSnapshots, reportsSnapshot, responsibleOperationalSnapshot] = await Promise.all([
      Promise.all(roundNumbers.map((round) => getDoc(
        doc(requestReference, 'rounds', roundDocumentId(round)),
      ))),
      Promise.all(roundNumbers.map((round) => getDoc(
        doc(requestReference, 'assignments', assignmentDocumentId(round)),
      ))),
      getDocs(query(
        collection(firestore, 'serviceReports'),
        where('requestId', '==', requestId),
        orderBy('createdAt', 'desc'),
        limit(25),
      )),
      parsed.request.assignedProfessionalId
        ? getDoc(doc(
            firestore,
            'professionalOperationalProfiles',
            parsed.request.assignedProfessionalId,
          ))
        : Promise.resolve(null),
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
      responsibleRestricted: professionalIsRestricted(responsibleOperationalSnapshot),
      relatedReports: reportsSnapshot.docs.map(relatedReportFromSnapshot),
      rounds,
      assignments,
      history: historySnapshot.docs.map(eventFromSnapshot),
    }
  }

  async function verifyEligibility(requestId: string) {
    const snapshot = await getDoc(doc(firestore, 'serviceRequests', requestId))
    return verifyRequestEligibility(requestFromSnapshot(snapshot).request)
  }

  return { listRequests, getDetail, verifyEligibility }
}
