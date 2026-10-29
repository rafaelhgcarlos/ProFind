import type { ProfessionalReviewStatus } from './professional-review'

export const SERVICE_REQUEST_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

export const SERVICE_PERIODS = ['MORNING', 'AFTERNOON', 'EVENING'] as const

export const DISTRIBUTION_ROUND_STATUSES = ['OPEN', 'CLOSED'] as const
export const DISTRIBUTION_ROUND_REASONS = [
  'INITIAL',
  'PROFESSIONAL_CANCELLATION',
] as const
export const ASSIGNMENT_STATUSES = ['ACTIVE', 'CANCELLED', 'COMPLETED'] as const
export const SERVICE_EVENT_TYPES = [
  'REQUEST_CREATED',
  'REQUEST_CANCELLED',
  'REQUEST_ASSIGNED',
  'PROFESSIONAL_REFUSED',
  'PROFESSIONAL_CANCELLED_AND_REOPENED',
] as const

export const SERVICE_EVENT_REASON_CODES = [
  'CLIENT_REQUEST',
  'CLIENT_CANCELLATION',
  'PROFESSIONAL_ACCEPTANCE',
  'PROFESSIONAL_REFUSAL',
  'PROFESSIONAL_CANCELLATION',
] as const

export const SERVICE_EVENT_HISTORY_LIMIT = 50

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number]
export type ServicePeriod = (typeof SERVICE_PERIODS)[number]
export type DistributionRoundStatus =
  (typeof DISTRIBUTION_ROUND_STATUSES)[number]
export type DistributionRoundReason =
  (typeof DISTRIBUTION_ROUND_REASONS)[number]
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]
export type ServiceEventType = (typeof SERVICE_EVENT_TYPES)[number]
export type ServiceEventReasonCode =
  (typeof SERVICE_EVENT_REASON_CODES)[number]

export interface ServiceRequestSummary {
  requestId: string
  operationKey: string
  clientId: string
  categoryId: string
  specialtyId: string
  cityIbgeCode: string
  serviceDate: string
  period: ServicePeriod
  periodStartAt: Date
  acceptUntil: Date
  status: ServiceRequestStatus
  round: number
  currentRoundId: string
  assignedProfessionalId: string | null
  currentAssignmentId: string | null
  reopenReason: 'PROFESSIONAL_CANCELLATION' | null
  excludedProfessionalIds: string[]
}

export interface ServiceRequestPrivateData {
  requestId: string
  operationKey: string
  clientId: string
  contactName: string
  contactPhone: string
  notes: string
  address: {
    street: string
    number: string
    complement?: string
    neighborhood: string
    city: string
    stateCode: string
    postalCode: string
    ibgeCode: string
  }
}

export interface ServiceAssignment {
  assignmentId: string
  requestId: string
  clientId: string
  professionalId: string
  round: number
  status: AssignmentStatus
  serviceDate: string
  period: ServicePeriod
  reservationId: string
  acceptedEventId: string
  endedEventId?: string
}

export interface DistributionRound {
  roundId: string
  requestId: string
  round: number
  status: DistributionRoundStatus
  reason: DistributionRoundReason
  excludedProfessionalIds: string[]
  previousAssignmentId: string | null
}

export interface ProfessionalRoundRefusal {
  requestId: string
  roundId: string
  round: number
  professionalId: string
  decision: 'REFUSED'
  eventId: string
}

export interface ProfessionalAvailabilitySlot {
  professionalId: string
  serviceDate: string
  period: ServicePeriod
  available: boolean
}

export interface ProfessionalReservation {
  reservationId: string
  professionalId: string
  requestId: string
  assignmentId: string
  serviceDate: string
  period: ServicePeriod
  round: number
}

export interface ProfessionalOperationalProfile {
  professionalId: string
  reviewStatus: ProfessionalReviewStatus
  active: boolean
  profileVersion: number
  submittedVersion?: number | null
  approvedVersion: number | null
  revision?: number
  lastEventId?: string | null
  professionalFeedback?: string | null
  approvedCategoryIds: string[]
  approvedSpecialtyIds: string[]
  approvedBaseCityIbgeCode: string
  approvedSelectedCityIbgeCodes: string[]
  eligibleCityIbgeCodes: string[]
}

export interface ServiceRequestEvent {
  eventId: string
  entityType: 'SERVICE_REQUEST'
  entityId: string
  requestId: string
  type: ServiceEventType
  reasonCode: ServiceEventReasonCode
  actorId: string
  actorRole: 'CLIENT' | 'PROFESSIONAL'
  round: number
  assignmentId: string | null
  fromStatus: ServiceRequestStatus
  toStatus: ServiceRequestStatus
  targetRound?: number
  createdAt: Date
}

export type ServiceRequestErrorCode =
  | 'unauthenticated'
  | 'validation'
  | 'profile-incomplete'
  | 'already-created'
  | 'not-found'
  | 'not-open'
  | 'round-changed'
  | 'not-eligible'
  | 'request-expired'
  | 'slot-conflict'
  | 'already-refused'
  | 'not-assigned-professional'
  | 'stale-assignment'
  | 'intervention-required'
  | 'permission-denied'
  | 'unavailable'
  | 'unknown'

export class ServiceRequestError extends Error {
  constructor(
    public readonly code: ServiceRequestErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ServiceRequestError'
  }
}
