import { createContext } from 'react'

import type { OnboardingChoice, UserProfile, UserRole } from './user-role'

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProfileContextValue {
  status: ProfileStatus
  profile: UserProfile | null
  profileError: string | null
  completeOnboarding(choice: OnboardingChoice): Promise<UserProfile>
  switchMode(mode: UserRole): Promise<UserProfile>
  retryProfile(): Promise<void>
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)
