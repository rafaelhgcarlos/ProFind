import { createContext } from 'react'
import type { User } from 'firebase/auth'

export type AuthenticationStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error'

export interface AuthenticationContextValue {
  status: AuthenticationStatus
  user: User | null
  sessionError: string | null
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  retrySession(): Promise<void>
}

export const AuthenticationContext =
  createContext<AuthenticationContextValue | null>(null)
