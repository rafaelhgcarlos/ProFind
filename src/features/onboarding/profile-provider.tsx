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
import {
  clientLandingRoute,
  deriveClientProfileReadiness,
  loadClientProfileState,
} from '../../services/client-profile.service'
import type {
  ClientProfile,
  ClientProfileEditor,
  ClientProfileReadiness,
} from '../../types/client-profile'
import {
  loadProfessionalProfile,
  userProfileStatusForProfessionalProfile,
} from '../../services/professional-profile.service'
import type { ProfessionalProfile } from '../../types/professional-profile'
import { useAuth } from '../auth/use-auth'
import {
  ProfileContext,
  type ProfileContextValue,
  type ProfileStatus,
} from './profile-context'
import type {
  OnboardingChoice,
  ProfessionalProfileStatus,
  UserProfile,
  UserRole,
} from './user-role'

interface ProfileState {
  userId: string | null
  status: ProfileStatus
  profile: UserProfile | null
  profileError: string | null
  clientProfile: ClientProfile | null
  clientProfileReadiness: ClientProfileReadiness | null
  professionalProfile: ProfessionalProfile | null
}

const initialState: ProfileState = {
  userId: null,
  status: 'idle',
  profile: null,
  profileError: null,
  clientProfile: null,
  clientProfileReadiness: null,
  professionalProfile: null,
}

async function loadProfileState(userId: string): Promise<ProfileState> {
  const profile = await loadUserProfile(userId)
  const [clientState, professionalProfile] = await Promise.all([
    profile.activeMode === 'client' ? loadClientProfileState(profile) : null,
    profile.activeMode === 'professional'
      ? loadProfessionalProfile(userId)
      : null,
  ])
  return {
    userId,
    status: 'ready',
    profile,
    profileError: null,
    clientProfile: clientState?.profile ?? null,
    clientProfileReadiness: clientState?.readiness ?? null,
    professionalProfile,
  }
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const { status: authenticationStatus, user } = useAuth()
  const [state, setState] = useState(initialState)
  const requestSequence = useRef(0)

  const loadProfile = useCallback(async (userId: string) => {
    const sequence = ++requestSequence.current
    setState({
      userId,
      status: 'loading',
      profile: null,
      profileError: null,
      clientProfile: null,
      clientProfileReadiness: null,
      professionalProfile: null,
    })

    try {
      const nextState = await loadProfileState(userId)
      if (sequence === requestSequence.current) {
        setState(nextState)
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
          clientProfile: null,
          clientProfileReadiness: null,
          professionalProfile: null,
        })
      }
    }
  }, [])

  useEffect(() => {
    if (authenticationStatus === 'authenticated' && user) {
      const sequence = ++requestSequence.current
      const userId = user.uid

      void loadProfileState(userId)
        .then((nextState) => {
          if (sequence === requestSequence.current) {
            setState(nextState)
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
              clientProfile: null,
              clientProfileReadiness: null,
              professionalProfile: null,
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
      const [clientState, professionalProfile] = await Promise.all([
        profile.activeMode === 'client' ? loadClientProfileState(profile) : null,
        profile.activeMode === 'professional'
          ? loadProfessionalProfile(profile.userId)
          : null,
      ])
      setState({
        userId: user.uid,
        status: 'ready',
        profile,
        profileError: null,
        clientProfile: clientState?.profile ?? null,
        clientProfileReadiness: clientState?.readiness ?? null,
        professionalProfile,
      })
      return profile
    },
    [user],
  )

  const switchMode = useCallback(
    async (mode: UserRole) => {
      if (!state.profile) throw new Error('Seu perfil ainda não está disponível.')
      const profile = await switchActiveMode(state.profile, mode)
      const [clientState, professionalProfile] = await Promise.all([
        mode === 'client' ? loadClientProfileState(profile) : null,
        mode === 'professional'
          ? loadProfessionalProfile(profile.userId)
          : null,
      ])
      setState({
        userId: profile.userId,
        status: 'ready',
        profile,
        profileError: null,
        clientProfile: clientState?.profile ?? state.clientProfile,
        clientProfileReadiness:
          clientState?.readiness ?? state.clientProfileReadiness,
        professionalProfile:
          mode === 'professional'
            ? professionalProfile
            : state.professionalProfile,
      })
      return profile
    },
    [
      state.clientProfile,
      state.clientProfileReadiness,
      state.professionalProfile,
      state.profile,
    ],
  )

  const resolveLandingRoute = useCallback(async (profile: UserProfile) => {
    if (profile.activeMode !== 'client') return '/profissional'
    const clientState = await loadClientProfileState(profile)
    setState((current) =>
      current.userId === profile.userId
        ? {
            ...current,
            profile,
            clientProfile: clientState.profile,
            clientProfileReadiness: clientState.readiness,
            professionalProfile: current.professionalProfile,
          }
        : current,
    )
    return clientLandingRoute(clientState.readiness)
  }, [])

  const syncClientProfile = useCallback((editor: ClientProfileEditor) => {
    setState((current) => {
      if (!current.profile || current.profile.userId !== editor.userId) {
        return current
      }
      const profile = { ...current.profile, name: editor.name }
      const clientProfile: ClientProfile = {
        userId: editor.userId,
        phone: editor.phone,
        profileImage: editor.profileImage,
      }
      return {
        ...current,
        profile,
        clientProfile,
        clientProfileReadiness: deriveClientProfileReadiness(
          profile,
          clientProfile,
        ),
      }
    })
  }, [])

  const retryProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user.uid)
  }, [loadProfile, user])

  const syncProfessionalProfile = useCallback(
    (professionalProfile: ProfessionalProfile) => {
      setState((current) => {
        if (
          !current.profile ||
          current.profile.userId !== professionalProfile.userId
        ) {
          return current
        }
        const professionalProfileStatus =
          professionalProfile.status === 'SUSPENDED'
            ? current.profile.professionalProfileStatus
            : userProfileStatusForProfessionalProfile(
                professionalProfile.status,
              )
        return {
          ...current,
          profile: { ...current.profile, professionalProfileStatus },
          professionalProfile,
        }
      })
    },
    [],
  )

  const syncProfessionalProfileStatus = useCallback(
    (professionalProfileStatus: ProfessionalProfileStatus) => {
      setState((current) =>
        current.profile
          ? {
              ...current,
              profile: { ...current.profile, professionalProfileStatus },
            }
          : current,
      )
    },
    [],
  )

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
              clientProfile: null,
              clientProfileReadiness: null,
              professionalProfile: null,
            }
        : initialState,
    [currentUserId, state],
  )

  const value = useMemo<ProfileContextValue>(
    () => ({
      status: visibleState.status,
      profile: visibleState.profile,
      profileError: visibleState.profileError,
      clientProfile: visibleState.clientProfile,
      clientProfileReadiness: visibleState.clientProfileReadiness,
      professionalProfile: visibleState.professionalProfile,
      completeOnboarding,
      switchMode,
      resolveLandingRoute,
      syncClientProfile,
      syncProfessionalProfile,
      syncProfessionalProfileStatus,
      retryProfile,
    }),
    [
      completeOnboarding,
      retryProfile,
      resolveLandingRoute,
      switchMode,
      syncClientProfile,
      syncProfessionalProfile,
      syncProfessionalProfileStatus,
      visibleState,
    ],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
