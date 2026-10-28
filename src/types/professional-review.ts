export const PROFESSIONAL_REVIEW_STATUSES = [
  'DRAFT',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const

export type ProfessionalReviewStatus =
  (typeof PROFESSIONAL_REVIEW_STATUSES)[number]

export const PROFESSIONAL_REVIEW_ACTIONS = [
  'PROFILE_UPDATED',
  'PROFILE_SUBMITTED',
  'PROFILE_RESUBMITTED',
  'REANALYSIS_REQUIRED',
  'APPROVED',
  'APPROVED_AND_ACTIVATED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'SUSPENDED',
  'ACTIVATED',
  'DEACTIVATED',
] as const

export type ProfessionalReviewAction =
  (typeof PROFESSIONAL_REVIEW_ACTIONS)[number]

export const PROFESSIONAL_REVIEW_REASON_CODES = [
  'PROFILE_DATA_CHANGED',
  'PROFESSIONAL_SUBMISSION',
  'PROFESSIONAL_RESUBMISSION',
  'ADMIN_DECISION',
  'ADMIN_SUSPENSION',
  'ADMIN_ACTIVATION_CHANGE',
] as const

export type ProfessionalReviewReasonCode =
  (typeof PROFESSIONAL_REVIEW_REASON_CODES)[number]

export const PROFESSIONAL_REVIEW_HISTORY_LIMIT = 50

export interface ProfessionalOperationalReview {
  schemaVersion: 1
  professionalId: string
  reviewStatus: ProfessionalReviewStatus
  active: boolean
  profileVersion: number
  submittedVersion: number | null
  approvedVersion: number | null
  revision: number
  lastEventId: string | null
  professionalFeedback: string | null
  approvedCategoryIds: string[]
  approvedSpecialtyIds: string[]
  approvedBaseCityIbgeCode: string
  approvedSelectedCityIbgeCodes: string[]
  eligibleCityIbgeCodes: string[]
}

export interface ProfessionalReviewEvent {
  eventId: string
  entityType: 'PROFESSIONAL'
  entityId: string
  professionalId: string
  actorId: string
  actorRole: 'PROFESSIONAL' | 'ADMIN'
  action: ProfessionalReviewAction
  reasonCode: ProfessionalReviewReasonCode
  fromStatus: ProfessionalReviewStatus
  toStatus: ProfessionalReviewStatus
  profileVersion: number
  reviewedVersion: number | null
  reason: string | null
  createdAt: Date
}

export type AdministrativeReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'

export type ProfessionalReviewErrorCode =
  | 'unauthenticated'
  | 'not-found'
  | 'invalid-transition'
  | 'stale-version'
  | 'stale-revision'
  | 'invalid-profile'
  | 'reason-required'
  | 'permission-denied'
  | 'unavailable'
  | 'unknown'

export class ProfessionalReviewError extends Error {
  constructor(
    public readonly code: ProfessionalReviewErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ProfessionalReviewError'
  }
}

export function reviewEventId(revision: number) {
  return `review-${revision}`
}

export function professionalReviewReasonCode(
  action: ProfessionalReviewAction,
): ProfessionalReviewReasonCode {
  if (action === 'PROFILE_UPDATED' || action === 'REANALYSIS_REQUIRED') {
    return 'PROFILE_DATA_CHANGED'
  }
  if (action === 'PROFILE_SUBMITTED') return 'PROFESSIONAL_SUBMISSION'
  if (action === 'PROFILE_RESUBMITTED') return 'PROFESSIONAL_RESUBMISSION'
  if (action === 'SUSPENDED') return 'ADMIN_SUSPENSION'
  if (action === 'ACTIVATED' || action === 'DEACTIVATED') {
    return 'ADMIN_ACTIVATION_CHANGE'
  }
  return 'ADMIN_DECISION'
}
