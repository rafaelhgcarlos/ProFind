import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { User } from 'firebase/auth'

import { authService } from '../../services/auth.service'
import {
  isInvalidSessionError,
  normalizeAuthenticationError,
} from './auth-errors'
import {
  AuthenticationContext,
  type AuthenticationContextValue,
  type AuthenticationStatus,
} from './auth-context'

interface AuthenticationState {
  status: AuthenticationStatus
  user: User | null
  sessionError: string | null
}

const initialState: AuthenticationState = {
  status: 'loading',
  user: null,
  sessionError: null,
}

export function AuthenticationProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(initialState)
  const sessionSequence = useRef(0)

  const validateSession = useCallback(async (user: User | null) => {
    const sequence = ++sessionSequence.current

    if (!user) {
      setState({ status: 'unauthenticated', user: null, sessionError: null })
      return
    }

    setState({ status: 'loading', user: null, sessionError: null })

    try {
      await authService.reloadUser(user)
      if (sequence === sessionSequence.current) {
        setState({ status: 'authenticated', user, sessionError: null })
      }
    } catch (error) {
      if (sequence !== sessionSequence.current) return

      if (isInvalidSessionError(error)) {
        const message = normalizeAuthenticationError(error).message
        await authService.signOut().catch(() => undefined)
        setState({ status: 'unauthenticated', user: null, sessionError: message })
        return
      }

      setState({
        status: 'error',
        user: null,
        sessionError: normalizeAuthenticationError(error).message,
      })
    }
  }, [])

  useEffect(() => {
    const unsubscribe = authService.observeSession(
      (user) => void validateSession(user),
      (error) => {
        sessionSequence.current += 1
        if (isInvalidSessionError(error)) {
          const message = normalizeAuthenticationError(error).message
          void authService.signOut().catch(() => undefined).finally(() => {
            setState({ status: 'unauthenticated', user: null, sessionError: message })
          })
          return
        }
        setState({
          status: 'error',
          user: null,
          sessionError: normalizeAuthenticationError(error).message,
        })
      },
    )

    return () => {
      sessionSequence.current += 1
      unsubscribe()
    }
  }, [validateSession])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const credential = await authService.signInWithEmail(email, password)
      await authService.reloadUser(credential.user)
      sessionSequence.current += 1
      setState({ status: 'authenticated', user: credential.user, sessionError: null })
    } catch (error) {
      const authenticationError = normalizeAuthenticationError(error)
      if (authenticationError.code === 'account-disabled') {
        await authService.signOut().catch(() => undefined)
        setState({ status: 'unauthenticated', user: null, sessionError: null })
      }
      throw authenticationError
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.signOut()
      sessionSequence.current += 1
      setState({ status: 'unauthenticated', user: null, sessionError: null })
    } catch (error) {
      throw normalizeAuthenticationError(error)
    }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      await authService.sendPasswordReset(email)
    } catch (error) {
      const normalizedError = normalizeAuthenticationError(error)
      if (normalizedError.code === 'invalid-credentials') return
      throw normalizedError
    }
  }, [])

  const retrySession = useCallback(async () => {
    await validateSession(authService.getCurrentUser())
  }, [validateSession])

  const value = useMemo<AuthenticationContextValue>(
    () => ({ ...state, login, logout, requestPasswordReset, retrySession }),
    [login, logout, requestPasswordReset, retrySession, state],
  )

  return (
    <AuthenticationContext.Provider value={value}>
      {children}
    </AuthenticationContext.Provider>
  )
}
