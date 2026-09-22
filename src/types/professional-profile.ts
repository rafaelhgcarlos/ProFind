import type { ImageReference } from './image'

export const PROFESSIONAL_PROFILE_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'SUSPENDED',
] as const

export const PROFESSIONAL_AVAILABILITIES = [
  'AVAILABLE',
  'LIMITED',
  'UNAVAILABLE',
] as const

export const PROFESSIONAL_SERVICE_MODES = [
  'CITY_ONLY',
  'RADIUS',
  'SELECTED_CITIES',
] as const

export const PROFESSIONAL_CONTACT_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const

export const PROFESSIONAL_SERVICE_RADIUS_OPTIONS = [5, 10, 20, 30, 50] as const

export type ProfessionalProfileStatus =
  (typeof PROFESSIONAL_PROFILE_STATUSES)[number]
export type ProfessionalAvailability =
  (typeof PROFESSIONAL_AVAILABILITIES)[number]
export type ProfessionalServiceMode =
  (typeof PROFESSIONAL_SERVICE_MODES)[number]
export type ProfessionalContactVisibility =
  (typeof PROFESSIONAL_CONTACT_VISIBILITIES)[number]

export const BRAZILIAN_STATE_CODES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

export type BrazilianStateCode = (typeof BRAZILIAN_STATE_CODES)[number]

export interface ProfessionalBaseLocation {
  city: string
  stateCode: string
  ibgeCode: string
}

export interface ProfessionalPrivateLocation {
  postalCode: string
  neighborhood?: string
}

export interface ProfessionalImageMetadata extends ImageReference {
  order: number
  altText: string
}

export interface ProfessionalProfileInput {
  publicName: string
  headline: string
  bio?: string
  categoryIds: string[]
  specialtyIds: string[]
  experienceYears: number | null
  baseLocation: ProfessionalBaseLocation
  serviceMode: ProfessionalServiceMode | null
  serviceRadiusKm: number | null
  selectedCities: ProfessionalBaseLocation[]
  availability: ProfessionalAvailability
  phone: string
  contactVisibility: ProfessionalContactVisibility
  privateLocation: ProfessionalPrivateLocation
  profileImage: ProfessionalImageMetadata | null
  portfolioImages: ProfessionalImageMetadata[]
}

export type ProfessionalPublicProfileInput = Omit<
  ProfessionalProfileInput,
  'phone' | 'privateLocation'
> & {
  phone?: string
}

export interface ProfessionalPrivateProfileInput {
  phone: string
  privateLocation: ProfessionalPrivateLocation
}

export interface ProfessionalProfile extends ProfessionalProfileInput {
  userId: string
  status: ProfessionalProfileStatus
  readonly rating?: number
  readonly reviewCount?: number
  readonly completedJobsCount?: number
}

export function isProfessionalProfileStatus(
  value: unknown,
): value is ProfessionalProfileStatus {
  return (
    typeof value === 'string' &&
    PROFESSIONAL_PROFILE_STATUSES.includes(value as ProfessionalProfileStatus)
  )
}

export function isProfessionalAvailability(
  value: unknown,
): value is ProfessionalAvailability {
  return (
    typeof value === 'string' &&
    PROFESSIONAL_AVAILABILITIES.includes(value as ProfessionalAvailability)
  )
}

export function isProfessionalServiceMode(
  value: unknown,
): value is ProfessionalServiceMode {
  return (
    typeof value === 'string' &&
    PROFESSIONAL_SERVICE_MODES.includes(value as ProfessionalServiceMode)
  )
}

export function isProfessionalContactVisibility(
  value: unknown,
): value is ProfessionalContactVisibility {
  return (
    typeof value === 'string' &&
    PROFESSIONAL_CONTACT_VISIBILITIES.includes(
      value as ProfessionalContactVisibility,
    )
  )
}
