import type {
  AssignmentStatus,
  DistributionRoundReason,
  DistributionRoundStatus,
  ServicePeriod,
  ServiceRequestEvent,
  ServiceRequestPrivateData,
  ServiceRequestStatus,
  ServiceRequestSummary,
} from './service-request'

export interface AdminRequestCursor {
  serviceDate: string
  requestId: string
}

export interface AdminRequestFilters {
  status?: ServiceRequestStatus
  period?: ServicePeriod
  scheduledFrom?: string
  scheduledTo?: string
  requestId?: string
  pageSize?: number
  cursor?: AdminRequestCursor | null
}

export interface AdminRequestListItem {
  request: ServiceRequestSummary
  city: string
  stateCode: string
  createdAt: Date
  responsibleName: string | null
}

export interface AdminRequestPage {
  items: AdminRequestListItem[]
  nextCursor: AdminRequestCursor | null
}

export interface AdminDistributionRound {
  roundId: string
  round: number
  status: DistributionRoundStatus
  reason: DistributionRoundReason
  previousAssignmentId: string | null
  excludedProfessionalIds: string[]
  openedAt: Date | null
  closedAt: Date | null
  closedReason: string | null
}

export interface AdminAssignment {
  assignmentId: string
  professionalId: string
  professionalName: string | null
  round: number
  status: AssignmentStatus
  acceptedAt: Date | null
  startedAt: Date | null
  endedAt: Date | null
  endedReason: string | null
}

export interface AdminRequestDetail {
  request: ServiceRequestSummary
  privateData: ServiceRequestPrivateData
  createdAt: Date
  updatedAt: Date
  responsibleName: string | null
  rounds: AdminDistributionRound[]
  assignments: AdminAssignment[]
  history: ServiceRequestEvent[]
}

export type AdminRequestErrorCode =
  | 'unauthenticated'
  | 'validation'
  | 'not-found'
  | 'permission-denied'
  | 'unavailable'
  | 'unknown'

export class AdminRequestError extends Error {
  constructor(
    public readonly code: AdminRequestErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AdminRequestError'
  }
}
