import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { AuthenticationContext, type AuthenticationContextValue } from './auth-context'
import { AuthenticationError } from './auth-errors'
import { AccountPage } from './pages/AccountPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ThemeProvider } from '../../providers/theme-provider'
import { TooltipProvider } from '../../components/ui/tooltip'

function createAuth(overrides: Partial<AuthenticationContextValue> = {}): AuthenticationContextValue {
  return {
    status: 'unauthenticated',
    user: null,
    sessionError: null,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    retrySession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderPage(route: string, auth: AuthenticationContextValue) {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <AuthenticationContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/entrar" element={<LoginPage />} />
              <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/conta" element={<AccountPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthenticationContext.Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

describe('fluxos de autenticação', () => {
  it('redireciona uma sessão ausente para o login', async () => {
    renderPage('/conta', createAuth())
    expect(await screen.findByRole('heading', { name: /entre no profind/i })).toBeInTheDocument()
  })

  it('informa a expiração ao preservar a rota privada pretendida', async () => {
    renderPage('/conta', createAuth({
      sessionError: 'Sua sessão expirou. Entre novamente para continuar.',
    }))

    expect(await screen.findByText(/sua sessão expirou/i)).toBeInTheDocument()
  })

  it('não renderiza conteúdo privado enquanto valida a sessão', () => {
    renderPage('/conta', createAuth({ status: 'loading' }))
    expect(screen.getByRole('status')).toHaveTextContent(/verificando sua sessão/i)
    expect(screen.queryByRole('heading', { name: /minha conta/i })).not.toBeInTheDocument()
  })

  it('exibe mensagem genérica quando a credencial é recusada', async () => {
    const user = userEvent.setup()
    const login = vi.fn().mockRejectedValue(
      new AuthenticationError('invalid-credentials', 'E-mail ou senha inválidos.'),
    )
    renderPage('/entrar', createAuth({ login }))

    await user.type(screen.getByLabelText(/^e-mail$/i), 'ana@example.com')
    await user.type(screen.getByLabelText(/^senha$/i), 'incorreta')
    await user.click(screen.getByRole('button', { name: /^entrar$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
    expect(login).toHaveBeenCalledWith('ana@example.com', 'incorreta')
  })

  it('envia recuperação e apresenta resposta que não enumera contas', async () => {
    const user = userEvent.setup()
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined)
    renderPage('/recuperar-senha', createAuth({ requestPasswordReset }))

    await user.type(screen.getByLabelText(/^e-mail$/i), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: /enviar instruções/i }))

    expect(await screen.findByText(/se houver uma conta associada/i)).toBeInTheDocument()
    expect(requestPasswordReset).toHaveBeenCalledWith('ana@example.com')
  })

  it('exibe a conta somente para sessão autenticada e executa logout', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    renderPage('/conta', createAuth({
      status: 'authenticated',
      user: { email: 'ana@example.com' } as User,
      logout,
    }))

    expect(screen.getByRole('heading', { name: /minha conta/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sair da conta/i }))
    expect(logout).toHaveBeenCalledOnce()
  })
})
