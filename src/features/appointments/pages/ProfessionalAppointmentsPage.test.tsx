import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ProfessionalAppointmentDetailsSubscriptionInput,
  ProfessionalAppointmentsSubscriptionInput,
} from '../../../services/service-request.service'
import type {
  ProfessionalAppointmentDetails,
  ProfessionalAppointmentSummary,
} from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalAppointmentsPage } from './ProfessionalAppointmentsPage'

const mocks = vi.hoisted(() => ({
  pageSubscriptions: [] as ProfessionalAppointmentsSubscriptionInput[],
  detailSubscriptions: [] as ProfessionalAppointmentDetailsSubscriptionInput[],
  unsubscribers: [] as ReturnType<typeof vi.fn>[],
  startAssignment: vi.fn(),
  cancelAssignment: vi.fn(),
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../../services/service-request.service', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../services/service-request.service')
  >()
  return {
    ...actual,
    serviceRequestService: {
      subscribeProfessionalAppointments(input: ProfessionalAppointmentsSubscriptionInput) {
        mocks.pageSubscriptions.push(input)
        const unsubscribe = vi.fn()
        mocks.unsubscribers.push(unsubscribe)
        return unsubscribe
      },
      subscribeProfessionalAppointmentDetails(
        input: ProfessionalAppointmentDetailsSubscriptionInput,
      ) {
        mocks.detailSubscriptions.push(input)
        const unsubscribe = vi.fn()
        mocks.unsubscribers.push(unsubscribe)
        return unsubscribe
      },
      startAssignment: mocks.startAssignment,
      cancelAssignment: mocks.cancelAssignment,
    },
  }
})

vi.mock('../../auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('../../home/use-catalog', () => ({ useCatalog: vi.fn() }))
vi.mock('../../onboarding/use-profile', () => ({ useProfile: vi.fn() }))

const appointment: ProfessionalAppointmentSummary = {
  requestId: 'request-1',
  assignmentId: 'round-1',
  categoryId: 'maintenance',
  specialtyId: 'electrician',
  serviceDate: '2026-11-20',
  period: 'MORNING',
  periodStartAt: new Date(Date.now() - 60_000),
  status: 'ASSIGNED',
  round: 1,
}

const details: ProfessionalAppointmentDetails = {
  appointment,
  privateData: {
    requestId: 'request-1',
    operationKey: 'request-operation-key-000001',
    clientId: 'client-owner',
    contactName: 'Cliente Exemplo',
    contactPhone: '',
    notes: 'Revisar tomadas da cozinha.',
    address: {
      street: 'Rua das Flores',
      number: '100',
      complement: 'Casa 2',
      neighborhood: 'Centro',
      city: 'Campinas',
      stateCode: 'SP',
      postalCode: '13000000',
      ibgeCode: '3509502',
    },
  },
}

function renderPage(path = '/profissional/atendimentos') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/profissional/atendimentos"
          element={<ProfessionalAppointmentsPage />}
        />
        <Route
          path="/profissional/atendimentos/:requestId"
          element={<ProfessionalAppointmentsPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function publishDetails(value = details) {
  await waitFor(() => expect(mocks.detailSubscriptions).toHaveLength(1))
  act(() => {
    mocks.detailSubscriptions[0].onDetails({ details: value, fromCache: false })
  })
}

describe('ProfessionalAppointmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pageSubscriptions.length = 0
    mocks.detailSubscriptions.length = 0
    mocks.unsubscribers.length = 0
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'professional-a' },
    } as ReturnType<typeof useAuth>)
    vi.mocked(useProfile).mockReturnValue({
      profile: { name: 'Marina Souza' },
    } as ReturnType<typeof useProfile>)
    vi.mocked(useCatalog).mockReturnValue({
      status: 'ready',
      catalog: {
        categories: [],
        specialties: [
          {
            id: 'electrician',
            categoryId: 'maintenance',
            name: 'Eletricista',
            active: true,
            order: 1,
          },
        ],
      },
      error: null,
      retry: vi.fn(),
    })
    mocks.startAssignment.mockResolvedValue({
      requestId: 'request-1',
      assignmentId: 'round-1',
      round: 1,
      idempotent: false,
    })
    mocks.cancelAssignment.mockResolvedValue({
      requestId: 'request-1',
      cancelledAssignmentId: 'round-1',
      reopenedRound: 2,
      replacementSearchOpen: true,
      idempotent: false,
    })
  })

  it('mostra lista em tempo real, estado vazio e limpa o listener ao sair', async () => {
    const rendered = renderPage()
    await waitFor(() => expect(mocks.pageSubscriptions).toHaveLength(1))
    act(() => {
      mocks.pageSubscriptions[0].onPage({
        page: { items: [appointment], nextCursor: null },
        fromCache: false,
      })
    })
    expect(screen.getByRole('heading', { name: 'Eletricista' })).toBeVisible()
    expect(screen.getByText('Confirmado')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver atendimento' })).toHaveAttribute(
      'href',
      '/profissional/atendimentos/request-1',
    )

    act(() => {
      mocks.pageSubscriptions[0].onPage({
        page: { items: [], nextCursor: null },
        fromCache: false,
      })
    })
    expect(screen.getByText('Nenhum atendimento agendado')).toBeVisible()
    rendered.unmount()
    expect(mocks.unsubscribers[0]).toHaveBeenCalled()
  })

  it('exibe endereço somente enquanto a atribuição atual permanece autorizada', async () => {
    renderPage('/profissional/atendimentos/request-1')
    await publishDetails()
    expect(screen.getByText(/Rua das Flores, 100/)).toBeVisible()
    expect(screen.getByText('Revisar tomadas da cozinha.')).toBeVisible()

    act(() => {
      mocks.detailSubscriptions[0].onUnavailable(
        new Error('Este atendimento não está mais atribuído a você.') as never,
      )
    })
    expect(screen.queryByText(/Rua das Flores, 100/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Este atendimento não está mais atribuído a você.'),
    ).toBeVisible()
  })

  it('não trata o primeiro snapshot de cache como desconexão imediata', async () => {
    renderPage('/profissional/atendimentos/request-1')
    await waitFor(() => expect(mocks.detailSubscriptions).toHaveLength(1))
    vi.useFakeTimers()
    try {
      act(() => {
        mocks.detailSubscriptions[0].onDetails({
          details,
          fromCache: true,
        })
      })
      expect(
        screen.queryByText('Dados possivelmente desatualizados'),
      ).not.toBeInTheDocument()

      act(() => vi.advanceTimersByTime(1_999))
      expect(
        screen.queryByText('Dados possivelmente desatualizados'),
      ).not.toBeInTheDocument()

      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByText('Dados possivelmente desatualizados')).toBeVisible()

      act(() => {
        mocks.detailSubscriptions[0].onDetails({
          details,
          fromCache: false,
        })
      })
      await act(async () => undefined)
      expect(
        screen.queryByText('Dados possivelmente desatualizados'),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('confirma o início somente depois do commit e não oferece conclusão', async () => {
    let resolveStart: ((value: unknown) => void) | undefined
    mocks.startAssignment.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve
      }),
    )
    const user = userEvent.setup()
    renderPage('/profissional/atendimentos/request-1')
    await publishDetails()

    await user.click(screen.getByRole('button', { name: 'Iniciar atendimento' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar início' }))
    expect(screen.queryByText('Atendimento iniciado')).not.toBeInTheDocument()
    expect(mocks.startAssignment).toHaveBeenCalledWith({
      requestId: 'request-1',
      expectedAssignmentId: 'round-1',
      expectedRound: 1,
    })

    await act(async () => {
      resolveStart?.({ idempotent: false })
    })
    expect(screen.getByText('Atendimento iniciado')).toBeVisible()
    expect(screen.queryByRole('button', { name: /concluir/i })).not.toBeInTheDocument()
  })

  it('exige motivo e preserva o texto quando o cancelamento encontra conflito', async () => {
    mocks.cancelAssignment.mockRejectedValue(
      new Error('A atribuição mudou. Recarregue o atendimento.'),
    )
    const user = userEvent.setup()
    renderPage('/profissional/atendimentos/request-1')
    await publishDetails()

    await user.click(screen.getByRole('button', { name: 'Cancelar atendimento' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))
    expect(mocks.cancelAssignment).not.toHaveBeenCalled()

    const reason = 'Tive uma emergência e não poderei comparecer ao atendimento.'
    await user.type(screen.getByLabelText('Motivo do cancelamento *'), reason)
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))
    expect(await screen.findByText('A atribuição mudou. Recarregue o atendimento.')).toBeVisible()
    expect(screen.getByLabelText('Motivo do cancelamento *')).toHaveValue(reason)
  })
})
