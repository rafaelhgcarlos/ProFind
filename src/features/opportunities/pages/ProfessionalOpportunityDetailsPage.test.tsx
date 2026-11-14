import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfessionalOpportunityDetailsSubscriptionInput } from '../../../services/service-request.service'
import {
  ServiceRequestError,
  type ProfessionalOpportunityDetails,
} from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalOpportunityDetailsPage } from './ProfessionalOpportunityDetailsPage'

const mocks = vi.hoisted(() => ({
  subscriptions: [] as ProfessionalOpportunityDetailsSubscriptionInput[],
  unsubscribers: [] as ReturnType<typeof vi.fn>[],
  acceptOpportunity: vi.fn(),
  declineOpportunity: vi.fn(),
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
vi.mock('../../onboarding/components/ModeSwitcher', () => ({ ModeSwitcher: () => null }))
vi.mock('../../auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('../../home/use-catalog', () => ({ useCatalog: vi.fn() }))
vi.mock('../../onboarding/use-profile', () => ({ useProfile: vi.fn() }))
vi.mock('../../../services/service-request.service', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../services/service-request.service')
  >()
  return {
    ...actual,
    serviceRequestService: {
      subscribeProfessionalOpportunityDetails(
        input: ProfessionalOpportunityDetailsSubscriptionInput,
      ) {
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

const catalog = {
  categories: [
    { id: 'maintenance', name: 'Construção e manutenção', active: true, order: 1 },
  ],
  specialties: [
    { id: 'electrician', categoryId: 'maintenance', name: 'Eletricista', active: true, order: 1 },
  ],
}

function details(overrides: Partial<ProfessionalOpportunityDetails> = {}) {
  return {
    opportunity: {
      requestId: 'request-1',
      categoryId: 'maintenance',
      specialtyId: 'electrician',
      cityIbgeCode: '3509502',
      serviceDate: '2099-11-20',
      period: 'MORNING' as const,
      periodStartAt: new Date('2099-11-20T11:00:00.000Z'),
      acceptUntil: new Date('2099-11-20T10:30:00.000Z'),
      round: 1,
      reopenReason: null,
    },
    description:
      'Preciso revisar duas tomadas da sala.\n\nUma delas parou de funcionar depois de uma oscilação.',
    city: 'Campinas',
    stateCode: 'SP',
    ...overrides,
  } satisfies ProfessionalOpportunityDetails
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profissional/oportunidades/request-1']}>
      <Routes>
        <Route
          path="/profissional/oportunidades/:requestId"
          element={<ProfessionalOpportunityDetailsPage />}
        />
        <Route
          path="/profissional/atendimentos/:requestId"
          element={<h1>Atendimento confirmado</h1>}
        />
        <Route
          path="/profissional/oportunidades"
          element={<h1>Lista de oportunidades</h1>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function publish(value = details(), fromCache = false) {
  await waitFor(() => expect(mocks.subscriptions).toHaveLength(1))
  act(() => mocks.subscriptions[0].onDetails({ details: value, fromCache }))
}

describe('ProfessionalOpportunityDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.subscriptions.length = 0
    mocks.unsubscribers.length = 0
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'professional-a' } } as ReturnType<typeof useAuth>)
    vi.mocked(useProfile).mockReturnValue({ profile: { name: 'Marina' } } as ReturnType<typeof useProfile>)
    vi.mocked(useCatalog).mockReturnValue({
      status: 'ready',
      catalog,
      error: null,
      retry: vi.fn(),
    })
    mocks.acceptOpportunity.mockResolvedValue({ assignmentId: 'round-1' })
    mocks.declineOpportunity.mockResolvedValue({ idempotent: false })
  })

  it('mantém skeletons dentro dos cards enquanto os detalhes carregam', () => {
    renderPage()

    const loading = screen.getByRole('status', {
      name: 'Carregando detalhes da oportunidade',
    })
    const cards = within(loading).getAllByRole('group')
    expect(cards).toHaveLength(4)
    expect(cards.map((card) => card.querySelectorAll('.animate-pulse').length)).toEqual([
      3,
      4,
      4,
      8,
    ])
  })

  it('abre por URL própria, apresenta texto longo e não expõe dados privados', async () => {
    renderPage()
    await publish()

    expect(await screen.findByRole('heading', { name: 'Eletricista' })).toBeInTheDocument()
    expect(screen.getByText(/Preciso revisar duas tomadas/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Campinas — SP' })).toBeInTheDocument()
    expect(screen.getByText('8:00 às 12:00')).toBeInTheDocument()
    expect(
      screen.getByText(
        'O endereço completo estará disponível após a confirmação do aceite.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Aceitar atendimento' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Recusar oportunidade' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Rua Privada|13000-000|11999998888/)).not.toBeInTheDocument()
  })

  it('exige confirmação e só navega depois do commit do aceite', async () => {
    let resolveAcceptance: ((value: { assignmentId: string }) => void) | undefined
    mocks.acceptOpportunity.mockReturnValue(
      new Promise((resolve) => {
        resolveAcceptance = resolve
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await publish()

    await user.click(screen.getByRole('button', { name: 'Aceitar atendimento' }))
    expect(mocks.acceptOpportunity).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar aceite' }))
    expect(mocks.acceptOpportunity).toHaveBeenCalledWith({
      requestId: 'request-1',
      expectedRound: 1,
    })
    expect(screen.queryByRole('heading', { name: 'Atendimento confirmado' })).not.toBeInTheDocument()

    await act(async () => resolveAcceptance?.({ assignmentId: 'round-1' }))
    expect(
      await screen.findByRole('heading', { name: 'Atendimento confirmado' }),
    ).toBeInTheDocument()
  })

  it('exige nova revisão quando conteúdo ou rodada muda', async () => {
    const user = userEvent.setup()
    renderPage()
    await publish()
    act(() =>
      mocks.subscriptions[0].onDetails({
        details: details({
          opportunity: { ...details().opportunity, round: 2 },
          description: 'Descrição atualizada pelo cliente antes do aceite.',
        }),
        fromCache: false,
      }),
    )

    expect(await screen.findByText('A oportunidade foi atualizada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceitar atendimento' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Revisei os dados atualizados' }))
    expect(screen.getByRole('button', { name: 'Aceitar atendimento' })).toBeEnabled()
  })

  it('bloqueia cache offline, concorrência e limpa o listener ao sair', async () => {
    const view = renderPage()
    await publish(details(), true)
    expect(screen.getByRole('button', { name: 'Aceitar atendimento' })).toBeDisabled()

    act(() =>
      mocks.subscriptions[0].onUnavailable(
        new ServiceRequestError('opportunity-taken', 'taken'),
      ),
    )
    expect(
      await screen.findByText(/Outro profissional confirmou esta oportunidade/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Preciso revisar duas tomadas/)).not.toBeInTheDocument()

    view.unmount()
    expect(mocks.unsubscribers[0]).toHaveBeenCalledOnce()
  })

  it('mantém o detalhe para retry quando o aceite falha offline', async () => {
    mocks.acceptOpportunity.mockRejectedValue(
      new ServiceRequestError('offline', 'offline'),
    )
    const user = userEvent.setup()
    renderPage()
    await publish()

    await user.click(screen.getByRole('button', { name: 'Aceitar atendimento' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar aceite' }))

    expect(
      await screen.findByText('Você está offline. Reconecte-se para confirmar o aceite.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Preciso revisar duas tomadas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceitar atendimento' })).toBeEnabled()
    expect(mocks.acceptOpportunity).toHaveBeenCalledOnce()
  })

  it('bloqueia o aceite quando o prazo vence sem depender de nova escrita', async () => {
    renderPage()
    await publish(
      details({
        opportunity: {
          ...details().opportunity,
          acceptUntil: new Date(Date.now() - 1_000),
        },
      }),
    )

    expect(await screen.findByText('Prazo encerrado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceitar atendimento' })).toBeDisabled()
    expect(mocks.acceptOpportunity).not.toHaveBeenCalled()
  })
})
