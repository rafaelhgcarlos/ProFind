import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminServiceRequestsPage } from './AdminServiceRequestsPage'

const mocks = vi.hoisted(() => ({
  listRequests: vi.fn(),
  getDetail: vi.fn(),
  useAuth: vi.fn(),
  useCatalog: vi.fn(),
}))

vi.mock('../../../components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('../../auth/use-auth', () => ({ useAuth: mocks.useAuth }))
vi.mock('../../home/use-catalog', () => ({ useCatalog: mocks.useCatalog }))
vi.mock('../../../services/admin-service-request.service', () => ({
  adminServiceRequestService: {
    listRequests: mocks.listRequests,
    getDetail: mocks.getDetail,
  },
}))

const request = {
  requestId: 'request-admin-0001',
  operationKey: 'request-admin-0001',
  clientId: 'client-owner',
  categoryId: 'maintenance',
  specialtyId: 'electrician',
  cityIbgeCode: '3509502',
  serviceDate: '2026-11-20',
  period: 'MORNING' as const,
  periodStartAt: new Date('2026-11-20T11:00:00Z'),
  acceptUntil: new Date('2020-11-20T10:30:00Z'),
  status: 'OPEN' as const,
  round: 1,
  currentRoundId: 'round-1',
  assignedProfessionalId: null,
  currentAssignmentId: null,
  reopenReason: null,
  excludedProfessionalIds: [],
}

function renderPage(path = '/admin/pedidos') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/pedidos" element={<AdminServiceRequestsPage />} />
        <Route path="/admin/pedidos/:requestId" element={<AdminServiceRequestsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminServiceRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAuth.mockReturnValue({ user: { uid: 'admin', email: 'admin@example.com' } })
    mocks.useCatalog.mockReturnValue({
      status: 'ready',
      catalog: {
        categories: [{ id: 'maintenance', name: 'Manutenção', active: true, order: 1 }],
        specialties: [{ id: 'electrician', categoryId: 'maintenance', name: 'Eletricista', active: true, order: 1 }],
      },
    })
    mocks.listRequests.mockResolvedValue({
      items: [{
        request,
        city: 'Campinas',
        stateCode: 'SP',
        createdAt: new Date('2026-11-10T12:00:00Z'),
        responsibleName: null,
      }],
      nextCursor: { serviceDate: request.serviceDate, requestId: request.requestId },
    })
    mocks.getDetail.mockResolvedValue({
      request,
      privateData: {
        requestId: request.requestId,
        operationKey: request.operationKey,
        clientId: request.clientId,
        contactName: 'Cliente Exemplo',
        contactPhone: '11999998888',
        notes: 'Verificar a instalação.',
        address: {
          street: 'Rua Privada',
          number: '100',
          complement: 'Casa',
          neighborhood: 'Centro',
          city: 'Campinas',
          stateCode: 'SP',
          postalCode: '13000000',
          ibgeCode: '3509502',
        },
      },
      createdAt: new Date('2026-11-10T12:00:00Z'),
      updatedAt: new Date('2026-11-10T12:00:00Z'),
      responsibleName: null,
      rounds: [{
        roundId: 'round-1',
        round: 1,
        status: 'OPEN',
        reason: 'INITIAL',
        previousAssignmentId: null,
        excludedProfessionalIds: [],
        openedAt: new Date('2026-11-10T12:00:00Z'),
        closedAt: null,
        closedReason: null,
      }],
      assignments: [],
      history: [],
    })
  })

  it('lista, pagina e aplica filtros sem carregar a coleção inteira', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Eletricista')).toBeInTheDocument()
    expect(screen.getByText('Campinas — SP')).toBeInTheDocument()
    expect(screen.getByText('Ainda sem aceite')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Próxima/i }))
    await waitFor(() => expect(mocks.listRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageSize: 12,
        cursor: { serviceDate: request.serviceDate, requestId: request.requestId },
      }),
    ))

    await user.type(screen.getByLabelText('Identificador exato'), 'request-admin-0001')
    await user.selectOptions(screen.getByLabelText('Estado'), 'OPEN')
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await waitFor(() => expect(mocks.listRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'request-admin-0001', status: 'OPEN', cursor: null }),
    ))
  })

  it('mostra detalhe privado, rodadas e prazo encerrado sem afirmar ausência de candidatos', async () => {
    renderPage(`/admin/pedidos/${request.requestId}`)

    expect(await screen.findByText('Endereço privado autorizado')).toBeInTheDocument()
    expect(screen.getByText(/Rua Privada, 100/)).toBeInTheDocument()
    expect(screen.getByText('Cliente Exemplo')).toBeInTheDocument()
    expect(screen.getByText('Rodada 1')).toBeInTheDocument()
    expect(screen.getAllByText('Prazo de aceite encerrado')).not.toHaveLength(0)
    expect(screen.getByText(/não afirma ausência de profissionais elegíveis/i)).toBeInTheDocument()
    expect(screen.queryByText(/sem candidatos/i)).not.toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledWith(request.requestId)
  })
})
