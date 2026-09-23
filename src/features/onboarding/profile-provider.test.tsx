import { fireEvent, render, screen } from '@testing-library/react'
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
import { loadClientProfileState } from '../../services/client-profile.service'
import { ProfileProvider } from './profile-provider'
import { useProfile } from './use-profile'
import type { UserProfile } from './user-role'

vi.mock('../../services/onboarding.service', () => ({
  loadUserProfile: vi.fn(),
  completeOnboarding: vi.fn(),
  switchActiveMode: vi.fn(),
}))

vi.mock('../../services/client-profile.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/client-profile.service')>()
  return { ...actual, loadClientProfileState: vi.fn() }
})

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

  it('carrega a prontidão derivada para contas com papel Cliente', async () => {
    const clientUser = {
      ...profile,
      roles: ['client'] as UserProfile['roles'],
      activeMode: 'client' as const,
    }
    vi.mocked(loadUserProfile).mockResolvedValue(clientUser)
    vi.mocked(loadClientProfileState).mockResolvedValue({
      profile: null,
      readiness: { isComplete: false, missingFields: ['clientProfile'] },
    })

    function ClientProbe() {
      const { clientProfileReadiness, status } = useProfile()
      return (
        <p>
          {status === 'ready'
            ? clientProfileReadiness?.isComplete
              ? 'pronto'
              : clientProfileReadiness?.missingFields.join(',')
            : status}
        </p>
      )
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <ClientProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(await screen.findByText('clientProfile')).toBeInTheDocument()
    expect(loadClientProfileState).toHaveBeenCalledWith(clientUser)
  })

  it('sincroniza nome e foto do cliente no contexto imediatamente após salvar', async () => {
    const clientUser = {
      ...profile,
      roles: ['client'] as UserProfile['roles'],
      activeMode: 'client' as const,
    }
    vi.mocked(loadUserProfile).mockResolvedValue(clientUser)
    vi.mocked(loadClientProfileState).mockResolvedValue({
      profile: null,
      readiness: { isComplete: false, missingFields: ['clientProfile'] },
    })

    function SyncProbe() {
      const context = useProfile()
      return (
        <>
          <p>{context.profile?.name ?? context.status}</p>
          <p>{context.clientProfile?.profileImage?.url ?? 'sem-foto'}</p>
          <button
            type="button"
            onClick={() =>
              context.syncClientProfile({
                userId: 'user-123',
                name: 'Marina Santos',
                email: 'marina@example.com',
                phone: '',
                exists: true,
                profileImage: {
                  provider: 'IMAGEKIT',
                  ownerId: 'user-123',
                  purpose: 'CLIENT_AVATAR',
                  url: 'https://images.example/client.webp',
                  providerId: 'client-avatar-1',
                  createdAt: 1,
                  updatedAt: 1,
                },
              })
            }
          >
            Sincronizar
          </button>
        </>
      )
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <SyncProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(await screen.findByText('Marina Souza')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }))
    expect(screen.getByText('Marina Santos')).toBeInTheDocument()
    expect(screen.getByText('https://images.example/client.webp')).toBeInTheDocument()
  })

  it('restaura a foto persistida ao criar uma nova sessão', async () => {
    const clientUser = {
      ...profile,
      roles: ['client'] as UserProfile['roles'],
      activeMode: 'client' as const,
    }
    const persistedAvatar = {
      provider: 'IMAGEKIT' as const,
      ownerId: 'user-123',
      purpose: 'CLIENT_AVATAR' as const,
      url: 'https://images.example/persisted-client.webp',
      providerId: 'persisted-client-avatar',
      createdAt: 100,
      updatedAt: 100,
    }
    vi.mocked(loadUserProfile).mockResolvedValue(clientUser)
    vi.mocked(loadClientProfileState).mockResolvedValue({
      profile: {
        userId: 'user-123',
        phone: '',
        profileImage: persistedAvatar,
      },
      readiness: { isComplete: true, missingFields: [] },
    })

    function RestoredAvatarProbe() {
      const context = useProfile()
      return <p>{context.clientProfile?.profileImage?.url ?? context.status}</p>
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <RestoredAvatarProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(
      await screen.findByText('https://images.example/persisted-client.webp'),
    ).toBeInTheDocument()
  })
})
