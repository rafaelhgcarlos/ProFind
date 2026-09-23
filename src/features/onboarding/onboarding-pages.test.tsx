import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'

import { ThemeProvider } from '../../providers/theme-provider'
import { TooltipProvider } from '../../components/ui/tooltip'
import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../auth/auth-context'
import { ModeRoute } from './components/ModeRoute'
import { ModeSwitcher } from './components/ModeSwitcher'
import { OnboardingRoute } from './components/OnboardingRoute'
import { ProfileRoute } from './components/ProfileRoute'
import {
  ProfileContext,
  type ProfileContextValue,
} from './profile-context'
import { OnboardingPage } from './pages/OnboardingPage'
import { ModeHomePage } from './pages/ModeHomePage'
import type { UserProfile } from './user-role'

const incompleteProfile: UserProfile = {
  userId: 'user-123',
  name: 'Marina Souza',
  email: 'marina@example.com',
  roles: [],
  activeMode: null,
  professionalProfileStatus: 'not-started',
}

function createProfileContext(
  profile: UserProfile = incompleteProfile,
  overrides: Partial<ProfileContextValue> = {},
): ProfileContextValue {
  return {
    status: 'ready',
    profile,
    profileError: null,
    clientProfile: null,
    clientProfileReadiness: null,
    professionalProfile: null,
    completeOnboarding: vi.fn().mockResolvedValue(profile),
    switchMode: vi.fn().mockResolvedValue(profile),
    resolveLandingRoute: vi.fn().mockImplementation(async (nextProfile: UserProfile) =>
      nextProfile.activeMode === 'professional' ? '/profissional' : '/cliente',
    ),
    syncClientProfile: vi.fn(),
    syncProfessionalProfile: vi.fn(),
    syncProfessionalProfileStatus: vi.fn(),
    retryProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function TestProviders({
  context,
  children,
  authOverrides = {},
}: {
  context: ProfileContextValue
  children: React.ReactNode
  authOverrides?: Partial<AuthenticationContextValue>
}) {
  const auth: AuthenticationContextValue = {
    status: 'authenticated',
    user: { uid: 'user-123', email: 'marina@example.com' } as User,
    sessionError: null,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn(),
    retrySession: vi.fn(),
    ...authOverrides,
  }

  return (
    <ThemeProvider>
      <TooltipProvider>
        <AuthenticationContext.Provider value={auth}>
          <ProfileContext.Provider value={context}>
            {children}
          </ProfileContext.Provider>
        </AuthenticationContext.Provider>
      </TooltipProvider>
    </ThemeProvider>
  )
}

function RedirectDestination() {
  const location = useLocation()
  return <p>{(location.state as { modeNotice?: string } | null)?.modeNotice ?? 'Destino permitido'}</p>
}

describe('onboarding de papéis', () => {
  it('exige uma escolha e mantém as três opções acessíveis', async () => {
    const user = userEvent.setup()
    const context = createProfileContext()

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText(/pessoa física no mvp/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText(/escolha como você pretende/i)).toBeInTheDocument()
    expect(context.completeOnboarding).not.toHaveBeenCalled()
  })

  it('persiste a escolha Ambos e direciona o novo cliente ao perfil', async () => {
    const user = userEvent.setup()
    const configuredProfile: UserProfile = {
      ...incompleteProfile,
      roles: ['client', 'professional'],
      activeMode: 'client',
    }
    const completeOnboarding = vi.fn().mockResolvedValue(configuredProfile)
    const resolveLandingRoute = vi.fn().mockResolvedValue('/cliente/perfil')
    const context = createProfileContext(incompleteProfile, {
      completeOnboarding,
      resolveLandingRoute,
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/cliente/perfil" element={<h1>Perfil do cliente</h1>} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    await user.click(screen.getByRole('radio', { name: /quero fazer os dois/i }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(completeOnboarding).toHaveBeenCalledWith('both')
    expect(resolveLandingRoute).toHaveBeenCalledWith(configuredProfile)
    expect(await screen.findByRole('heading', { name: 'Perfil do cliente' })).toBeInTheDocument()
  })

  it('preserva a escolha quando a gravação falha', async () => {
    const user = userEvent.setup()
    const context = createProfileContext(incompleteProfile, {
      completeOnboarding: vi.fn().mockRejectedValue(
        new Error('Verifique sua conexão e tente novamente.'),
      ),
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter>
          <OnboardingPage />
        </MemoryRouter>
      </TestProviders>,
    )

    const professionalOption = screen.getByRole('radio', {
      name: /quero prestar serviços/i,
    })
    await user.click(professionalOption)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão/i)
    expect(professionalOption).toBeChecked()
  })

  it('permite sair da conta durante o onboarding e volta ao login', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    const context = createProfileContext()

    render(
      <TestProviders context={context} authOverrides={{ logout }}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/entrar" element={<h1>Entre no ProFind</h1>} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'Sair da conta' }))

    expect(logout).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', { name: 'Entre no ProFind' }),
    ).toBeInTheDocument()
  })

  it('impede acesso por URL a um modo não habilitado', async () => {
    const context = createProfileContext({
      ...incompleteProfile,
      roles: ['client'],
      activeMode: 'client',
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/profissional']}>
          <Routes>
            <Route element={<ModeRoute mode="professional" />}>
              <Route path="/profissional" element={<p>Área profissional</p>} />
            </Route>
            <Route path="/cliente" element={<RedirectDestination />} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    expect(await screen.findByText(/modo não está habilitado/i)).toBeInTheDocument()
    expect(screen.queryByText('Área profissional')).not.toBeInTheDocument()
  })

  it('não reabre o onboarding para uma conta já configurada', async () => {
    const context = createProfileContext({
      ...incompleteProfile,
      roles: ['professional'],
      activeMode: 'professional',
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route element={<OnboardingRoute />}>
              <Route path="/onboarding" element={<p>Escolha de papéis</p>} />
            </Route>
            <Route path="/profissional" element={<p>Área profissional</p>} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    expect(await screen.findByText('Área profissional')).toBeInTheDocument()
    expect(screen.queryByText('Escolha de papéis')).not.toBeInTheDocument()
  })

  it('alterna entre os dois modos sem criar outra conta', async () => {
    const user = userEvent.setup()
    const currentProfile: UserProfile = {
      ...incompleteProfile,
      roles: ['client', 'professional'],
      activeMode: 'client',
    }
    const switchMode = vi.fn().mockResolvedValue({
      ...currentProfile,
      activeMode: 'professional',
    })
    const context = createProfileContext(currentProfile, { switchMode })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/cliente']}>
          <Routes>
            <Route path="/cliente" element={<ModeSwitcher />} />
            <Route path="/profissional" element={<p>Modo profissional ativo</p>} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Modo atual: Cliente. Alternar modo',
      }),
    )
    await user.click(screen.getByRole('menuitemradio', { name: 'Profissional' }))

    expect(switchMode).toHaveBeenCalledWith('professional')
    expect(await screen.findByText('Modo profissional ativo')).toBeInTheDocument()
  })

  it('consulta a prontidão ao trocar para Cliente e direciona o incompleto ao perfil', async () => {
    const user = userEvent.setup()
    const currentProfile: UserProfile = {
      ...incompleteProfile,
      roles: ['client', 'professional'],
      activeMode: 'professional',
    }
    const clientModeProfile = { ...currentProfile, activeMode: 'client' as const }
    const switchMode = vi.fn().mockResolvedValue(clientModeProfile)
    const resolveLandingRoute = vi.fn().mockResolvedValue('/cliente/perfil')
    const context = createProfileContext(currentProfile, {
      switchMode,
      resolveLandingRoute,
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/profissional']}>
          <Routes>
            <Route path="/profissional" element={<ModeSwitcher />} />
            <Route path="/cliente/perfil" element={<p>Complete o perfil do cliente</p>} />
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Modo atual: Profissional. Alternar modo',
      }),
    )
    await user.click(screen.getByRole('menuitemradio', { name: 'Cliente' }))

    expect(switchMode).toHaveBeenCalledWith('client')
    expect(resolveLandingRoute).toHaveBeenCalledWith(clientModeProfile)
    expect(await screen.findByText('Complete o perfil do cliente')).toBeInTheDocument()
  })

  it('não apresenta o papel Profissional como perfil já publicável', () => {
    const context = createProfileContext({
      ...incompleteProfile,
      roles: ['professional'],
      activeMode: 'professional',
      professionalProfileStatus: 'not-started',
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/profissional']}>
          <ModeHomePage mode="professional" />
        </MemoryRouter>
      </TestProviders>,
    )

    expect(
      screen.getByText('Perfil profissional ainda não publicável'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Criar perfil profissional' }),
    ).toHaveAttribute('href', '/profissional/perfil')
  })

  it('mantém o conteúdo privado oculto durante o loading do perfil', () => {
    const context = createProfileContext(incompleteProfile, {
      status: 'loading',
      profile: null,
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter initialEntries={['/conta']}>
          <Routes>
            <Route element={<ProfileRoute />}>
              <Route path="/conta" element={<p>Conteúdo privado</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/carregando seu perfil/i)
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument()
  })

  it('oferece nova tentativa quando o perfil falha ao carregar', async () => {
    const user = userEvent.setup()
    const retryProfile = vi.fn().mockResolvedValue(undefined)
    const context = createProfileContext(incompleteProfile, {
      status: 'error',
      profile: null,
      profileError: 'Verifique sua conexão.',
      retryProfile,
    })

    render(
      <TestProviders context={context}>
        <MemoryRouter>
          <Routes>
            <Route element={<ProfileRoute />}>
              <Route index element={<p>Conteúdo privado</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TestProviders>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/verifique sua conexão/i)
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(retryProfile).toHaveBeenCalledOnce()
  })
})
