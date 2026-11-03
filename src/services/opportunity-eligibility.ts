import type { DocumentData } from 'firebase/firestore'

import type {
  ProfessionalAvailabilitySlot,
  ProfessionalOperationalProfile,
  ServiceRequestSummary,
} from '../types/service-request'
import { isAcceptanceAllowed } from './service-period-policy'

export type OpportunityIneligibilityReason =
  | 'professional-access'
  | 'self-request'
  | 'incompatible-service'
  | 'incompatible-city'
  | 'unavailable-slot'
  | 'reserved-slot'
  | 'closed-request'
  | 'expired-request'
  | 'excluded-from-round'
  | 'refused-round'

export interface OpportunityProfessionalProfile {
  ownerId: string
  status: string
  categoryIds: string[]
  specialtyIds: string[]
  baseCityIbgeCode: string
  selectedCityIbgeCodes: string[]
}

export interface OpportunityEligibilityContext {
  professionalId: string
  operationalProfile: ProfessionalOperationalProfile | null
  professionalProfile: OpportunityProfessionalProfile | null
  availability: ProfessionalAvailabilitySlot | null
  reservationExists: boolean
  refusalExists: boolean
  now: Date
}

function stringValue(data: DocumentData, field: string) {
  return typeof data[field] === 'string' ? data[field] : ''
}

function stringArray(data: DocumentData, field: string) {
  return Array.isArray(data[field])
    ? data[field].filter(
        (value: unknown): value is string => typeof value === 'string',
      )
    : []
}

function sameStrings(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => second[index] === value)
  )
}

export function opportunityOperationalProfile(
  data: DocumentData | undefined,
): ProfessionalOperationalProfile | null {
  if (!data) return null

  return {
    professionalId: stringValue(data, 'professionalId'),
    reviewStatus: stringValue(
      data,
      'reviewStatus',
    ) as ProfessionalOperationalProfile['reviewStatus'],
    active: data.active === true,
    profileVersion:
      typeof data.profileVersion === 'number' ? data.profileVersion : 0,
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

export function opportunityProfessionalProfile(
  data: DocumentData | undefined,
): OpportunityProfessionalProfile | null {
  if (!data) return null
  const baseLocation = data.baseLocation as Record<string, unknown> | undefined

  return {
    ownerId: stringValue(data, 'ownerId'),
    status: stringValue(data, 'status'),
    categoryIds: stringArray(data, 'categoryIds'),
    specialtyIds: stringArray(data, 'specialtyIds'),
    baseCityIbgeCode:
      typeof baseLocation?.ibgeCode === 'string' ? baseLocation.ibgeCode : '',
    selectedCityIbgeCodes: stringArray(data, 'selectedCityIbgeCodes'),
  }
}

export function opportunityAvailabilitySlot(
  data: DocumentData | undefined,
): ProfessionalAvailabilitySlot | null {
  if (!data) return null
  const period = stringValue(data, 'period')
  if (!['MORNING', 'AFTERNOON', 'EVENING'].includes(period)) return null

  return {
    professionalId: stringValue(data, 'professionalId'),
    serviceDate: stringValue(data, 'serviceDate'),
    period: period as ProfessionalAvailabilitySlot['period'],
    available: data.available === true,
  }
}

export function hasCurrentApprovedProfessionalAccess(
  context: Pick<
    OpportunityEligibilityContext,
    'professionalId' | 'operationalProfile' | 'professionalProfile'
  >,
) {
  const { professionalId, operationalProfile, professionalProfile } = context
  if (!operationalProfile || !professionalProfile) return false

  return (
    operationalProfile.professionalId === professionalId &&
    operationalProfile.reviewStatus === 'APPROVED' &&
    operationalProfile.active &&
    operationalProfile.approvedVersion !== null &&
    operationalProfile.approvedVersion === operationalProfile.profileVersion &&
    professionalProfile.ownerId === professionalId &&
    professionalProfile.status === 'PUBLISHED' &&
    sameStrings(
      operationalProfile.approvedCategoryIds,
      professionalProfile.categoryIds,
    ) &&
    sameStrings(
      operationalProfile.approvedSpecialtyIds,
      professionalProfile.specialtyIds,
    ) &&
    operationalProfile.approvedBaseCityIbgeCode ===
      professionalProfile.baseCityIbgeCode &&
    sameStrings(
      operationalProfile.approvedSelectedCityIbgeCodes,
      professionalProfile.selectedCityIbgeCodes,
    )
  )
}

export function getOpportunityIneligibilityReason(
  request: ServiceRequestSummary,
  context: OpportunityEligibilityContext,
): OpportunityIneligibilityReason | null {
  if (!hasCurrentApprovedProfessionalAccess(context)) {
    return 'professional-access'
  }

  const operational = context.operationalProfile!
  if (request.clientId === context.professionalId) return 'self-request'
  if (
    !operational.approvedCategoryIds.includes(request.categoryId) ||
    !operational.approvedSpecialtyIds.includes(request.specialtyId)
  ) {
    return 'incompatible-service'
  }
  if (!operational.eligibleCityIbgeCodes.includes(request.cityIbgeCode)) {
    return 'incompatible-city'
  }
  if (request.status !== 'OPEN') return 'closed-request'
  if (!isAcceptanceAllowed(context.now, request.acceptUntil)) {
    return 'expired-request'
  }
  if (request.excludedProfessionalIds.includes(context.professionalId)) {
    return 'excluded-from-round'
  }
  if (context.refusalExists) return 'refused-round'

  const availability = context.availability
  if (
    !availability ||
    availability.professionalId !== context.professionalId ||
    availability.serviceDate !== request.serviceDate ||
    availability.period !== request.period ||
    !availability.available
  ) {
    return 'unavailable-slot'
  }
  if (context.reservationExists) return 'reserved-slot'

  return null
}
