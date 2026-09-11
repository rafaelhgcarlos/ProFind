import { act, render, screen, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { vi } from 'vitest'

import { authService } from '../../services/auth.service'
import { AuthenticationProvider } from './auth-provider'
import { useAuth } from './use-auth'

vi.mock('../../services/auth.service', () => ({
  authService: {
    observeSession: vi.fn(),
    reloadUser: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    sendPasswordReset: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

function SessionProbe() {
  const { status, user, sessionError, logout } = useAuth()
  return (
    <div>
      <span>{status}</span>
      <span>{user?.email}</span>
      <span>{sessionError}</span>
      <button onClick={() => void logout()}>Sair</button>
    </div>
  )
}

describe('AuthenticationProvider', () => {
  let sessionObserver: (user: User | null) => void
  let sessionErrorObserver: (error: Error) => void

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.observeSession).mockImplementation((observer, onError) => {
      sessionObserver = observer as (user: User | null) => void
      sessionErrorObserver = onError ?? vi.fn()
      return vi.fn()
    })
    vi.mocked(authService.reloadUser).mockResolvedValue(undefined)
    vi.mocked(authService.signOut).mockResolvedValue(undefined)
  })

  it('encerra o loading inicial quando não há sessão', async () => {
    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)

    act(() => sessionObserver(null))

    expect(await screen.findByText('unauthenticated')).toBeInTheDocument()
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
    expect(authService.reloadUser).not.toHaveBeenCalled()
  })

  it('não libera a rota até validar a sessão recebida', async () => {
    const user = { email: 'ana@example.com' } as User
    let finishReload: (() => void) | undefined
    vi.mocked(authService.reloadUser).mockImplementation(
      () => new Promise<void>((resolve) => { finishReload = resolve }),
    )

    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)
    expect(screen.getByText('loading')).toBeInTheDocument()

    act(() => sessionObserver(user))
    expect(screen.getByText('loading')).toBeInTheDocument()
    await act(async () => finishReload?.())

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
  })

  it('encerra a sessão de uma conta desativada', async () => {
    const user = { email: 'ana@example.com' } as User
    vi.mocked(authService.reloadUser).mockRejectedValue({ code: 'auth/user-disabled' })

    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)
    act(() => sessionObserver(user))

    expect(await screen.findByText('unauthenticated')).toBeInTheDocument()
    expect(authService.signOut).toHaveBeenCalledOnce()
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument()
  })

  it('mantém o aviso ao invalidar um token expirado', async () => {
    const user = { email: 'ana@example.com' } as User
    vi.mocked(authService.reloadUser).mockRejectedValue({ code: 'auth/user-token-expired' })

    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)
    act(() => sessionObserver(user))

    expect(await screen.findByText('unauthenticated')).toBeInTheDocument()
    expect(authService.signOut).toHaveBeenCalledOnce()
    expect(screen.getByText(/sessão expirou/i)).toBeInTheDocument()
  })

  it('encerra o loading com erro recuperável se a revalidação falhar', async () => {
    const user = { email: 'ana@example.com' } as User
    vi.mocked(authService.reloadUser).mockRejectedValue({ code: 'auth/internal-error' })

    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)
    act(() => sessionObserver(user))

    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
    expect(screen.getByText(/não foi possível concluir a autenticação/i)).toBeInTheDocument()
  })

  it('encerra o loading quando o observador do Firebase falha', async () => {
    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)

    act(() => sessionErrorObserver(Object.assign(new Error('falha'), { code: 'auth/internal-error' })))

    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
  })

  it('ignora uma revalidação antiga quando a sessão é removida', async () => {
    const user = { email: 'ana@example.com' } as User
    let finishReload: (() => void) | undefined
    vi.mocked(authService.reloadUser).mockImplementation(
      () => new Promise<void>((resolve) => { finishReload = resolve }),
    )

    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)
    act(() => sessionObserver(user))
    act(() => sessionObserver(null))
    await act(async () => finishReload?.())

    expect(screen.getByText('unauthenticated')).toBeInTheDocument()
    expect(screen.queryByText('authenticated')).not.toBeInTheDocument()
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
  })

  it('remove o acesso local depois do logout', async () => {
    const user = { email: 'ana@example.com' } as User
    render(<AuthenticationProvider><SessionProbe /></AuthenticationProvider>)
    act(() => sessionObserver(user))
    await screen.findByText('authenticated')

    screen.getByRole('button', { name: 'Sair' }).click()

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeInTheDocument())
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument()
  })
})
