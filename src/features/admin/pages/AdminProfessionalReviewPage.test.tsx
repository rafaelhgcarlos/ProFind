import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../../../providers/theme-provider'
import type { AdminProfessionalReviewDetail } from '../../../repositories/professional-review.repository'
import {
  AuthenticationContext,
  type AuthenticationContextValue,
} from '../../auth/auth-context'
import { AdminProfessionalReviewPage } from './AdminProfessionalReviewPage'

const reviewService = vi.hoisted(() => ({
  listQueue: vi.fn(),
  findAdminDetail: vi.fn(),
  decide: vi.fn(),
  suspend: vi.fn(),
  setActive: vi.fn(),
  assistProfile: vi.fn(),
}))

const catalogService = vi.hoisted(() => ({
  listAvailableCatalog: vi.fn(),
}))

vi.mock('../../../services/professional-review.service', () => ({
  professionalReviewService: reviewService,
}))

vi.mock('../../../services/catalog.service', () => ({
  listAvailableCatalog: catalogService.listAvailableCatalog,
}))

vi.mock('../../../components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}))

const authentication: AuthenticationContextValue = {
  status: 'authenticated',
  user: { uid: 'admin-1', email: 'admin@example.com' } as User,
  sessionError: null,
  login: vi.fn(),
  logout: vi.fn(),
  requestPasswordReset: vi.fn(),
  retrySession: vi.fn(),
}

function detailFixture(
  overrides: Partial<AdminProfessionalReviewDetail['operational']> = {},
): AdminProfessionalReviewDetail {
  return {
    operational: {
      schemaVersion: 1,
      professionalId: 'professional-1',
      reviewStatus: 'UNDER_REVIEW',
      active: false,
      profileVersion: 3,
      submittedVersion: 3,
      approvedVersion: null,
      revision: 4,
      lastEventId: 'review-4',
      professionalFeedback: 'Detalhe melhor sua experiência.',
      approvedCategoryIds: [],
      approvedSpecialtyIds: [],
      approvedBaseCityIbgeCode: '',
      approvedSelectedCityIbgeCodes: [],
      eligibleCityIbgeCodes: [],
      ...overrides,
    },
    profile: {
      professionalId: 'professional-1',
      publicName: 'Ana Profissional',
      headline: 'Eletricista residencial',
      bio: 'Atendimento residencial com experiência comprovada.',
      categoryIds: ['reparos'],
      specialtyIds: ['eletrica'],
      experienceYears: 8,
      baseLocation: { city: 'São José dos Campos', stateCode: 'SP', ibgeCode: '3549904' },
      serviceMode: 'CITY_ONLY',
      serviceRadiusKm: null,
      selectedCities: [],
      availability: 'AVAILABLE',
      contactVisibility: 'PRIVATE',
      publicPhone: '12991706194',
      status: 'PUBLISHED',
      profileImage: { url: 'https://images.example/avatar.webp', altText: 'Ana sorrindo' },
      portfolioImages: [{ url: 'https://images.example/work.webp', altText: 'Instalação concluída', order: 0 }],
    },
    history: [{
      eventId: 'review-4',
      entityType: 'PROFESSIONAL',
      entityId: 'professional-1',
      professionalId: 'professional-1',
      actorId: 'professional-1',
      actorRole: 'PROFESSIONAL',
      action: 'PROFILE_RESUBMITTED',
      reasonCode: 'PROFESSIONAL_RESUBMISSION',
      fromStatus: 'CHANGES_REQUESTED',
      toStatus: 'UNDER_REVIEW',
      profileVersion: 3,
      reviewedVersion: null,
      reason: null,
      createdAt: new Date('2026-10-28T12:00:00Z'),
    }],
    internalHistory: [{
      eventId: 'review-4',
      professionalId: 'professional-1',
      actorId: 'admin-1',
      action: 'PROFILE_RESUBMITTED',
      reviewedVersion: null,
      note: 'Nota privada da equipe.',
      createdAt: new Date('2026-10-28T12:00:00Z'),
    }],
    confirmedEngagements: [{
      requestId: 'request-1',
      status: 'ASSIGNED',
      serviceDate: '2026-11-10',
      period: 'MORNING',
    }],
  }
}

function renderPage(path = '/admin/profissionais') {
  return render(
    <ThemeProvider>
      <AuthenticationContext.Provider value={authentication}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/profissionais" element={<AdminProfessionalReviewPage />} />
            <Route path="/admin/profissionais/:professionalId" element={<AdminProfessionalReviewPage />} />
          </Routes>
        </MemoryRouter>
      </AuthenticationContext.Provider>
    </ThemeProvider>,
  )
}

describe('AdminProfessionalReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reviewService.decide.mockResolvedValue({})
    reviewService.suspend.mockResolvedValue({})
    reviewService.setActive.mockResolvedValue({})
    reviewService.assistProfile.mockResolvedValue({})
    catalogService.listAvailableCatalog.mockResolvedValue({
      categories: [{ id: 'reparos', name: 'Reparos', active: true, order: 1 }],
      specialties: [{ id: 'eletrica', categoryId: 'reparos', name: 'Elétrica', active: true, order: 1 }],
    })
  })

  it('lista a fila paginada e aplica filtros de análise e ativação', async () => {
    reviewService.listQueue.mockResolvedValue({
      items: [{
        operational: detailFixture().operational,
        publicName: 'Ana Profissional',
        headline: 'Eletricista residencial',
        profileImageUrl: null,
      }],
      nextCursor: 'professional-1',
    })

    renderPage()

    expect(await screen.findByText('Ana Profissional')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Analisar cadastro' })).toHaveAttribute(
      'href',
      '/admin/profissionais/professional-1',
    )
    fireEvent.change(screen.getByLabelText('Estado da análise'), { target: { value: 'UNDER_REVIEW' } })
    fireEvent.change(screen.getByLabelText('Ativação'), { target: { value: 'INACTIVE' } })

    await waitFor(() => expect(reviewService.listQueue).toHaveBeenLastCalledWith({
      statuses: ['UNDER_REVIEW'],
      active: false,
      cursor: null,
      pageSize: 12,
    }))
  })

  it('mostra estado vazio e permite tentar novamente após erro', async () => {
    reviewService.listQueue.mockRejectedValueOnce(new Error('Falha de leitura.'))
    renderPage()
    expect(await screen.findByText('Não foi possível carregar a fila')).toBeInTheDocument()
    reviewService.listQueue.mockResolvedValueOnce({ items: [], nextCursor: null })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Nenhum cadastro nesta seleção')).toBeInTheDocument()
  })

  it('exibe cadastro, imagens, versão, histórico privado e aviso de atendimentos', async () => {
    reviewService.findAdminDetail.mockResolvedValue(detailFixture())
    renderPage('/admin/profissionais/professional-1')

    expect(await screen.findByText('Ana Profissional')).toBeInTheDocument()
    expect(screen.getByText('Enviado').parentElement).toHaveTextContent('Enviado v3')
    expect(screen.getByAltText('Instalação concluída')).toHaveAttribute('src', 'https://images.example/work.webp')
    expect(screen.getByText('Reparos')).toBeInTheDocument()
    expect(screen.getByText('Elétrica')).toBeInTheDocument()
    expect(screen.getByText('(12) 99170-6194')).toBeInTheDocument()
    expect(screen.getByText('Disponível para novos atendimentos')).toBeInTheDocument()
    expect(screen.getByText('Atende no município base')).toBeInTheDocument()
    expect(screen.getByText('Nota privada da equipe.')).toBeInTheDocument()
    expect(screen.getByText('Atendimentos confirmados devem ser preservados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprovar cadastro' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Instalação concluída' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Portfólio 1')
    expect(screen.getByText('2 de 2')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('aprova exatamente a versão lida e ativa na mesma operação explícita', async () => {
    reviewService.findAdminDetail.mockResolvedValue(detailFixture())
    renderPage('/admin/profissionais/professional-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar cadastro' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Mensagem ao profissional (opcional)'), {
      target: { value: 'Cadastro revisado.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar decisão' }))

    await waitFor(() => expect(reviewService.decide).toHaveBeenCalledWith({
      professionalId: 'professional-1',
      expectedVersion: 3,
      expectedRevision: 4,
      decision: 'APPROVED',
      activateOnApproval: true,
      feedback: 'Cadastro revisado.',
      internalNote: '',
    }))
  })

  it('impede decisões quando a versão enviada não é a versão atual', async () => {
    reviewService.findAdminDetail.mockResolvedValue(detailFixture({
      profileVersion: 4,
      submittedVersion: 3,
    }))
    renderPage('/admin/profissionais/professional-1')

    expect(await screen.findByText('Divergência impede a decisão')).toBeInTheDocument()
    expect(screen.getByText(/recarregue o cadastro antes de decidir/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprovar cadastro' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Solicitar ajustes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rejeitar cadastro' })).toBeDisabled()
  })

  it('resume eventos recentes e permite consultar os anteriores', async () => {
    const detail = detailFixture()
    detail.history = Array.from({ length: 5 }, (_, index) => ({
      ...detail.history[0],
      eventId: `review-${index + 1}`,
      createdAt: new Date(`2026-10-${String(20 + index).padStart(2, '0')}T12:00:00Z`),
    }))
    detail.internalHistory = []
    reviewService.findAdminDetail.mockResolvedValue(detail)
    renderPage('/admin/profissionais/professional-1')

    expect(await screen.findAllByText('Enviado novamente')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 1 evento(s) anterior(es)' }))
    const events = await screen.findAllByText('Enviado novamente')
    expect(events).toHaveLength(5)
    const summary = events[0].closest('summary')
    expect(summary).not.toBeNull()
    fireEvent.click(summary as HTMLElement)
    expect(summary?.parentElement).toHaveAttribute('open')
  })

  it('exige confirmação e nota privada no auxílio administrativo', async () => {
    reviewService.findAdminDetail.mockResolvedValue(detailFixture())
    renderPage('/admin/profissionais/professional-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Auxiliar no preenchimento' }))
    const dialog = screen.getByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Salvar nova versão' })
    expect(save).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Motivo do auxílio'), {
      target: { value: 'Correção confirmada por telefone.' },
    })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.change(within(dialog).getByLabelText('Apresentação curta'), {
      target: { value: 'Eletricista residencial e comercial' },
    })
    fireEvent.click(save)

    await waitFor(() => expect(reviewService.assistProfile).toHaveBeenCalledWith(expect.objectContaining({
      professionalId: 'professional-1',
      expectedVersion: 3,
      expectedRevision: 4,
      internalNote: 'Correção confirmada por telefone.',
      changes: expect.objectContaining({ headline: 'Eletricista residencial e comercial' }),
    })))
  })
})
