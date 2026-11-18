import type {
  AdminRequestDetail,
} from './admin-service-request'
import type {
  ServicePeriod,
  ServiceRequestStatus,
} from './service-request'

export const SERVICE_REPORT_REASONS = [
  'NO_SHOW',
  'SERVICE_PROBLEM',
  'OTHER',
] as const

export const SERVICE_REPORT_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
] as const

export const SERVICE_REPORT_DECISIONS = [
  'NO_OPERATIONAL_CHANGE',
  'REOPEN_CURRENT_SCHEDULE',
  'RESCHEDULE_AND_REOPEN',
] as const

export type ServiceReportReason = (typeof SERVICE_REPORT_REASONS)[number]
export type ServiceReportStatus = (typeof SERVICE_REPORT_STATUSES)[number]
export type ServiceReportDecision = (typeof SERVICE_REPORT_DECISIONS)[number]

export interface ServiceReport {
  reportId: string
  operationKey: string
  requestId: string
  clientId: string
  reason: ServiceReportReason
  description: string
  status: ServiceReportStatus
  requestStatusAtOpen: ServiceRequestStatus
  roundAtOpen: number
  assignmentIdAtOpen: string | null
  professionalIdAtOpen: string | null
  revision: number
  lastEventId: string
  reviewedAt: Date | null
  reviewedBy: string | null
  resolutionDecision: ServiceReportDecision | null
  resolutionJustification: string | null
  resolvedAt: Date | null
  resolvedBy: string | null
  proposedServiceDate: string | null
  proposedPeriod: ServicePeriod | null
  proposalRevision: number
  proposedAt: Date | null
  proposedBy: string | null
  clientAcknowledgedProposalRevision: number | null
  clientAcknowledgedAt: Date | null
  clientAcknowledgedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ServiceReportHistoryEvent {
  eventId: string
  reportId: string
  requestId: string
  type:
    | 'REPORT_OPENED'
    | 'REVIEW_STARTED'
    | 'RESCHEDULE_PROPOSED'
    | 'RESCHEDULE_ACKNOWLEDGED'
    | 'REPORT_RESOLVED'
  actorId: string
  actorRole: 'CLIENT' | 'ADMIN'
  fromStatus: ServiceReportStatus | null
  toStatus: ServiceReportStatus
  decision: ServiceReportDecision | null
  justification: string | null
  proposalRevision: number | null
  createdAt: Date
}

export interface ServiceReportAdminNote {
  noteId: string
  reportId: string
  authorId: string
  text: string
  createdAt: Date
}

export interface ServiceReportCursor {
  createdAt: Date
  reportId: string
}

export interface ServiceReportPage {
  items: ServiceReport[]
  nextCursor: ServiceReportCursor | null
}

export interface AdminServiceReportFilters {
  status?: ServiceReportStatus
  requestId?: string
  pageSize?: number
  cursor?: ServiceReportCursor | null
}

export interface AdminServiceReportDetail {
  report: ServiceReport
  request: AdminRequestDetail
  history: ServiceReportHistoryEvent[]
  internalNotes: ServiceReportAdminNote[]
}

export type ServiceReportErrorCode =
  | 'unauthenticated'
  | 'validation'
  | 'not-found'
  | 'permission-denied'
  | 'stale-report'
  | 'stale-assignment'
  | 'intervention-required'
  | 'acknowledgement-required'
  | 'offline'
  | 'unavailable'
  | 'unknown'

export class ServiceReportError extends Error {
  constructor(
    public readonly code: ServiceReportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ServiceReportError'
  }
}
