import { createContext } from 'react'

import type {
  ClientProfile,
  ClientProfileEditor,
  ClientProfileReadiness,
} from '../../types/client-profile'
import type {
  OnboardingChoice,
  ProfessionalProfileStatus,
  UserProfile,
  UserRole,
} from './user-role'

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProfileContextValue {
  status: ProfileStatus
  profile: UserProfile | null
  profileError: string | null
  clientProfile: ClientProfile | null
  clientProfileReadiness: ClientProfileReadiness | null
  completeOnboarding(choice: OnboardingChoice): Promise<UserProfile>
  switchMode(mode: UserRole): Promise<UserProfile>
  resolveLandingRoute(profile: UserProfile): Promise<string>
  syncClientProfile(profile: ClientProfileEditor): void
  syncProfessionalProfileStatus(status: ProfessionalProfileStatus): void
  retryProfile(): Promise<void>
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)
