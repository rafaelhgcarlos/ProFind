import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthenticationContext, type AuthenticationContextValue } from '../../features/auth/auth-context'
import { ProfileContext, type ProfileContextValue } from '../../features/onboarding/profile-context'
import { ThemeProvider } from '../../providers/theme-provider'
import { PublicLayout } from './PublicLayout'

function renderWithSession(
  authOverrides: Partial<AuthenticationContextValue> = {},
  profileOverrides: Partial<ProfileContextValue> = {},
) {
  const auth: AuthenticationContextValue = {
    status: 'unauthenticated',
    user: null,
    sessionError: null,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn(),
    retrySession: vi.fn(),
    ...authOverrides,
  }
  const profile: ProfileContextValue = {
    status: 'idle',
    profile: null,
    profileError: null,
    clientProfile: null,
    clientProfileReadiness: null,
    professionalProfile: null,
    completeOnboarding: vi.fn(),
    switchMode: vi.fn(),
    resolveLandingRoute: vi.fn().mockResolvedValue('/cliente'),
    syncClientProfile: vi.fn(),
    syncProfessionalProfile: vi.fn(),
    syncProfessionalProfileStatus: vi.fn(),
    retryProfile: vi.fn(),
    ...profileOverrides,
  }

  render(
    <ThemeProvider>
      <AuthenticationContext.Provider value={auth}>
        <ProfileContext.Provider value={profile}>
          <MemoryRouter>
            <PublicLayout showAccountLinks navigation={[{ label: 'Como funciona', href: '/#como-funciona' }]}>Conteúdo</PublicLayout>
          </MemoryRouter>
        </ProfileContext.Provider>
      </AuthenticationContext.Provider>
    </ThemeProvider>,
  )

  return { auth, profile }
}

const authenticatedUser = { uid: 'user-123', email: 'marina@example.com' } as User
const readyProfile: ProfileContextValue['profile'] = {
  userId: 'user-123',
  name: 'Marina Souza',
  email: 'marina@example.com',
  roles: ['client'],
  activeMode: 'client',
  professionalProfileStatus: 'not-started',
}

describe('PublicLayout', () => {
  it('mantém apenas o controle de tema quando não há opções de navegação', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <PublicLayout>Conteúdo</PublicLayout>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(screen.getByRole('button', { name: /Tema atual:/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('mantém a navegação opcional pronta para evoluir', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <PublicLayout navigation={[{ label: 'Seção atual', href: '/secao' }]}>Conteúdo</PublicLayout>
        </MemoryRouter>
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))

    expect(
      await screen.findByRole('heading', { name: 'Navegação' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Acesse as opções disponíveis no ProFind.'),
    ).toBeInTheDocument()

    const navigation = screen.getByRole('navigation', {
      name: 'Navegação mobile',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Seção atual' }),
    ).toHaveAttribute('href', '/secao')
    expect(screen.getByText('Escolha com confiança')).toBeInTheDocument()
  })

  it('não mostra ações de visitante enquanto a sessão carrega', async () => {
    renderWithSession({ status: 'loading' })
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const navigation = await screen.findByRole('navigation', { name: 'Navegação mobile' })
    expect(within(navigation).getByRole('link', { name: 'Como funciona' })).toBeInTheDocument()
    expect(within(navigation).queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
  })

  it('expõe entrada e cadastro ao visitante no desktop e mobile', async () => {
    renderWithSession()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const navigation = await screen.findByRole('navigation', { name: 'Navegação mobile' })
    expect(within(navigation).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    expect(within(navigation).getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro')
  })

  it('mostra avatar, nome e ações de conta ao usuário autenticado', async () => {
    const user = userEvent.setup()
    renderWithSession(
      { status: 'authenticated', user: authenticatedUser },
      { status: 'ready', profile: readyProfile },
    )
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir menu da conta de Marina Souza' }))
    expect(screen.getByRole('menuitem', { name: 'Acessar minha conta' })).toHaveAttribute('href', '/conta')
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const navigation = await screen.findByRole('navigation', { name: 'Navegação mobile' })
    expect(within(navigation).getByRole('link', { name: 'Acessar minha conta' })).toHaveAttribute('href', '/conta')
    expect(within(navigation).getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.getAllByText('Marina Souza').length).toBeGreaterThan(0)
  })

  it('bloqueia logout repetido e apresenta erro para nova tentativa no menu mobile', async () => {
    const user = userEvent.setup()
    let rejectLogout: (error: Error) => void = () => undefined
    const logout = vi.fn().mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectLogout = reject }))
    renderWithSession({ status: 'authenticated', user: authenticatedUser, logout })
    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const navigation = await screen.findByRole('navigation', { name: 'Navegação mobile' })
    await user.click(within(navigation).getByRole('button', { name: 'Sair' }))
    expect(within(navigation).getByRole('button', { name: 'Saindo…' })).toBeDisabled()
    expect(logout).toHaveBeenCalledOnce()
    await act(async () => rejectLogout(new Error('Falha de rede. Tente novamente.')))
    expect(within(navigation).getByRole('alert')).toHaveTextContent('Falha de rede. Tente novamente.')
    expect(within(navigation).getByRole('button', { name: 'Sair' })).toBeEnabled()
  })

  it('executa logout pelo menu desktop', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    renderWithSession({ status: 'authenticated', user: authenticatedUser, logout })
    await user.click(screen.getByRole('button', { name: 'Abrir menu da conta de marina@example.com' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('mantém o erro de logout visível após falha no desktop', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockRejectedValue(new Error('Não foi possível encerrar a sessão.'))
    renderWithSession({ status: 'authenticated', user: authenticatedUser, logout })
    await user.click(screen.getByRole('button', { name: 'Abrir menu da conta de marina@example.com' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível encerrar a sessão.')
  })
})
