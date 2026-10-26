import { render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../../auth/auth-context'
import { ThemeProvider } from '../../../providers/theme-provider'
import { AdminDashboardPage } from './AdminDashboardPage'

vi.mock('../../../components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
  AvatarFallback: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
}))

describe('AdminDashboardPage', () => {
  it('apresenta conteúdo orientado ao administrador sem links quebrados', () => {
    const authentication: AuthenticationContextValue = {
      status: 'authenticated',
      user: { uid: 'admin-123', email: 'admin@example.com' } as User,
      sessionError: null,
      login: vi.fn(),
      logout: vi.fn(),
      requestPasswordReset: vi.fn(),
      retrySession: vi.fn(),
    }

    render(
      <ThemeProvider>
        <AuthenticationContext.Provider value={authentication}>
          <MemoryRouter initialEntries={['/admin']}>
            <AdminDashboardPage />
          </MemoryRouter>
        </AuthenticationContext.Provider>
      </ThemeProvider>,
    )

    expect(screen.getByText('Bem-vindo à administração')).toBeInTheDocument()
    expect(
      screen.getByText(/acompanhe os cadastros de profissionais e a organização dos atendimentos/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Central de administração')).toBeInTheDocument()
    expect(
      screen.getByText('As funcionalidades abaixo estarão disponíveis em breve.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Análise de profissionais')).toBeInTheDocument()
    expect(screen.getByText('Catálogo de serviços')).toBeInTheDocument()
    expect(screen.getByText('Acompanhamento operacional')).toBeInTheDocument()
    expect(
      screen.getByText(/revise cadastros, solicite ajustes e gerencie a aprovação/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/consulte e organize as categorias e especialidades/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/acompanhe solicitações, atendimentos, cancelamentos e substituições/i),
    ).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getAllByText('Em breve')).toHaveLength(3)
    expect(screen.queryByText(/issue #/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Análise/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Operação/i })).not.toBeInTheDocument()
  })
})
