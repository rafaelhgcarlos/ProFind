import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientRequestTrackingDetails, ServiceRequestSummary } from '../../../types/service-request'
import { ClientRequestsPage } from './ClientRequestsPage'

const mocks = vi.hoisted(() => ({
  userId: 'client-a',
  subscribeOwnRequests: vi.fn(),
  subscribeOwnRequestTracking: vi.fn(),
  listUnsubscribe: vi.fn(),
  detailUnsubscribe: vi.fn(),
}))

vi.mock('../../../services/service-request.service', () => ({
  serviceRequestService: {
    subscribeOwnRequests: mocks.subscribeOwnRequests,
    subscribeOwnRequestTracking: mocks.subscribeOwnRequestTracking,
  },
}))
vi.mock('../../auth/use-auth', () => ({ useAuth: () => ({ user: { uid: mocks.userId } }) }))
vi.mock('../../onboarding/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Cliente' } }) }))
vi.mock('../../home/use-catalog', () => ({
  useCatalog: () => ({
    status: 'ready',
    catalog: {
      categories: [{ id: 'maintenance', name: 'Manutenção' }],
      specialties: [{ id: 'electrician', categoryId: 'maintenance', name: 'Eletricista' }],
    },
  }),
}))
vi.mock('../../onboarding/components/ModeSwitcher', () => ({ ModeSwitcher: () => null }))
vi.mock('../../../components/layout/ClientLayout', () => ({
  ClientLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('../../service-reports/components/ClientServiceReports', () => ({
  ClientServiceReports: () => <section>Relatos deste pedido</section>,
}))
vi.mock('../../../components/ui/image-viewer', () => ({ ImageViewer: () => null }))

function request(overrides: Partial<ServiceRequestSummary> = {}): ServiceRequestSummary {
  return {
    requestId: 'request-1',
    operationKey: 'operation-key-0000000001',
    clientId: mocks.userId,
    categoryId: 'maintenance',
    specialtyId: 'electrician',
    cityIbgeCode: '3509502',
    serviceDate: '2030-01-15',
    period: 'MORNING',
    periodStartAt: new Date('2030-01-15T11:00:00.000Z'),
    acceptUntil: new Date('2030-01-15T10:30:00.000Z'),
    status: 'OPEN',
    round: 1,
    currentRoundId: 'round-1',
    assignedProfessionalId: null,
    currentAssignmentId: null,
    reopenReason: null,
    excludedProfessionalIds: [],
    ...overrides,
  }
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cliente/pedidos" element={<ClientRequestsPage />} />
        <Route path="/cliente/pedidos/:requestId" element={<ClientRequestsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ClientRequestsPage', () => {
  beforeEach(() => {
    mocks.userId = 'client-a'
    vi.clearAllMocks()
    mocks.subscribeOwnRequests.mockImplementation((input) => {
      queueMicrotask(() => {
        input.onPage({
          page: {
            items: [{ request: request(), createdAt: new Date(), updatedAt: new Date() }],
            nextCursor: null,
          },
          fromCache: false,
        })
      })
      return mocks.listUnsubscribe
    })
  })

  it('lista o estado real e descarta o listener ao trocar de conta', async () => {
    const view = renderPage('/cliente/pedidos')
    expect(await screen.findByText('Procurando profissional')).toBeInTheDocument()
    expect(screen.queryByText(/profissional responsável/i)).not.toBeInTheDocument()

    mocks.userId = 'client-b'
    view.rerender(
      <MemoryRouter initialEntries={['/cliente/pedidos']}>
        <Routes><Route path="/cliente/pedidos" element={<ClientRequestsPage />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(mocks.listUnsubscribe).toHaveBeenCalled())
    expect(mocks.subscribeOwnRequests).toHaveBeenCalledTimes(2)
  })

  it('recupera do cache offline e pagina com cursor limitado', async () => {
    const user = userEvent.setup()
    let firstPageInput: Parameters<typeof mocks.subscribeOwnRequests>[0] | undefined
    const cursor = { createdAt: new Date('2030-01-01T12:00:00.000Z'), requestId: 'request-1' }
    mocks.subscribeOwnRequests.mockImplementation((input) => {
      if (!input.cursor) {
        firstPageInput = input
        queueMicrotask(() => input.onPage({
          page: {
            items: [{ request: request(), createdAt: cursor.createdAt, updatedAt: cursor.createdAt }],
            nextCursor: cursor,
          },
          fromCache: true,
        }))
      } else {
        queueMicrotask(() => input.onPage({
          page: {
            items: [{ request: request({ requestId: 'request-2' }), createdAt: new Date(), updatedAt: new Date() }],
            nextCursor: null,
          },
          fromCache: false,
        }))
      }
      return mocks.listUnsubscribe
    })

    renderPage('/cliente/pedidos')
    expect(await screen.findByText('Mostrando dados salvos')).toBeInTheDocument()
    firstPageInput?.onPage({
      page: {
        items: [{ request: request(), createdAt: cursor.createdAt, updatedAt: cursor.createdAt }],
        nextCursor: cursor,
      },
      fromCache: false,
    })
    await waitFor(() => expect(screen.queryByText('Mostrando dados salvos')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Próximos' }))
    await waitFor(() => expect(mocks.subscribeOwnRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 10, cursor }),
    ))
    expect(await screen.findByText('Código do pedido · equest-2')).toBeInTheDocument()
  })

  it('exibe somente o responsável atual, portfólio e ausência real de avaliações', async () => {
    const details: ClientRequestTrackingDetails = {
      request: request({
        status: 'ASSIGNED',
        assignedProfessionalId: 'professional-new',
        currentAssignmentId: 'round-2',
        round: 2,
        currentRoundId: 'round-2',
      }),
      privateData: {
        requestId: 'request-1',
        operationKey: 'operation-key-0000000001',
        clientId: 'client-a',
        contactName: 'Cliente',
        contactPhone: '11999999999',
        notes: 'Trocar instalação elétrica',
        address: { street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'Campinas', stateCode: 'SP', postalCode: '13000000', ibgeCode: '3509502' },
      },
      history: [],
      currentProfessional: {
        professionalId: 'professional-new',
        publicName: 'Profissional novo',
        headline: 'Especialista residencial',
        specialtyIds: ['electrician'],
        profileImage: null,
        portfolioImages: [{ provider: 'IMAGEKIT', ownerId: 'professional-new', purpose: 'PROFESSIONAL_PORTFOLIO', url: 'https://ik.imagekit.io/demo/work.jpg', providerId: 'work-1', createdAt: 1, updatedAt: 1, order: 0, altText: 'Quadro elétrico' }],
        rating: null,
        reviewCount: null,
      },
    }
    mocks.subscribeOwnRequestTracking.mockImplementation((input) => {
      queueMicrotask(() => input.onDetails({ details, fromCache: false }))
      return mocks.detailUnsubscribe
    })

    renderPage('/cliente/pedidos/request-1')
    expect(await screen.findByText('Profissional novo')).toBeInTheDocument()
    expect(screen.getByText('Sem avaliações')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ampliar imagem 1/i })).toBeInTheDocument()
    expect(screen.queryByText('Profissional antigo')).not.toBeInTheDocument()
  })
})
