import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OpportunityFeedSubscriptionInput } from '../../../services/service-request.service'
import { ServiceRequestError } from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalOpportunitiesPage } from './ProfessionalOpportunitiesPage'

const mocks = vi.hoisted(() => ({
  subscriptions: [] as OpportunityFeedSubscriptionInput[],
  unsubscribers: [] as ReturnType<typeof vi.fn>[],
  acceptOpportunity: vi.fn(),
  declineOpportunity: vi.fn(),
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
) {
  return {
    requestId,
    categoryId: 'maintenance',
    specialtyId,
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

  it('mostra somente a projeção autorizada e confirma o aceite apenas após o commit', async () => {
    let resolveAcceptance: ((value: unknown) => void) | undefined
    mocks.acceptOpportunity.mockReturnValue(
      new Promise((resolve) => {
        resolveAcceptance = resolve
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await publishFirstPage()

    expect(screen.getByText('Eletricista')).toBeInTheDocument()
    expect(screen.getByText('Campinas')).toBeInTheDocument()
    expect(screen.queryByText(/telefone|endereço|cliente/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(screen.getByRole('button', { name: 'Confirmando…' })).toBeDisabled()
    expect(screen.queryByText('Aceite confirmado')).not.toBeInTheDocument()

    await act(async () => {
      resolveAcceptance?.({ assignmentId: 'round-1' })
    })
    expect(await screen.findByText('Aceite confirmado')).toBeInTheDocument()
    expect(screen.queryByText('Eletricista')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /agendados/i })).not.toBeInTheDocument()
  })

  it('mantém erro de disputa no card e impede um segundo clique', async () => {
    mocks.acceptOpportunity.mockRejectedValue(
      new ServiceRequestError('opportunity-taken', 'taken'),
    )
    const user = userEvent.setup()
    renderPage()
    await publishFirstPage()

    await user.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(
      await screen.findByText('Outro profissional confirmou esta oportunidade primeiro.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeDisabled()
    expect(mocks.acceptOpportunity).toHaveBeenCalledOnce()
  })

  it('recusa somente o card escolhido e mantém as demais oportunidades', async () => {
    const user = userEvent.setup()
    renderPage()
    await publishFirstPage([
      opportunity('request-1'),
      opportunity('request-2', 'painter'),
    ])

    const electricianCard = screen
      .getByRole('heading', { name: 'Eletricista' })
      .closest('.rounded-lg')
    expect(electricianCard).not.toBeNull()
    await user.click(within(electricianCard as HTMLElement).getByRole('button', { name: 'Recusar' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Eletricista' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: 'Pintor' })).toBeInTheDocument()
    expect(mocks.declineOpportunity).toHaveBeenCalledWith({
      requestId: 'request-1',
      expectedRound: 1,
    })
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
