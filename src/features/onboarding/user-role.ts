import type { ImageReference } from '../../types/image'

export const USER_ROLES = ['client', 'professional'] as const

export type UserRole = (typeof USER_ROLES)[number]
export type OnboardingChoice = UserRole | 'both'
export type ProfessionalProfileStatus =
  | 'not-started'
  | 'incomplete'
  | 'complete'

export interface UserProfile {
  userId: string
  name: string
  email: string
  roles: UserRole[]
  activeMode: UserRole | null
  professionalProfileStatus: ProfessionalProfileStatus
  clientAvatar?: ImageReference | null
}

export const roleLabels: Record<UserRole, string> = {
  client: 'Cliente',
  professional: 'Profissional',
}

export const roleHomeRoutes: Record<UserRole, string> = {
  client: '/cliente',
  professional: '/profissional',
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole)
}

export function isProfessionalProfileStatus(
  value: unknown,
): value is ProfessionalProfileStatus {
  return (
    value === 'not-started' || value === 'incomplete' || value === 'complete'
  )
}

export function rolesForChoice(choice: OnboardingChoice): UserRole[] {
  if (choice === 'both') return [...USER_ROLES]
  return [choice]
}

export function initialModeForChoice(choice: OnboardingChoice): UserRole {
  return choice === 'professional' ? 'professional' : 'client'
}

export function hasCompletedOnboarding(
  profile: UserProfile,
): profile is UserProfile & { activeMode: UserRole } {
  return (
    profile.roles.length > 0 &&
    profile.activeMode !== null &&
    profile.roles.includes(profile.activeMode)
  )
}

export function hasPublicableProfessionalProfile(profile: UserProfile) {
  return (
    profile.roles.includes('professional') &&
    profile.professionalProfileStatus === 'complete'
  )
}
