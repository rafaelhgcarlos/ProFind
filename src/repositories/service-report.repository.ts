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
} from 'firebase/firestore'

import { createAdminServiceRequestRepository } from './admin-service-request.repository'
import {
  ServiceReportError,
  type AdminServiceReportDetail,
  type AdminServiceReportFilters,
  type ServiceReport,
  type ServiceReportAdminNote,
  type ServiceReportDecision,
  type ServiceReportHistoryEvent,
  type ServiceReportPage,
  type ServiceReportReason,
  type ServiceReportStatus,
} from '../types/service-report'
import type {
  ServicePeriod,
  ServiceRequestStatus,
} from '../types/service-request'
import {
  getServiceRequestSchedulingWindow,
  isAcceptanceAllowed,
  isProfessionalCancellationAllowed,
  roundDocumentId,
} from '../services/service-period-policy'

const CLIENT_REPORT_LIMIT = 20
const ADMIN_REPORT_PAGE_SIZE = 12
const ADMIN_REPORT_MAX_PAGE_SIZE = 25
const DETAIL_LIMIT = 50

export interface OpenServiceReportInput {
  operationKey: string
  requestId: string
  clientId: string
  reason: ServiceReportReason
  description: string
}

export interface ReviewServiceReportInput {
  reportId: string
  adminId: string
  operationKey: string
  expectedRevision: number
  internalNote: string
  proposal?: {
    serviceDate: string
    period: ServicePeriod
    periodStartAt: Date
    acceptUntil: Date
  } | null
}

export interface ResolveServiceReportInput {
  reportId: string
  adminId: string
  operationKey: string
  expectedRevision: number
  decision: ServiceReportDecision
  justification: string
  internalNote?: string
}

export interface ServiceReportRepositoryDependencies {
  firestore: Firestore
  now?(): Date
  afterRead?(operation: string, entityId: string): Promise<void>
}

export interface OwnServiceReportsSnapshot {
  reports: ServiceReport[]
  fromCache: boolean
}

export interface OwnServiceReportsListeners {
  onReports(snapshot: OwnServiceReportsSnapshot): void
  onError(error: unknown): void
}

function stringValue(data: DocumentData, field: string) {
  return typeof data[field] === 'string' ? data[field] : ''
}

function nullableString(data: DocumentData, field: string) {
  return typeof data[field] === 'string' ? data[field] : null
}

function dateValue(value: unknown, field: string) {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  throw new ServiceReportError('unknown', `Campo temporal invÃ¡lido: ${field}.`)
}

function nullableDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

function reportFromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ServiceReport {
  if (!snapshot.exists()) {
    throw new ServiceReportError('not-found', 'Relato nÃ£o encontrado.')
  }
  const data = snapshot.data()
  return {
    reportId: snapshot.id,
    operationKey: stringValue(data, 'operationKey'),
    requestId: stringValue(data, 'requestId'),
    clientId: stringValue(data, 'clientId'),
    reason: stringValue(data, 'reason') as ServiceReportReason,
    description: stringValue(data, 'description'),
    status: stringValue(data, 'status') as ServiceReportStatus,
    requestStatusAtOpen: stringValue(data, 'requestStatusAtOpen') as ServiceRequestStatus,
    roundAtOpen: typeof data.roundAtOpen === 'number' ? data.roundAtOpen : 0,
    assignmentIdAtOpen: nullableString(data, 'assignmentIdAtOpen'),
    professionalIdAtOpen: nullableString(data, 'professionalIdAtOpen'),
    revision: typeof data.revision === 'number' ? data.revision : 0,
    lastEventId: stringValue(data, 'lastEventId'),
    reviewedAt: nullableDate(data.reviewedAt),
    reviewedBy: nullableString(data, 'reviewedBy'),
    resolutionDecision: nullableString(data, 'resolutionDecision') as ServiceReportDecision | null,
    resolutionJustification: nullableString(data, 'resolutionJustification'),
    resolvedAt: nullableDate(data.resolvedAt),
    resolvedBy: nullableString(data, 'resolvedBy'),
    proposedServiceDate: nullableString(data, 'proposedServiceDate'),
    proposedPeriod: nullableString(data, 'proposedPeriod') as ServicePeriod | null,
    proposalRevision: typeof data.proposalRevision === 'number' ? data.proposalRevision : 0,
    proposedAt: nullableDate(data.proposedAt),
    proposedBy: nullableString(data, 'proposedBy'),
    clientAcknowledgedProposalRevision:
      typeof data.clientAcknowledgedProposalRevision === 'number'
        ? data.clientAcknowledgedProposalRevision
        : null,
    clientAcknowledgedAt: nullableDate(data.clientAcknowledgedAt),
    clientAcknowledgedBy: nullableString(data, 'clientAcknowledgedBy'),
    createdAt: dateValue(data.createdAt, 'createdAt'),
    updatedAt: dateValue(data.updatedAt, 'updatedAt'),
  }
}

function historyFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): ServiceReportHistoryEvent {
  const data = snapshot.data()
  if (!data) throw new ServiceReportError('not-found', 'HistÃ³rico nÃ£o encontrado.')
  return {
    eventId: snapshot.id,
    reportId: stringValue(data, 'reportId'),
    requestId: stringValue(data, 'requestId'),
    type: stringValue(data, 'type') as ServiceReportHistoryEvent['type'],
    actorId: stringValue(data, 'actorId'),
    actorRole: data.actorRole === 'ADMIN' ? 'ADMIN' : 'CLIENT',
    fromStatus: nullableString(data, 'fromStatus') as ServiceReportStatus | null,
    toStatus: stringValue(data, 'toStatus') as ServiceReportStatus,
    decision: nullableString(data, 'decision') as ServiceReportDecision | null,
    justification: nullableString(data, 'justification'),
    proposalRevision: typeof data.proposalRevision === 'number' ? data.proposalRevision : null,
    createdAt: dateValue(data.createdAt, 'createdAt'),
  }
}

function noteFromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ServiceReportAdminNote {
  const data = snapshot.data()
  if (!data) throw new ServiceReportError('not-found', 'Nota nÃ£o encontrada.')
  return {
    noteId: snapshot.id,
    reportId: stringValue(data, 'reportId'),
    authorId: stringValue(data, 'authorId'),
    text: stringValue(data, 'text'),
    createdAt: dateValue(data.createdAt, 'createdAt'),
  }
}

function requestStatus(data: DocumentData) {
  return stringValue(data, 'status') as ServiceRequestStatus
}

function sameOpening(existing: ServiceReport, input: OpenServiceReportInput) {
  return existing.operationKey === input.operationKey
    && existing.requestId === input.requestId
    && existing.clientId === input.clientId
    && existing.reason === input.reason
    && existing.description === input.description
}

export function createServiceReportRepository({
  firestore,
  now = () => new Date(),
  afterRead,
}: ServiceReportRepositoryDependencies) {
  const adminRequests = createAdminServiceRequestRepository(firestore)

  async function openReport(input: OpenServiceReportInput) {
    return runTransaction(firestore, async (transaction) => {
      const reportReference = doc(firestore, 'serviceReports', input.operationKey)
      const requestReference = doc(firestore, 'serviceRequests', input.requestId)
      const [reportSnapshot, requestSnapshot] = await Promise.all([
        transaction.get(reportReference),
        transaction.get(requestReference),
      ])
      if (reportSnapshot.exists()) {
        const existing = reportFromSnapshot(reportSnapshot)
        if (!sameOpening(existing, input)) {
          throw new ServiceReportError(
            'stale-report',
            'Esta tentativa de envio jÃ¡ foi usada com outros dados.',
          )
        }
        return { report: existing, idempotent: true }
      }
      if (!requestSnapshot.exists() || requestSnapshot.data().clientId !== input.clientId) {
        throw new ServiceReportError('not-found', 'Pedido nÃ£o encontrado.')
      }
      const request = requestSnapshot.data()
      const timestamp = serverTimestamp()
      const reportData = {
        reportId: input.operationKey,
        operationKey: input.operationKey,
        requestId: input.requestId,
        clientId: input.clientId,
        reason: input.reason,
        description: input.description,
        status: 'OPEN',
        requestStatusAtOpen: requestStatus(request),
        roundAtOpen: request.round,
        assignmentIdAtOpen: request.currentAssignmentId ?? null,
        professionalIdAtOpen: request.assignedProfessionalId ?? null,
        revision: 1,
        lastEventId: 'opened',
        reviewedAt: null,
        reviewedBy: null,
        resolutionDecision: null,
        resolutionJustification: null,
        resolvedAt: null,
        resolvedBy: null,
        proposedServiceDate: null,
        proposedPeriod: null,
        proposalRevision: 0,
        proposedAt: null,
        proposedBy: null,
        clientAcknowledgedProposalRevision: null,
        clientAcknowledgedAt: null,
        clientAcknowledgedBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      transaction.set(reportReference, reportData)
      const createdAt = now()
      return {
        report: {
          ...reportData,
          status: 'OPEN' as const,
          requestStatusAtOpen: requestStatus(request),
          reason: input.reason,
          createdAt,
          updatedAt: createdAt,
        },
        idempotent: false,
      }
    })
  }

  async function listOwnReports(requestId: string, clientId: string) {
    const snapshot = await getDocs(query(
      collection(firestore, 'serviceReports'),
      where('requestId', '==', requestId),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc'),
      limit(CLIENT_REPORT_LIMIT),
    ))
    return snapshot.docs.map(reportFromSnapshot)
  }

  function subscribeOwnReports(
    requestId: string,
    clientId: string,
    listeners: OwnServiceReportsListeners,
  ) {
    return onSnapshot(
      query(
        collection(firestore, 'serviceReports'),
        where('requestId', '==', requestId),
        where('clientId', '==', clientId),
        orderBy('createdAt', 'desc'),
        limit(CLIENT_REPORT_LIMIT),
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        try {
          listeners.onReports({
            reports: snapshot.docs.map(reportFromSnapshot),
            fromCache: snapshot.metadata.fromCache,
          })
        } catch (error) {
          listeners.onError(error)
        }
      },
      listeners.onError,
    )
  }

  async function acknowledgeProposal(reportId: string, clientId: string) {
    return runTransaction(firestore, async (transaction) => {
      const reportReference = doc(firestore, 'serviceReports', reportId)
      const reportSnapshot = await transaction.get(reportReference)
      const report = reportFromSnapshot(reportSnapshot)
      if (report.clientId !== clientId) {
        throw new ServiceReportError('not-found', 'Relato nÃ£o encontrado.')
      }
      if (!report.proposedServiceDate || !report.proposedPeriod || report.proposalRevision < 1) {
        throw new ServiceReportError('validation', 'NÃ£o hÃ¡ reagendamento para confirmar.')
      }
      const eventId = `ack-proposal-${report.proposalRevision}`
      const eventReference = doc(reportReference, 'history', eventId)
      const eventSnapshot = await transaction.get(eventReference)
      if (
        report.clientAcknowledgedProposalRevision === report.proposalRevision
        && report.clientAcknowledgedBy === clientId
        && eventSnapshot.exists()
      ) {
        return { report, idempotent: true }
      }
      if (report.status === 'RESOLVED') {
        throw new ServiceReportError('stale-report', 'Este relato jÃ¡ foi resolvido.')
      }
      const timestamp = serverTimestamp()
      transaction.update(reportReference, {
        clientAcknowledgedProposalRevision: report.proposalRevision,
        clientAcknowledgedAt: timestamp,
        clientAcknowledgedBy: clientId,
        revision: report.revision + 1,
        lastEventId: eventId,
        updatedAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId,
        reportId,
        requestId: report.requestId,
        type: 'RESCHEDULE_ACKNOWLEDGED',
        actorId: clientId,
        actorRole: 'CLIENT',
        fromStatus: report.status,
        toStatus: report.status,
        decision: null,
        justification: null,
        proposalRevision: report.proposalRevision,
        createdAt: timestamp,
      })
      return { idempotent: false }
    })
  }

  async function listReports(
    input: AdminServiceReportFilters = {},
  ): Promise<ServiceReportPage> {
    const pageSize = Math.max(
      1,
      Math.min(Math.trunc(input.pageSize ?? ADMIN_REPORT_PAGE_SIZE), ADMIN_REPORT_MAX_PAGE_SIZE),
    )
    const constraints: QueryConstraint[] = [
      ...(input.status ? [where('status', '==', input.status)] : []),
      ...(input.requestId?.trim()
        ? [where('requestId', '==', input.requestId.trim())]
        : []),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(input.cursor
        ? [startAfter(Timestamp.fromDate(input.cursor.createdAt), input.cursor.reportId)]
        : []),
      limit(pageSize + 1),
    ]
    const snapshot = await getDocs(query(
      collection(firestore, 'serviceReports'),
      ...constraints,
    ))
    const visible = snapshot.docs.slice(0, pageSize)
    const last = visible.at(-1)
    return {
      items: visible.map(reportFromSnapshot),
      nextCursor: snapshot.docs.length > pageSize && last
        ? { createdAt: dateValue(last.data().createdAt, 'createdAt'), reportId: last.id }
        : null,
    }
  }

  async function getAdminDetail(reportId: string): Promise<AdminServiceReportDetail> {
    const reportReference = doc(firestore, 'serviceReports', reportId)
    const [reportSnapshot, historySnapshot, notesSnapshot] = await Promise.all([
      getDoc(reportReference),
      getDocs(query(
        collection(reportReference, 'history'),
        orderBy('createdAt', 'desc'),
        limit(DETAIL_LIMIT),
      )),
      getDocs(query(
        collection(reportReference, 'adminNotes'),
        orderBy('createdAt', 'desc'),
        limit(DETAIL_LIMIT),
      )),
    ])
    const report = reportFromSnapshot(reportSnapshot)
    return {
      report,
      request: await adminRequests.getDetail(report.requestId),
      history: historySnapshot.docs.map(historyFromSnapshot),
      internalNotes: notesSnapshot.docs.map(noteFromSnapshot),
    }
  }

  async function reviewReport(input: ReviewServiceReportInput) {
    return runTransaction(firestore, async (transaction) => {
      const reportReference = doc(firestore, 'serviceReports', input.reportId)
      const eventReference = doc(reportReference, 'history', input.operationKey)
      const noteReference = doc(reportReference, 'adminNotes', input.operationKey)
      const [reportSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(reportReference),
        transaction.get(eventReference),
      ])
      const report = reportFromSnapshot(reportSnapshot)
      if (eventSnapshot.exists() && eventSnapshot.data().actorId === input.adminId) {
        return { idempotent: true }
      }
      if (report.status === 'RESOLVED') {
        throw new ServiceReportError('stale-report', 'Este relato jÃ¡ foi resolvido.')
      }
      if (report.revision !== input.expectedRevision) {
        throw new ServiceReportError('stale-report', 'O relato mudou. Recarregue antes de analisar.')
      }
      await afterRead?.('review-report', input.reportId)
      const timestamp = serverTimestamp()
      const proposalRevision = input.proposal
        ? report.proposalRevision + 1
        : report.proposalRevision
      transaction.update(reportReference, {
        status: 'UNDER_REVIEW',
        reviewedAt: timestamp,
        reviewedBy: input.adminId,
        revision: report.revision + 1,
        lastEventId: input.operationKey,
        ...(input.proposal
          ? {
              proposedServiceDate: input.proposal.serviceDate,
              proposedPeriod: input.proposal.period,
              proposalRevision,
              proposedAt: timestamp,
              proposedBy: input.adminId,
              clientAcknowledgedProposalRevision: null,
              clientAcknowledgedAt: null,
              clientAcknowledgedBy: null,
            }
          : {}),
        updatedAt: timestamp,
      })
      transaction.set(noteReference, {
        noteId: input.operationKey,
        reportId: input.reportId,
        authorId: input.adminId,
        text: input.internalNote,
        createdAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId: input.operationKey,
        reportId: input.reportId,
        requestId: report.requestId,
        type: input.proposal ? 'RESCHEDULE_PROPOSED' : 'REVIEW_STARTED',
        actorId: input.adminId,
        actorRole: 'ADMIN',
        fromStatus: report.status,
        toStatus: 'UNDER_REVIEW',
        decision: null,
        justification: null,
        proposalRevision: input.proposal ? proposalRevision : null,
        createdAt: timestamp,
      })
      return { idempotent: false }
    })
  }

  async function resolveReport(input: ResolveServiceReportInput) {
    return runTransaction(firestore, async (transaction) => {
      const reportReference = doc(firestore, 'serviceReports', input.reportId)
      const eventReference = doc(reportReference, 'history', input.operationKey)
      const [reportSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(reportReference),
        transaction.get(eventReference),
      ])
      const report = reportFromSnapshot(reportSnapshot)
      if (
        eventSnapshot.exists()
        && eventSnapshot.data().actorId === input.adminId
        && eventSnapshot.data().decision === input.decision
      ) {
        return { idempotent: true }
      }
      if (report.status === 'RESOLVED' || report.revision !== input.expectedRevision) {
        throw new ServiceReportError('stale-report', 'O relato mudou. Recarregue antes de resolver.')
      }

      let operational:
        | null
        | {
            requestReference: ReturnType<typeof doc>
            request: DocumentData
            assignmentReference: ReturnType<typeof doc>
            assignment: DocumentData
            reservationReference: ReturnType<typeof doc>
            nextRoundReference: ReturnType<typeof doc>
            serviceEventReference: ReturnType<typeof doc>
            nextRound: number
            nextRoundId: string
            serviceDate: string
            period: ServicePeriod
            periodStartAt: Date
            acceptUntil: Date
          } = null

      if (input.decision !== 'NO_OPERATIONAL_CHANGE') {
        const actualRequestReference = doc(firestore, 'serviceRequests', report.requestId)
        const requestSnapshot = await transaction.get(actualRequestReference)
        if (!requestSnapshot.exists()) {
          throw new ServiceReportError('not-found', 'Pedido vinculado nÃ£o encontrado.')
        }
        const request = requestSnapshot.data()
        if (
          request.status !== 'ASSIGNED'
          || !report.assignmentIdAtOpen
          || request.currentAssignmentId !== report.assignmentIdAtOpen
          || request.round !== report.roundAtOpen
          || request.assignedProfessionalId !== report.professionalIdAtOpen
        ) {
          throw new ServiceReportError(
            'stale-assignment',
            'A atribuiÃ§Ã£o mudou ou o atendimento jÃ¡ iniciou. Resolva sem redistribuiÃ§Ã£o automÃ¡tica.',
          )
        }
        const assignmentReference = doc(
          actualRequestReference,
          'assignments',
          report.assignmentIdAtOpen,
        )
        const assignmentSnapshot = await transaction.get(assignmentReference)
        if (
          !assignmentSnapshot.exists()
          || assignmentSnapshot.data().status !== 'ACTIVE'
          || assignmentSnapshot.data().startedAt != null
          || assignmentSnapshot.data().professionalId !== report.professionalIdAtOpen
        ) {
          throw new ServiceReportError('stale-assignment', 'A atribuiÃ§Ã£o nÃ£o pode mais ser reaberta.')
        }
        const assignment = assignmentSnapshot.data()
        const reservationReference = doc(
          firestore,
          'professionalReservations',
          report.professionalIdAtOpen!,
          'slots',
          stringValue(assignment, 'reservationId'),
        )
        const nextRound = request.round + 1
        const nextRoundId = roundDocumentId(nextRound)
        const nextRoundReference = doc(actualRequestReference, 'rounds', nextRoundId)
        const serviceEventReference = doc(
          actualRequestReference,
          'events',
          `admin-report-${input.reportId}-${nextRoundId}`,
        )
        const [reservationSnapshot, nextRoundSnapshot, serviceEventSnapshot] = await Promise.all([
          transaction.get(reservationReference),
          transaction.get(nextRoundReference),
          transaction.get(serviceEventReference),
        ])
        if (
          !reservationSnapshot.exists()
          || reservationSnapshot.data().requestId !== report.requestId
          || reservationSnapshot.data().assignmentId !== report.assignmentIdAtOpen
          || nextRoundSnapshot.exists()
          || serviceEventSnapshot.exists()
        ) {
          throw new ServiceReportError('stale-assignment', 'Reserva, rodada ou histÃ³rico mudaram.')
        }

        let serviceDate = stringValue(request, 'serviceDate')
        let period = stringValue(request, 'period') as ServicePeriod
        let periodStartAt = dateValue(request.periodStartAt, 'periodStartAt')
        let acceptUntil = dateValue(request.acceptUntil, 'acceptUntil')
        if (input.decision === 'REOPEN_CURRENT_SCHEDULE') {
          if (
            !isProfessionalCancellationAllowed(now(), periodStartAt)
            || !isAcceptanceAllowed(now(), acceptUntil)
          ) {
            throw new ServiceReportError(
              'intervention-required',
              'O horÃ¡rio atual nÃ£o permite novos aceites. Proponha reagendamento e obtenha a ciÃªncia do cliente.',
            )
          }
        } else {
          if (
            !report.proposedServiceDate
            || !report.proposedPeriod
            || report.clientAcknowledgedProposalRevision !== report.proposalRevision
            || report.clientAcknowledgedBy !== report.clientId
          ) {
            throw new ServiceReportError(
              'acknowledgement-required',
              'O cliente precisa confirmar a proposta vigente antes da reabertura.',
            )
          }
          const window = getServiceRequestSchedulingWindow(
            report.proposedServiceDate,
            report.proposedPeriod,
            now(),
          )
          serviceDate = report.proposedServiceDate
          period = report.proposedPeriod
          periodStartAt = window.startsAt
          acceptUntil = window.acceptUntil
        }
        operational = {
          requestReference: actualRequestReference,
          request,
          assignmentReference,
          assignment,
          reservationReference,
          nextRoundReference,
          serviceEventReference,
          nextRound,
          nextRoundId,
          serviceDate,
          period,
          periodStartAt,
          acceptUntil,
        }
      }

      await afterRead?.('resolve-report', input.reportId)
      const timestamp = serverTimestamp()
      transaction.update(reportReference, {
        status: 'RESOLVED',
        resolutionDecision: input.decision,
        resolutionJustification: input.justification,
        resolvedAt: timestamp,
        resolvedBy: input.adminId,
        revision: report.revision + 1,
        lastEventId: input.operationKey,
        updatedAt: timestamp,
      })
      transaction.set(eventReference, {
        eventId: input.operationKey,
        reportId: input.reportId,
        requestId: report.requestId,
        type: 'REPORT_RESOLVED',
        actorId: input.adminId,
        actorRole: 'ADMIN',
        fromStatus: report.status,
        toStatus: 'RESOLVED',
        decision: input.decision,
        justification: input.justification,
        proposalRevision: report.proposalRevision || null,
        createdAt: timestamp,
      })
      if (input.internalNote) {
        transaction.set(doc(reportReference, 'adminNotes', input.operationKey), {
          noteId: input.operationKey,
          reportId: input.reportId,
          authorId: input.adminId,
          text: input.internalNote,
          createdAt: timestamp,
        })
      }

      if (operational) {
        const serviceEventId = operational.serviceEventReference.id
        transaction.update(operational.requestReference, {
          status: 'OPEN',
          round: operational.nextRound,
          currentRoundId: operational.nextRoundId,
          assignedProfessionalId: null,
          currentAssignmentId: null,
          reopenReason: 'ADMIN_INTERVENTION',
          excludedProfessionalIds: [report.professionalIdAtOpen],
          serviceDate: operational.serviceDate,
          period: operational.period,
          periodStartAt: Timestamp.fromDate(operational.periodStartAt),
          acceptUntil: Timestamp.fromDate(operational.acceptUntil),
          lastAdminReportId: report.reportId,
          lastAdminEventId: serviceEventId,
          updatedAt: timestamp,
        })
        transaction.update(operational.assignmentReference, {
          status: 'CANCELLED',
          endedAt: timestamp,
          endReason: 'ADMIN_INTERVENTION',
          endedEventId: serviceEventId,
          cancellationReason: input.justification,
        })
        transaction.delete(operational.reservationReference)
        transaction.set(operational.nextRoundReference, {
          roundId: operational.nextRoundId,
          requestId: report.requestId,
          round: operational.nextRound,
          status: 'OPEN',
          reason: 'ADMIN_INTERVENTION',
          excludedProfessionalIds: [report.professionalIdAtOpen],
          previousAssignmentId: report.assignmentIdAtOpen,
          openedAt: timestamp,
          closedAt: null,
          closedReason: null,
          updatedAt: timestamp,
        })
        transaction.set(operational.serviceEventReference, {
          eventId: serviceEventId,
          entityType: 'SERVICE_REQUEST',
          entityId: report.requestId,
          requestId: report.requestId,
          type: 'ADMIN_REOPENED_FROM_REPORT',
          reasonCode: 'ADMIN_REPORT_INTERVENTION',
          actorId: input.adminId,
          actorRole: 'ADMIN',
          round: report.roundAtOpen,
          targetRound: operational.nextRound,
          assignmentId: report.assignmentIdAtOpen,
          reason: input.justification,
          fromStatus: 'ASSIGNED',
          toStatus: 'OPEN',
          reportId: report.reportId,
          createdAt: timestamp,
        })
      }
      return { idempotent: false }
    })
  }

  return {
    openReport,
    listOwnReports,
    subscribeOwnReports,
    acknowledgeProposal,
    listReports,
    getAdminDetail,
    reviewReport,
    resolveReport,
  }
}
