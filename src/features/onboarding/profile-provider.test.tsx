import { render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { vi } from 'vitest'

import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../auth/auth-context'
import {
  loadUserProfile,
  completeOnboarding,
  switchActiveMode,
} from '../../services/onboarding.service'
import { ProfileProvider } from './profile-provider'
import { useProfile } from './use-profile'
import type { UserProfile } from './user-role'

vi.mock('../../services/onboarding.service', () => ({
  loadUserProfile: vi.fn(),
  completeOnboarding: vi.fn(),
  switchActiveMode: vi.fn(),
}))

const profile: UserProfile = {
  userId: 'user-123',
  name: 'Marina Souza',
  email: 'marina@example.com',
  roles: [],
  activeMode: null,
  professionalProfileStatus: 'not-started',
}

const auth: AuthenticationContextValue = {
  status: 'authenticated',
  user: { uid: 'user-123', email: 'marina@example.com' } as User,
  sessionError: null,
  login: vi.fn(),
  logout: vi.fn(),
  requestPasswordReset: vi.fn(),
  retrySession: vi.fn(),
}

function ProfileProbe() {
  const { status, profile: currentProfile } = useProfile()
  return <p>{status === 'ready' ? currentProfile?.name : status}</p>
}

describe('ProfileProvider', () => {
  it('não expõe o perfil antes de carregar os dados da identidade atual', async () => {
    let finishLoading: ((value: typeof profile) => void) | undefined
    vi.mocked(loadUserProfile).mockImplementation(
      () => new Promise((resolve) => { finishLoading = resolve }),
    )

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <ProfileProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
    finishLoading?.(profile)
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
  })

  it('transforma falha de carregamento em estado recuperável', async () => {
    vi.mocked(loadUserProfile).mockRejectedValue(new Error('Perfil indisponível'))
    vi.mocked(completeOnboarding).mockReset()
    vi.mocked(switchActiveMode).mockReset()

    function ErrorProbe() {
      const { status, profileError } = useProfile()
      return <p>{status === 'error' ? profileError : status}</p>
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <ErrorProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(await screen.findByText('Perfil indisponível')).toBeInTheDocument()
  })
})
