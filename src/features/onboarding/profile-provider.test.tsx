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
import { loadProfessionalProfile } from '../../services/professional-profile.service'
import { ProfileProvider } from './profile-provider'
import { useProfile } from './use-profile'
import type { UserProfile } from './user-role'
import type { ProfessionalProfile } from '../../types/professional-profile'

vi.mock('../../services/onboarding.service', () => ({
  loadUserProfile: vi.fn(),
  completeOnboarding: vi.fn(),
  switchActiveMode: vi.fn(),
}))

vi.mock('../../services/client-profile.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/client-profile.service')>()
  return { ...actual, loadClientProfileState: vi.fn() }
})

vi.mock('../../services/professional-profile.service', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../services/professional-profile.service')
  >()
  return { ...actual, loadProfessionalProfile: vi.fn() }
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

const professionalAvatar = {
  provider: 'IMAGEKIT' as const,
  ownerId: 'user-123',
  purpose: 'PROFESSIONAL_AVATAR' as const,
  url: 'https://images.example/professional.webp',
  providerId: 'professional-avatar-1',
  createdAt: 200,
  updatedAt: 200,
  order: 0,
  altText: 'Marina em atendimento',
}

const professionalProfile: ProfessionalProfile = {
  userId: 'user-123',
  publicName: 'Marina Profissional',
  headline: '',
  bio: '',
  categoryIds: [],
  specialtyIds: [],
  experienceYears: null,
  baseLocation: { city: '', stateCode: '', ibgeCode: '' },
  serviceMode: 'CITY_ONLY',
  serviceRadiusKm: null,
  selectedCities: [],
  availability: 'AVAILABLE',
  phone: '',
  contactVisibility: 'PRIVATE',
  privateLocation: { postalCode: '' },
  profileImage: professionalAvatar,
  portfolioImages: [],
  status: 'DRAFT',
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

  it('restaura o avatar profissional persistido em remount ou novo login', async () => {
    const professionalUser = {
      ...profile,
      roles: ['client', 'professional'] as UserProfile['roles'],
      activeMode: 'professional' as const,
      professionalProfileStatus: 'incomplete' as const,
    }
    vi.mocked(loadUserProfile).mockResolvedValue(professionalUser)
    vi.mocked(loadProfessionalProfile).mockResolvedValue(professionalProfile)

    function ProfessionalAvatarProbe() {
      const context = useProfile()
      return (
        <p>
          {context.professionalProfile?.profileImage?.url ?? context.status}
        </p>
      )
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <ProfessionalAvatarProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(
      await screen.findByText(professionalAvatar.url),
    ).toBeInTheDocument()
    expect(loadProfessionalProfile).toHaveBeenCalledWith('user-123')
  })

  it('mantém avatares isolados ao trocar de Cliente para Profissional', async () => {
    const clientAvatar = {
      provider: 'IMAGEKIT' as const,
      ownerId: 'user-123',
      purpose: 'CLIENT_AVATAR' as const,
      url: 'https://images.example/client-mode.webp',
      providerId: 'client-mode-avatar',
      createdAt: 100,
      updatedAt: 100,
    }
    const clientUser = {
      ...profile,
      roles: ['client', 'professional'] as UserProfile['roles'],
      activeMode: 'client' as const,
    }
    const professionalUser = {
      ...clientUser,
      activeMode: 'professional' as const,
    }
    vi.mocked(loadUserProfile).mockResolvedValue(clientUser)
    vi.mocked(loadClientProfileState).mockResolvedValue({
      profile: { userId: 'user-123', phone: '', profileImage: clientAvatar },
      readiness: { isComplete: true, missingFields: [] },
    })
    vi.mocked(switchActiveMode).mockResolvedValue(professionalUser)
    vi.mocked(loadProfessionalProfile).mockResolvedValue(professionalProfile)

    function ModeAvatarProbe() {
      const context = useProfile()
      return (
        <>
          <p>{context.profile?.activeMode ?? context.status}</p>
          <p>{context.clientProfile?.profileImage?.url ?? 'sem-cliente'}</p>
          <p>
            {context.professionalProfile?.profileImage?.url ??
              'sem-profissional'}
          </p>
          <button
            type="button"
            onClick={() => void context.switchMode('professional')}
          >
            Modo profissional
          </button>
        </>
      )
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <ModeAvatarProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(await screen.findByText(clientAvatar.url)).toBeInTheDocument()
    expect(screen.getByText('sem-profissional')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Modo profissional' }))

    expect(await screen.findByText('professional')).toBeInTheDocument()
    expect(screen.getByText(clientAvatar.url)).toBeInTheDocument()
    expect(screen.getByText(professionalAvatar.url)).toBeInTheDocument()
  })

  it('sincroniza imediatamente a referência profissional recém-persistida', async () => {
    const professionalUser = {
      ...profile,
      roles: ['professional'] as UserProfile['roles'],
      activeMode: 'professional' as const,
      professionalProfileStatus: 'incomplete' as const,
    }
    vi.mocked(loadUserProfile).mockResolvedValue(professionalUser)
    vi.mocked(loadProfessionalProfile).mockResolvedValue(null)

    function SyncProfessionalProbe() {
      const context = useProfile()
      return (
        <>
          <p>
            {context.professionalProfile?.profileImage?.url ?? context.status}
          </p>
          <button
            type="button"
            onClick={() => context.syncProfessionalProfile(professionalProfile)}
          >
            Sincronizar profissional
          </button>
        </>
      )
    }

    render(
      <AuthenticationContext.Provider value={auth}>
        <ProfileProvider>
          <SyncProfessionalProbe />
        </ProfileProvider>
      </AuthenticationContext.Provider>,
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Sincronizar profissional' }),
    )
    expect(screen.getByText(professionalAvatar.url)).toBeInTheDocument()
  })
})
