import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { ProfessionalAppointmentsSubscriptionInput } from '../../../services/service-request.service'
import type { ProfessionalAppointmentSummary } from '../../../types/service-request'
import { ProfessionalAgendaPreview } from './ProfessionalAgendaPreview'

const subscribe = vi.hoisted(() => vi.fn<(input: ProfessionalAppointmentsSubscriptionInput) => () => void>(() => () => {}))

vi.mock('../../../services/service-request.service', () => ({
  serviceRequestService: { subscribeProfessionalAppointments: subscribe },
}))

describe('ProfessionalAgendaPreview', () => {
  it('distingue prévia paginada, agenda confirmada e dados do dispositivo', () => {
    const appointment: ProfessionalAppointmentSummary = {
      requestId: 'pedido-agendado',
      categoryId: 'construction',
      specialtyId: 'electrical',
      serviceDate: '2030-01-20',
      period: 'MORNING',
      periodStartAt: new Date('2030-01-20T11:00:00Z'),
      status: 'ASSIGNED',
      round: 1,
      assignmentId: 'assignment-1',
    }
    render(
      <MemoryRouter>
        <ProfessionalAgendaPreview
          now={Date.parse('2030-01-01T00:00:00Z')}
          online
          specialtyNames={new Map([['electrical', 'Eletricista']])}
        />
      </MemoryRouter>,
    )
    const subscription = subscribe.mock.calls[0][0]
    act(() => subscription.onPage({
      page: { items: [appointment], nextCursor: { requestId: 'pedido-agendado' } },
      fromCache: false,
    }))
    expect(screen.getByRole('heading', { name: 'Atendimento na sua agenda' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver atendimento' })).toHaveAttribute('href', '/profissional/atendimentos/pedido-agendado')

    act(() => subscription.onPage({ page: { items: [appointment], nextCursor: null }, fromCache: false }))
    expect(screen.getByRole('heading', { name: 'Próximo atendimento' })).toBeVisible()

    act(() => subscription.onPage({ page: { items: [appointment], nextCursor: null }, fromCache: true }))
    expect(screen.getByText('Estado salvo')).toBeVisible()
    expect(screen.queryByText('Confirmado')).toBeNull()
  })
})
