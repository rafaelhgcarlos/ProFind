import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { TooltipProvider } from './components/ui/tooltip'
import { AuthenticationContext, type AuthenticationContextValue } from './features/auth/auth-context'
import { ProfileContext, type ProfileContextValue } from './features/onboarding/profile-context'
import { ThemeProvider } from './providers/theme-provider'
import { AppRouter } from './routes/AppRouter'

function renderRoute(
  path: string,
  authOverrides: Partial<AuthenticationContextValue> = {},
  profileOverrides: Partial<ProfileContextValue> = {},
) {
  const auth: AuthenticationContextValue = {
    status: 'unauthenticated',
    user: null,
    sessionError: null,
    login: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    retrySession: vi.fn(),
    ...authOverrides,
  }
  const profile: ProfileContextValue = {
    status: 'idle',
    profile: null,
    profileError: null,
    completeOnboarding: vi.fn(),
    switchMode: vi.fn(),
    syncProfessionalProfileStatus: vi.fn(),
    retryProfile: vi.fn(),
    ...profileOverrides,
  }
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <AuthenticationContext.Provider value={auth}>
          <ProfileContext.Provider value={profile}>
            <MemoryRouter initialEntries={[path]}>
              <AppRouter />
            </MemoryRouter>
          </ProfileContext.Provider>
        </AuthenticationContext.Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

describe('AppRouter', () => {
  it('renderiza a página inicial', () => {
    renderRoute('/')

    expect(
      screen.getByRole('heading', {
        name: /encontre o profissional certo, perto de você/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /criar minha conta/i }),
    ).toHaveAttribute('href', '/cadastro')
    expect(screen.getByText(/dados de contato não viram um perfil público/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /design system/i }),
    ).not.toBeInTheDocument()
  })

  it('mostra o acesso à conta na homepage quando já existe sessão autenticada', () => {
    renderRoute(
      '/',
      { status: 'authenticated', user: { uid: 'user-123', email: 'marina@example.com' } as User },
      {
        status: 'ready',
        profile: {
          userId: 'user-123',
          name: 'Marina Souza',
          email: 'marina@example.com',
          roles: ['client'],
          activeMode: 'client',
          professionalProfileStatus: 'not-started',
        },
      },
    )

    expect(screen.getByRole('button', { name: 'Abrir menu da conta de Marina Souza' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  })

  it('renderiza o cadastro com os campos obrigatórios', async () => {
    renderRoute('/cadastro')

    expect(
      await screen.findByRole('heading', { name: /crie sua conta no profind/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/nome completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^e-mail$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirmar senha/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Termos de Uso' }),
    ).toHaveAttribute('href', '/termos-de-uso')
    expect(
      screen.getByRole('link', { name: 'Política de Privacidade' }),
    ).toHaveAttribute('href', '/politica-de-privacidade')
  })

  it('preserva o rascunho em memória durante a consulta aos termos', async () => {
    const user = userEvent.setup()
    renderRoute('/cadastro')

    await user.type(
      await screen.findByLabelText(/nome completo/i),
      'Marina Souza',
    )
    await user.type(screen.getByLabelText(/^senha$/i), 'senha-segura')
    await user.click(screen.getByRole('link', { name: 'Termos de Uso' }))

    expect(
      await screen.findByRole('heading', { name: 'Termos de Uso' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1. Aceitação e escopo')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Voltar ao cadastro' }))

    expect(await screen.findByLabelText(/nome completo/i)).toHaveValue(
      'Marina Souza',
    )
    expect(screen.getByLabelText(/^senha$/i)).toHaveValue('senha-segura')
  })

  it('renderiza a política com versão e data de vigência', async () => {
    renderRoute('/politica-de-privacidade')

    expect(
      await screen.findByRole('heading', { name: 'Política de Privacidade' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('11 de setembro de 2026')).toBeInTheDocument()
    expect(screen.getByText(/versão jurídica inicial/i)).toBeInTheDocument()
  })

  it('renderiza a página de rota inexistente', () => {
    renderRoute('/nao-existe')

    expect(
      screen.getByRole('heading', { name: /página não encontrada/i }),
    ).toBeInTheDocument()
  })

  it('renderiza o catálogo do design system', async () => {
    renderRoute('/design-system')

    expect(
      await screen.findByRole('heading', { name: /componentes profind/i }),
    ).toBeInTheDocument()
  })
})
