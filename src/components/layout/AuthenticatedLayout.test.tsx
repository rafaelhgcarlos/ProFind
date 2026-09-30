import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../../features/auth/auth-context'
import {
  ProfileContext,
  type ProfileContextValue,
} from '../../features/onboarding/profile-context'
import { ThemeProvider } from '../../providers/theme-provider'
import { AdminLayout } from './AdminLayout'
import { ClientLayout } from './ClientLayout'
import { ProfessionalLayout } from './ProfessionalLayout'
import { ProfileBuilderSection } from '../../features/professional-profile/components/ProfileBuilderSection'

vi.mock('../ui/avatar', () => ({
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

function renderLayout(
  path: string,
  layout: React.ReactNode,
  authOverrides?: Partial<AuthenticationContextValue>,
) {
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
  const content = (
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>{layout}</MemoryRouter>
    </ThemeProvider>
  )
  return render(
    authOverrides ? (
      <AuthenticationContext.Provider value={auth}>
        {content}
      </AuthenticationContext.Provider>
    ) : content,
  )
}

describe('layouts autenticados', () => {
  it('prioriza as tarefas do cliente em navegações mobile e desktop', () => {
    renderLayout(
      '/cliente',
      <ClientLayout pageTitle="Início">Conteúdo do cliente</ClientLayout>,
    )

    expect(screen.getByRole('navigation', { name: 'Área do cliente' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Área do cliente — navegação mobile' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Buscar' })).toHaveLength(2)
  })

  it('prioriza oportunidades no modo profissional', () => {
    renderLayout(
      '/profissional',
      <ProfessionalLayout pageTitle="Oportunidades">
        Conteúdo profissional
      </ProfessionalLayout>,
    )

    expect(screen.getAllByRole('link', { name: 'Oportunidades' })).toHaveLength(2)
    expect(screen.getByText('Conteúdo profissional')).toBeInTheDocument()
  })

  it('mantém a navegação mobile presa à viewport com o portfólio aberto', () => {
    const view = renderLayout(
      '/profissional',
      <ProfessionalLayout pageTitle="Perfil profissional">
        <ProfileBuilderSection
          id="portfolio-test"
          title="Portfólio"
          description="Conteúdo aberto"
          summary="Três imagens"
          open
          complete
          onOpenChange={vi.fn()}
        >
          <div style={{ height: 2400 }}>Conteúdo expansível do portfólio</div>
        </ProfileBuilderSection>
      </ProfessionalLayout>,
    )

    const mobileNavigation = screen.getByRole('navigation', {
      name: 'Área profissional — navegação mobile',
    })

    expect(view.container.contains(mobileNavigation)).toBe(false)
    expect(document.body).toContainElement(mobileNavigation)
    expect(mobileNavigation).toHaveClass('fixed', 'right-0', 'bottom-0', 'left-0', 'z-40')
    expect(mobileNavigation.className).toContain(
      'pb-[env(safe-area-inset-bottom)]',
    )
    expect(view.container.querySelector('#conteudo-principal')?.parentElement).toHaveClass(
      'pb-[calc(5rem+env(safe-area-inset-bottom))]',
    )
    expect(view.container.firstElementChild?.className).toContain(
      'lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]',
    )
  })

  it.each([
    ['Cliente', '/cliente', <ClientLayout pageTitle="Início">Página longa</ClientLayout>],
    ['Profissional', '/profissional', <ProfessionalLayout pageTitle="Início">Página longa</ProfessionalLayout>],
    ['Ambos', '/profissional/perfil', <ProfessionalLayout pageTitle="Perfil">Página longa</ProfessionalLayout>],
  ])('executa logout pela sidebar desktop para conta %s', async (_role, path, layout) => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderLayout(path, layout, { logout })

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(logout).toHaveBeenCalledOnce()
  })

  it('executa logout pelo menu da conta mobile e fecha o menu', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderLayout(
      '/profissional/portfolio',
      <ProfessionalLayout pageTitle="Portfólio">Página longa</ProfessionalLayout>,
      { logout },
    )

    await user.click(
      screen.getByRole('button', { name: /Abrir menu da conta/i }),
    )
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }))

    expect(logout).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Sair' })).not.toBeInTheDocument(),
    )
  })

  it('mantém o logout recuperável quando o fluxo existente falha', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('Falha temporária ao sair.'))
    const user = userEvent.setup()
    renderLayout(
      '/cliente',
      <ClientLayout pageTitle="Início">Conteúdo</ClientLayout>,
      { logout },
    )

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária ao sair.')
    expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled()
  })

  it('mantém uma estrutura de navegação administrativa separada', () => {
    renderLayout(
      '/admin',
      <AdminLayout pageTitle="Visão geral">Conteúdo administrativo</AdminLayout>,
    )

    expect(screen.getByRole('navigation', { name: 'Administração' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Oportunidades' })).not.toBeInTheDocument()
  })

  it('mantém a tarefa atual destacada em rotas aninhadas', () => {
    renderLayout(
      '/cliente/buscar/filtros',
      <ClientLayout pageTitle="Buscar">Conteúdo da busca</ClientLayout>,
    )

    for (const link of screen.getAllByRole('link', { name: 'Buscar' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }

    for (const link of screen.getAllByRole('link', { name: 'Início' })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('renderiza no header a URL persistida no contexto do cliente', () => {
    const imageUrl = 'https://images.example/client-header.webp'
    const context: ProfileContextValue = {
      status: 'ready',
      profile: {
        userId: 'client-123',
        name: 'Marina Souza',
        email: 'marina@example.com',
        roles: ['client'],
        activeMode: 'client',
        professionalProfileStatus: 'not-started',
      },
      profileError: null,
      clientProfile: {
        userId: 'client-123',
        phone: '',
        profileImage: {
          provider: 'IMAGEKIT',
          ownerId: 'client-123',
          purpose: 'CLIENT_AVATAR',
          url: imageUrl,
          providerId: 'client-avatar-header',
          createdAt: 100,
          updatedAt: 100,
        },
      },
      clientProfileReadiness: { isComplete: true, missingFields: [] },
      professionalProfile: null,
      completeOnboarding: vi.fn(),
      switchMode: vi.fn(),
      resolveLandingRoute: vi.fn(),
      syncClientProfile: vi.fn(),
      syncProfessionalProfile: vi.fn(),
      syncProfessionalProfileStatus: vi.fn(),
      retryProfile: vi.fn(),
    }
    const view = renderLayout(
      '/cliente',
      <ProfileContext.Provider value={context}>
        <ClientLayout pageTitle="Início">Conteúdo do cliente</ClientLayout>
      </ProfileContext.Provider>,
    )

    expect(view.container.querySelector(`img[src="${imageUrl}"]`)).toBeInTheDocument()
  })

  it('renderiza no header somente o avatar do modo Profissional ativo', () => {
    const professionalImageUrl =
      'https://images.example/professional-header.webp'
    const context: ProfileContextValue = {
      status: 'ready',
      profile: {
        userId: 'user-123',
        name: 'Marina Souza',
        email: 'marina@example.com',
        roles: ['client', 'professional'],
        activeMode: 'professional',
        professionalProfileStatus: 'complete',
      },
      profileError: null,
      clientProfile: {
        userId: 'user-123',
        phone: '',
        profileImage: {
          provider: 'IMAGEKIT',
          ownerId: 'user-123',
          purpose: 'CLIENT_AVATAR',
          url: 'https://images.example/client-isolated.webp',
          providerId: 'client-avatar',
          createdAt: 100,
          updatedAt: 100,
        },
      },
      clientProfileReadiness: { isComplete: true, missingFields: [] },
      professionalProfile: {
        userId: 'user-123',
        publicName: 'Marina Eletricista',
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
        profileImage: {
          provider: 'IMAGEKIT',
          ownerId: 'user-123',
          purpose: 'PROFESSIONAL_AVATAR',
          url: professionalImageUrl,
          providerId: 'professional-avatar',
          createdAt: 200,
          updatedAt: 200,
          order: 0,
          altText: 'Marina em atendimento',
        },
        portfolioImages: [],
        status: 'PUBLISHED',
      },
      completeOnboarding: vi.fn(),
      switchMode: vi.fn(),
      resolveLandingRoute: vi.fn(),
      syncClientProfile: vi.fn(),
      syncProfessionalProfile: vi.fn(),
      syncProfessionalProfileStatus: vi.fn(),
      retryProfile: vi.fn(),
    }

    const view = renderLayout(
      '/profissional',
      <ProfileContext.Provider value={context}>
        <ProfessionalLayout pageTitle="Início">
          Conteúdo profissional
        </ProfessionalLayout>
      </ProfileContext.Provider>,
    )

    expect(
      view.container.querySelector(`img[src="${professionalImageUrl}"]`),
    ).toBeInTheDocument()
    expect(
      view.container.querySelector(
        'img[src="https://images.example/client-isolated.webp"]',
      ),
    ).not.toBeInTheDocument()
  })
})
