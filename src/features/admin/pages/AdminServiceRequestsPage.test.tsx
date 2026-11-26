import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminServiceRequestsPage } from './AdminServiceRequestsPage'
import type { PageHeading } from '../../../components/layout/PageHeader'

const mocks = vi.hoisted(() => ({
  listRequests: vi.fn(),
  getDetail: vi.fn(),
  verifyEligibility: vi.fn(),
  useAuth: vi.fn(),
  useCatalog: vi.fn(),
}))

vi.mock('../../../components/layout/AdminLayout', () => ({
  AdminLayout: ({ pageTitle, heading, children }: { pageTitle: string; heading?: PageHeading; children: React.ReactNode }) =>
    <main><h1>{heading?.title ?? pageTitle}</h1>{children}</main>,
}))
vi.mock('../../auth/use-auth', () => ({ useAuth: mocks.useAuth }))
vi.mock('../../home/use-catalog', () => ({ useCatalog: mocks.useCatalog }))
vi.mock('../../../services/admin-service-request.service', () => ({
  adminServiceRequestService: {
    listRequests: mocks.listRequests,
    getDetail: mocks.getDetail,
    verifyEligibility: mocks.verifyEligibility,
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
        <Route path="/admin/pendencias" element={<AdminServiceRequestsPage />} />
        <Route path="/admin/pendencias/:requestId" element={<AdminServiceRequestsPage />} />
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
        responsibleRestricted: false,
        openReportCount: 0,
        eligibilityVerification: 'NOT_CHECKED',
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
      responsibleRestricted: false,
      relatedReports: [],
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
    mocks.verifyEligibility.mockResolvedValue({
      verification: 'NONE_FOUND',
      checkedProfessionals: 3,
      eligibleProfessionalIds: [],
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

    await user.type(screen.getByLabelText('Código do pedido'), 'request-admin-0001')
    await user.selectOptions(screen.getByLabelText('Estado'), 'OPEN')
    await user.click(screen.getByText('Mais filtros'))
    await user.selectOptions(screen.getByLabelText('Período'), 'MORNING')
    await user.click(screen.getByText('Mais filtros'))
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await waitFor(() => expect(mocks.listRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'request-admin-0001', operationalState: 'OPEN', period: 'MORNING', cursor: null }),
    ))
    expect(screen.getByText('Período: Manhã')).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Estado'), 'ASSIGNED')
    mocks.listRequests.mockRejectedValueOnce(new Error('Conexão indisponível.'))
    await user.click(screen.getByRole('button', { name: 'Remover filtro Período: Manhã' }))
    expect(await screen.findByText('Conexão indisponível.')).toBeInTheDocument()
    expect(screen.getByLabelText('Estado')).toHaveValue('ASSIGNED')
    expect(screen.getByRole('button', { name: 'Remover filtro Estado: Procurando profissional' })).toBeInTheDocument()
    expect(mocks.listRequests).toHaveBeenLastCalledWith({ requestId: 'request-admin-0001', operationalState: 'OPEN', pageSize: 12, cursor: null })
    expect(screen.getByRole('button', { name: 'Consultar' })).toHaveFocus()
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

  it('identifica a conclusão como informação do profissional', async () => {
    const baseDetail = await mocks.getDetail()
    mocks.getDetail.mockResolvedValueOnce({
      ...baseDetail,
      request: {
        ...request,
        status: 'COMPLETED',
        assignedProfessionalId: 'professional-a',
        currentAssignmentId: 'round-1',
      },
      assignments: [{
        assignmentId: 'round-1',
        professionalId: 'professional-a',
        professionalName: 'Profissional A',
        round: 1,
        status: 'COMPLETED',
        acceptedAt: new Date('2026-11-10T12:00:00Z'),
        startedAt: new Date('2026-11-20T11:00:00Z'),
        endedAt: new Date('2026-11-20T12:00:00Z'),
        endedReason: 'PROFESSIONAL_COMPLETION',
      }],
      history: [{
        eventId: 'completed-round-1',
        entityType: 'SERVICE_REQUEST',
        entityId: request.requestId,
        requestId: request.requestId,
        type: 'SERVICE_COMPLETED',
        reasonCode: 'PROFESSIONAL_COMPLETION',
        actorId: 'professional-a',
        actorRole: 'PROFESSIONAL',
        round: 1,
        assignmentId: 'round-1',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'COMPLETED',
        createdAt: new Date('2026-11-20T12:00:00Z'),
      }],
    })
    renderPage(`/admin/pedidos/${request.requestId}`)

    expect(await screen.findAllByText('Conclusão informada pelo profissional')).not.toHaveLength(0)
    expect(screen.getByText(/ainda não foi confirmada pelo cliente/i)).toBeVisible()
    expect(screen.getByText('Concluído')).toBeVisible()
  })

  it('reutiliza a consulta para pendências e só afirma ausência após verificação', async () => {
    const user = userEvent.setup()
    renderPage(`/admin/pedidos/${request.requestId}`)

    await user.click(await screen.findByRole('button', { name: 'Verificar elegibilidade agora' }))
    expect(await screen.findByText('Sem profissionais elegíveis')).toBeInTheDocument()
    expect(screen.getByText(/todos os 3 perfis operacionais/i)).toBeInTheDocument()
    expect(mocks.verifyEligibility).toHaveBeenCalledWith(request.requestId)
  })

  it('organiza a fila de pendências sem duplicar a consulta de pedidos', async () => {
    renderPage('/admin/pendencias')

    expect(await screen.findByText('Pendências que exigem atenção')).toBeInTheDocument()
    expect(screen.getByLabelText('Pendência')).toHaveValue('ALL')
    await waitFor(() => expect(mocks.listRequests).toHaveBeenCalledWith(
      expect.objectContaining({ pending: 'ALL', pageSize: 12 }),
    ))
    expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute(
      'href',
      `/admin/pendencias/${request.requestId}`,
    )
  })
})
