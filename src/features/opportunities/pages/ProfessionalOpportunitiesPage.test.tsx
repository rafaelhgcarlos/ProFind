import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpportunityFeedSubscriptionInput } from '../../../services/service-request.service'
import type { ProfessionalOpportunitySummary } from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalOpportunitiesPage } from './ProfessionalOpportunitiesPage'

const mocks = vi.hoisted(() => ({
  subscriptions: [] as OpportunityFeedSubscriptionInput[],
  unsubscribers: [] as ReturnType<typeof vi.fn>[],
  acceptOpportunity: vi.fn(),
  declineOpportunity: vi.fn(),
  getCurrentProfessionalAssignment: vi.fn(),
  cancelAssignment: vi.fn(),
  findReview: vi.fn(),
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../professional-profile/components/ProfessionalRegistrationSupport', () => ({
  ProfessionalRegistrationSupport: () => <div>Ajuda para cadastro</div>,
}))

vi.mock('../../../services/service-request.service', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../services/service-request.service')
  >()
  return {
    ...actual,
    serviceRequestService: {
      subscribeOpportunityFeed(input: OpportunityFeedSubscriptionInput) {
        mocks.subscriptions.push(input)
        const unsubscribe = vi.fn()
        mocks.unsubscribers.push(unsubscribe)
        return unsubscribe
      },
      acceptOpportunity: mocks.acceptOpportunity,
      declineOpportunity: mocks.declineOpportunity,
      getCurrentProfessionalAssignment: mocks.getCurrentProfessionalAssignment,
      cancelAssignment: mocks.cancelAssignment,
    },
  }
})

vi.mock('../../../services/professional-review.service', () => ({
  professionalReviewService: {
    findByProfessionalId: mocks.findReview,
  },
}))

vi.mock('../../auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('../../home/use-catalog', () => ({ useCatalog: vi.fn() }))
vi.mock('../../onboarding/use-profile', () => ({ useProfile: vi.fn() }))

const catalog = {
  categories: [
    { id: 'maintenance', name: 'Construção e manutenção', active: true, order: 1 },
  ],
  specialties: [
    { id: 'electrician', categoryId: 'maintenance', name: 'Eletricista', active: true, order: 1 },
    { id: 'painter', categoryId: 'maintenance', name: 'Pintor', active: true, order: 2 },
  ],
}

const profile = {
  userId: 'professional-a',
  name: 'Marina Souza',
  email: 'marina@example.com',
  roles: ['professional'] as const,
  activeMode: 'professional' as const,
  professionalProfileStatus: 'complete' as const,
}

const professionalProfile = {
  userId: 'professional-a',
  publicName: 'Marina Serviços',
  headline: '',
  bio: '',
  categoryIds: ['maintenance'],
  specialtyIds: ['electrician', 'painter'],
  experienceYears: 4,
  baseLocation: { city: 'Campinas', stateCode: 'SP', ibgeCode: '3509502' },
  serviceMode: 'CITY_ONLY' as const,
  serviceRadiusKm: null,
  selectedCities: [],
  availability: 'AVAILABLE' as const,
  phone: '',
  contactVisibility: 'PRIVATE' as const,
  privateLocation: { postalCode: '' },
  profileImage: null,
  portfolioImages: [],
  status: 'PUBLISHED' as const,
}

const approvedReview = {
  schemaVersion: 1 as const,
  professionalId: 'professional-a',
  reviewStatus: 'APPROVED' as const,
  active: true,
  profileVersion: 1,
  submittedVersion: 1,
  approvedVersion: 1,
  revision: 1,
  lastEventId: 'review-1',
  professionalFeedback: null,
  approvedCategoryIds: ['maintenance'],
  approvedSpecialtyIds: ['electrician', 'painter'],
  approvedBaseCityIbgeCode: '3509502',
  approvedSelectedCityIbgeCodes: [],
  eligibleCityIbgeCodes: ['3509502'],
}

function opportunity(
  requestId: string,
  specialtyId = 'electrician',
  offset = 3_600_000,
): ProfessionalOpportunitySummary {
  return {
    requestId,
    categoryId: 'maintenance',
    specialtyId,
    descriptionPreview:
      specialtyId === 'electrician'
        ? 'Revisar duas tomadas que pararam de funcionar após uma oscilação.'
        : 'Preparar e pintar a parede principal da sala.',
    cityIbgeCode: '3509502',
    serviceDate: '2099-11-20',
    period: 'MORNING' as const,
    periodStartAt: new Date(Date.now() + offset + 3_600_000),
    acceptUntil: new Date(Date.now() + offset),
    round: 1,
    reopenReason: null,
  }
}

function readyPage(
  items: ReturnType<typeof opportunity>[],
  nextCursor: { version: 1; page: number } | null = null,
) {
  return {
    page: { items, nextCursor },
    fromCache: false,
  }
}

function renderPage(path = '/profissional') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProfessionalOpportunitiesPage />
    </MemoryRouter>,
  )
}

function renderPageWithAppointmentRoute() {
  return render(
    <MemoryRouter initialEntries={['/profissional']}>
      <Routes>
        <Route path="/profissional" element={<ProfessionalOpportunitiesPage />} />
        <Route
          path="/profissional/oportunidades/:requestId"
          element={<h1>Detalhe da oportunidade</h1>}
        />
        <Route
          path="/profissional/atendimentos/:requestId"
          element={<h1>Detalhe real do atendimento</h1>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function publishFirstPage(items = [opportunity('request-1')]) {
  await waitFor(() => expect(mocks.subscriptions).toHaveLength(1))
  act(() => {
    mocks.subscriptions[0].onAccessChange(true)
    mocks.subscriptions[0].onPage(readyPage(items))
  })
}

describe('ProfessionalOpportunitiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.subscriptions.length = 0
    mocks.unsubscribers.length = 0
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'professional-a' },
    } as ReturnType<typeof useAuth>)
    vi.mocked(useProfile).mockReturnValue({
      profile,
      professionalProfile,
    } as unknown as ReturnType<typeof useProfile>)
    vi.mocked(useCatalog).mockReturnValue({
      status: 'ready',
      catalog,
      error: null,
      retry: vi.fn(),
    })
    mocks.findReview.mockResolvedValue(approvedReview)
    mocks.acceptOpportunity.mockResolvedValue({
      requestId: 'request-1',
      assignmentId: 'round-1',
      reservationId: '2099-11-20_MORNING',
      round: 1,
      idempotent: false,
    })
    mocks.declineOpportunity.mockResolvedValue({
      requestId: 'request-1',
      round: 1,
      idempotent: false,
    })
    mocks.getCurrentProfessionalAssignment.mockResolvedValue({
      opportunity: opportunity('request-1'),
      assignmentId: 'round-1',
    })
    mocks.cancelAssignment.mockResolvedValue({
      requestId: 'request-1',
      cancelledAssignmentId: 'round-1',
      reopenedRound: 2,
      replacementSearchOpen: true,
      idempotent: false,
    })
  })

  it('não abre o feed para profissional restrito e preserva status, feedback e ajuda', async () => {
    mocks.findReview.mockResolvedValue({
      ...approvedReview,
      reviewStatus: 'CHANGES_REQUESTED',
      active: false,
      professionalFeedback: 'Atualize os municípios atendidos.',
    })
    renderPage()

    await waitFor(() => expect(mocks.subscriptions).toHaveLength(1))
    act(() => mocks.subscriptions[0].onAccessChange(false))

    expect(await screen.findByText('Acompanhe seu cadastro profissional')).toBeInTheDocument()
    expect(screen.getByText('Atualize os municípios atendidos.')).toBeInTheDocument()
    expect(screen.getByText('Ajuda para cadastro')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument()
  })

  it('mostra somente o resumo autorizado e leva ao detalhe sem aceitar pelo card', async () => {
    const user = userEvent.setup()
    renderPageWithAppointmentRoute()
    await publishFirstPage()

    expect(screen.getByText('Eletricista')).toBeInTheDocument()
    expect(screen.getByText('Campinas')).toBeInTheDocument()
    expect(screen.getByText(/Revisar duas tomadas/)).toHaveClass('line-clamp-2')
    expect(screen.queryByText(/telefone|endereço|cliente/i)).not.toBeInTheDocument()

    const cardLink = screen.getByRole('link', { name: /Ver detalhes/ })
    expect(within(cardLink).queryByRole('button')).not.toBeInTheDocument()
    cardLink.focus()
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('heading', { name: 'Detalhe da oportunidade' }),
    ).toBeInTheDocument()
    expect(mocks.acceptOpportunity).not.toHaveBeenCalled()
    expect(mocks.declineOpportunity).not.toHaveBeenCalled()
  })

  it('não oferece aceite imediato no card', async () => {
    renderPage()
    await publishFirstPage()

    expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver detalhes/ })).toHaveAttribute(
      'href',
      '/profissional/oportunidades/request-1',
    )
  })

  it('remove a recusa dos cards no início e na listagem', async () => {
    const view = renderPage()
    await publishFirstPage([
      opportunity('request-1'),
      opportunity('request-2', 'painter'),
    ])

    expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Ver detalhes/ })).toHaveLength(2)
    expect(mocks.declineOpportunity).not.toHaveBeenCalled()

    view.unmount()
    mocks.subscriptions.length = 0
    renderPage('/profissional/oportunidades')
    await publishFirstPage([opportunity('request-3')])

    expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver detalhes/ })).toHaveAttribute(
      'href',
      '/profissional/oportunidades/request-3',
    )
    expect(mocks.declineOpportunity).not.toHaveBeenCalled()
  })

  it('identifica no feed a nova rodada aberta para substituição', async () => {
    renderPage()
    await publishFirstPage([
      {
        ...opportunity('request-1'),
        round: 2,
        reopenReason: 'PROFESSIONAL_CANCELLATION' as const,
      },
    ])

    expect(screen.getByText('Substituição solicitada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver detalhes/ })).toBeInTheDocument()
  })

  it('permite ao profissional suspenso cancelar compromisso existente com confirmação e motivo', async () => {
    mocks.findReview.mockResolvedValue({
      ...approvedReview,
      reviewStatus: 'SUSPENDED',
      active: false,
    })
    mocks.cancelAssignment.mockResolvedValueOnce({
      requestId: 'request-1',
      cancelledAssignmentId: 'round-1',
      reopenedRound: 2,
      replacementSearchOpen: false,
      idempotent: false,
    })
    const user = userEvent.setup()
    renderPage('/profissional?atendimento=request-1&atribuicao=round-1')
    await waitFor(() => expect(mocks.subscriptions).toHaveLength(1))
    act(() => mocks.subscriptions[0].onAccessChange(false))

    expect(await screen.findByText('Atendimento confirmado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar atendimento' }))
    expect(mocks.cancelAssignment).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe o motivo do cancelamento em 10 a 500 caracteres.',
    )

    await user.type(
      screen.getByLabelText('Motivo do cancelamento *'),
      'Tive uma emergência e não conseguirei comparecer.',
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))

    await waitFor(() => expect(mocks.cancelAssignment).toHaveBeenCalledWith({
      requestId: 'request-1',
      expectedAssignmentId: 'round-1',
      reason: 'Tive uma emergência e não conseguirei comparecer.',
    }))
    expect(await screen.findByText(/pendente para intervenção ou reagendamento/i)).toBeInTheDocument()
  })

  it('pagina com cursor, elimina duplicações e desmonta listeners na troca de conta', async () => {
    const user = userEvent.setup()
    const cursor = {
      version: 1 as const,
      page: 2,
    }
    const view = renderPage()
    await waitFor(() => expect(mocks.subscriptions).toHaveLength(1))
    act(() => {
      mocks.subscriptions[0].onAccessChange(true)
      mocks.subscriptions[0].onPage(readyPage([opportunity('request-1')], cursor))
    })

    await user.click(screen.getByRole('button', { name: 'Carregar mais oportunidades' }))
    await waitFor(() => expect(mocks.subscriptions).toHaveLength(2))
    expect(mocks.subscriptions[1].cursor).toEqual(cursor)
    act(() => {
      mocks.subscriptions[1].onAccessChange(true)
      mocks.subscriptions[1].onPage(
        readyPage([
          opportunity('request-1'),
          opportunity('request-2', 'painter'),
        ]),
      )
    })
    expect(screen.getAllByRole('heading', { name: 'Eletricista' })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Pintor' })).toBeInTheDocument()

    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'professional-b' },
    } as ReturnType<typeof useAuth>)
    view.rerender(
      <MemoryRouter initialEntries={['/profissional']}>
        <ProfessionalOpportunitiesPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(mocks.unsubscribers[0]).toHaveBeenCalledOnce()
      expect(mocks.unsubscribers[1]).toHaveBeenCalledOnce()
    })
    expect(screen.queryByRole('heading', { name: 'Pintor' })).not.toBeInTheDocument()
  })
})
