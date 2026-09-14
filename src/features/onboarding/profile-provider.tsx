import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import {
  completeOnboarding as completeOnboardingProfile,
  loadUserProfile,
  switchActiveMode,
} from '../../services/onboarding.service'
import { useAuth } from '../auth/use-auth'
import {
  ProfileContext,
  type ProfileContextValue,
  type ProfileStatus,
} from './profile-context'
import type { OnboardingChoice, UserProfile, UserRole } from './user-role'

interface ProfileState {
  userId: string | null
  status: ProfileStatus
  profile: UserProfile | null
  profileError: string | null
}

const initialState: ProfileState = {
  userId: null,
  status: 'idle',
  profile: null,
  profileError: null,
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const { status: authenticationStatus, user } = useAuth()
  const [state, setState] = useState(initialState)
  const requestSequence = useRef(0)

  const loadProfile = useCallback(async (userId: string) => {
    const sequence = ++requestSequence.current
    setState({ userId, status: 'loading', profile: null, profileError: null })

    try {
      const profile = await loadUserProfile(userId)
      if (sequence === requestSequence.current) {
        setState({ userId, status: 'ready', profile, profileError: null })
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        setState({
          status: 'error',
          userId,
          profile: null,
          profileError:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar seu perfil.',
        })
      }
    }
  }, [])

  useEffect(() => {
    if (authenticationStatus === 'authenticated' && user) {
      const sequence = ++requestSequence.current
      const userId = user.uid

      void loadUserProfile(userId)
        .then((profile) => {
          if (sequence === requestSequence.current) {
            setState({ userId, status: 'ready', profile, profileError: null })
          }
        })
        .catch((error: unknown) => {
          if (sequence === requestSequence.current) {
            setState({
              userId,
              status: 'error',
              profile: null,
              profileError:
                error instanceof Error
                  ? error.message
                  : 'Não foi possível carregar seu perfil.',
            })
          }
        })
    }

    return () => {
      requestSequence.current += 1
    }
  }, [authenticationStatus, user])

  const completeOnboarding = useCallback(
    async (choice: OnboardingChoice) => {
      if (!user) throw new Error('Sua sessão não está disponível.')
      const profile = await completeOnboardingProfile(user.uid, choice)
      setState({ userId: user.uid, status: 'ready', profile, profileError: null })
      return profile
    },
    [user],
  )

  const switchMode = useCallback(
    async (mode: UserRole) => {
      if (!state.profile) throw new Error('Seu perfil ainda não está disponível.')
      const profile = await switchActiveMode(state.profile, mode)
      setState({
        userId: profile.userId,
        status: 'ready',
        profile,
        profileError: null,
      })
      return profile
    },
    [state.profile],
  )

  const retryProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user.uid)
  }, [loadProfile, user])

  const currentUserId =
    authenticationStatus === 'authenticated' ? (user?.uid ?? null) : null
  const visibleState = useMemo<ProfileState>(
    () =>
      currentUserId
        ? state.userId === currentUserId
          ? state
          : {
              userId: currentUserId,
              status: 'loading',
              profile: null,
              profileError: null,
            }
        : initialState,
    [currentUserId, state],
  )

  const value = useMemo<ProfileContextValue>(
    () => ({
      status: visibleState.status,
      profile: visibleState.profile,
      profileError: visibleState.profileError,
      completeOnboarding,
      switchMode,
      retryProfile,
    }),
    [completeOnboarding, retryProfile, switchMode, visibleState],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
