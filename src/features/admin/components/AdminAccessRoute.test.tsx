import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../../auth/auth-context'
import { ProtectedRoute } from '../../auth/components/ProtectedRoute'
import { ThemeProvider } from '../../../providers/theme-provider'
import { AdminAccessRoute } from './AdminAccessRoute'

type AuthorizationObserver = (
  userId: string,
  onValue: (value: { authorized: boolean }) => void,
  onError: (error: Error) => void,
) => () => void

const { observeAuthorization } = vi.hoisted(() => ({
  observeAuthorization: vi.fn<AuthorizationObserver>(),
}))

vi.mock('../../../services/admin-access.service', () => ({
  adminAccessService: { observeAuthorization },
}))

function LoginDestination() {
  const location = useLocation()
  const state = location.state as { from?: string; notice?: string } | null
  return (
    <div>
      <h1>Entrar</h1>
      <p>{state?.from}</p>
      <p>{state?.notice}</p>
    </div>
  )
}

function renderAdminRoute(overrides: Partial<AuthenticationContextValue> = {}) {
  const auth: AuthenticationContextValue = {
    status: 'authenticated',
    user: { uid: 'admin-123', email: 'admin@example.com' } as User,
    sessionError: null,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn(),
    retrySession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }

  render(
    <ThemeProvider>
      <AuthenticationContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route element={<AdminAccessRoute />}>
                <Route path="/admin" element={<h1>Painel administrativo</h1>} />
              </Route>
            </Route>
            <Route path="/entrar" element={<LoginDestination />} />
            <Route path="/conta" element={<h1>Minha conta</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthenticationContext.Provider>
    </ThemeProvider>,
  )

  return auth
}

describe('AdminAccessRoute', () => {
  beforeEach(() => {
    observeAuthorization.mockReset()
  })

  it('libera o painel somente após confirmar a credencial ativa', async () => {
    observeAuthorization.mockImplementation((_userId, onValue) => {
      onValue({ authorized: true })
      return vi.fn()
    })

    renderAdminRoute()

    expect(await screen.findByRole('heading', { name: 'Painel administrativo' })).toBeInTheDocument()
    expect(observeAuthorization).toHaveBeenCalledWith(
      'admin-123',
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('nega o acesso de usuário comum sem renderizar o painel', async () => {
    observeAuthorization.mockImplementation((_userId, onValue) => {
      onValue({ authorized: false })
      return vi.fn()
    })

    renderAdminRoute()

    expect(await screen.findByText('Acesso administrativo não autorizado')).toBeInTheDocument()
    expect(screen.queryByText('Painel administrativo')).not.toBeInTheDocument()
  })

  it('direciona visitante ao login preservando a rota pretendida', async () => {
    renderAdminRoute({ status: 'unauthenticated', user: null })

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByText('/admin')).toBeInTheDocument()
    expect(observeAuthorization).not.toHaveBeenCalled()
  })

  it('mantém o aviso ao redirecionar uma sessão expirada', async () => {
    renderAdminRoute({
      status: 'unauthenticated',
      user: null,
      sessionError: 'Sua sessão expirou. Entre novamente para continuar.',
    })

    expect(
      await screen.findByText('Sua sessão expirou. Entre novamente para continuar.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Painel administrativo')).not.toBeInTheDocument()
  })

  it('falha de forma fechada quando a leitura da credencial retorna erro', async () => {
    observeAuthorization.mockImplementation((_userId, _onValue, onError) => {
      onError(new Error('Firestore indisponível'))
      return vi.fn()
    })

    renderAdminRoute()

    expect(await screen.findByText('Não foi possível confirmar seu acesso')).toBeInTheDocument()
    expect(screen.getByText(/nenhum dado do painel foi liberado/i)).toBeInTheDocument()
    expect(screen.queryByText('Painel administrativo')).not.toBeInTheDocument()
  })

  it('revalida a sessão e a credencial em uma nova tentativa', async () => {
    const user = userEvent.setup()
    observeAuthorization
      .mockImplementationOnce((_userId, _onValue, onError) => {
        onError(new Error('Falha temporária'))
        return vi.fn()
      })
      .mockImplementationOnce((_userId, onValue) => {
        onValue({ authorized: true })
        return vi.fn()
      })
    const auth = renderAdminRoute()

    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    expect(auth.retrySession).toHaveBeenCalledOnce()
    expect(await screen.findByText('Painel administrativo')).toBeInTheDocument()
    expect(observeAuthorization).toHaveBeenCalledTimes(2)
  })

  it('remove o painel imediatamente quando a autorização é revogada', async () => {
    let pushAuthorization: ((value: { authorized: boolean }) => void) | undefined
    observeAuthorization.mockImplementation((_userId, onValue) => {
      pushAuthorization = onValue
      onValue({ authorized: true })
      return vi.fn()
    })

    renderAdminRoute()
    expect(await screen.findByText('Painel administrativo')).toBeInTheDocument()

    act(() => pushAuthorization?.({ authorized: false }))

    await waitFor(() => {
      expect(screen.queryByText('Painel administrativo')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Acesso administrativo não autorizado')).toBeInTheDocument()
  })
})
