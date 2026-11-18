import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCatalog } from '../../home/use-catalog'
import { useProfile } from '../../onboarding/use-profile'
import type { ServiceRequestSummary } from '../../../types/service-request'
import { ClientHomePage } from './ClientHomePage'

const requestMocks = vi.hoisted(() => ({
  subscribeOwnActiveRequests: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('../../../services/service-request.service', () => ({
  serviceRequestService: {
    subscribeOwnActiveRequests: requestMocks.subscribeOwnActiveRequests,
  },
}))

vi.mock('../../../components/layout/ClientLayout', () => ({
  ClientLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../home/use-catalog', () => ({
  useCatalog: vi.fn(),
}))

vi.mock('../../onboarding/use-profile', () => ({
  useProfile: vi.fn(),
}))

const catalog = {
  categories: [
    {
      id: 'construction',
      name: 'Construção e manutenção',
      active: true,
      order: 10,
    },
    {
      id: 'residential',
      name: 'Serviços residenciais',
      active: true,
      order: 20,
    },
  ],
  specialties: [
    {
      id: 'electrician',
      categoryId: 'construction',
      name: 'Eletricista',
      active: true,
      order: 10,
    },
    {
      id: 'other-construction',
      categoryId: 'construction',
      name: 'Outros',
      active: true,
      order: 20,
    },
    {
      id: 'gardener',
      categoryId: 'residential',
      name: 'Jardineiro',
      active: true,
      order: 10,
    },
    {
      id: 'other-residential',
      categoryId: 'residential',
      name: 'Outros',
      active: true,
      order: 20,
    },
  ],
}

function renderPage(path = '/cliente') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ClientHomePage />
    </MemoryRouter>,
  )
}

function request(
  requestId: string,
  overrides: Partial<ServiceRequestSummary> = {},
): ServiceRequestSummary {
  return {
    requestId,
    operationKey: 'operation-key-0000000001',
    clientId: 'client-123',
    categoryId: 'construction',
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

describe('ClientHomePage', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    requestMocks.subscribeOwnActiveRequests.mockImplementation((input) => {
      queueMicrotask(() => input.onRequests({ items: [], fromCache: false }))
      return requestMocks.unsubscribe
    })
    vi.mocked(useProfile).mockReturnValue({
      profile: {
        userId: 'client-123',
        name: 'Marina Souza',
        email: 'marina@example.com',
        roles: ['client'],
        activeMode: 'client',
        professionalProfileStatus: 'not-started',
      },
    } as ReturnType<typeof useProfile>)
    vi.mocked(useCatalog).mockReturnValue({
      status: 'ready',
      catalog,
      error: null,
      retry: vi.fn(),
    })
  })

  it('personaliza a saudação e transforma o catálogo real em atalhos da solicitação', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /olá, marina/i })).toHaveTextContent(
      'Encontre o serviço para sua casa.',
    )
    expect(screen.getByRole('link', { name: 'Solicitar serviço' })).toHaveAttribute(
      'href',
      '/cliente/solicitar',
    )
    expect(
      screen.getByRole('link', {
        name: 'Solicitar Eletricista — Construção e manutenção',
      }),
    ).toHaveAttribute('href', '/cliente/solicitar?specialty=electrician')
    expect(
      screen.getByRole('link', {
        name: 'Solicitar Jardineiro — Serviços residenciais',
      }),
    ).toHaveAttribute('href', '/cliente/solicitar?specialty=gardener')
    expect(screen.getByText('Acompanhe cada pedido e suas atualizações em tempo real.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver meus pedidos' })).toHaveAttribute(
      'href',
      '/cliente/pedidos',
    )
  })

  it('prioriza todos os pedidos ativos antes do catálogo com acesso à listagem', async () => {
    requestMocks.subscribeOwnActiveRequests.mockImplementation((input) => {
      queueMicrotask(() =>
        input.onRequests({
          items: [
            {
              request: request('request-first', {
                serviceDate: '2030-01-10',
                status: 'ASSIGNED',
              }),
              createdAt: new Date('2029-12-01T10:00:00.000Z'),
              updatedAt: new Date('2029-12-02T10:00:00.000Z'),
            },
            {
              request: request('request-second', {
                serviceDate: '2030-01-11',
                period: 'AFTERNOON',
              }),
              createdAt: new Date('2029-12-03T10:00:00.000Z'),
              updatedAt: new Date('2029-12-03T10:00:00.000Z'),
            },
          ],
          fromCache: false,
        }),
      )
      return requestMocks.unsubscribe
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '2 pedidos ativos' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Acompanhar pedido' })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Meus pedidos' })).toHaveAttribute(
      'href',
      '/cliente/pedidos',
    )
    const activeHeading = screen.getByRole('heading', { name: '2 pedidos ativos' })
    const catalogHeading = screen.getByRole('heading', { name: 'Explore os serviços' })
    expect(
      activeHeading.compareDocumentPosition(catalogHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('identifica dados offline sem usar o status salvo como confirmação atual', async () => {
    requestMocks.subscribeOwnActiveRequests.mockImplementation((input) => {
      queueMicrotask(() =>
        input.onRequests({
          items: [
            {
              request: request('request-offline', { status: 'ASSIGNED' }),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          fromCache: true,
        }),
      )
      return requestMocks.unsubscribe
    })

    renderPage()

    expect(await screen.findByText('Estados salvos no dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Estado salvo')).toBeInTheDocument()
    expect(screen.getByText(/não confirmam a situação atual/i)).toBeInTheDocument()
  })

  it('leva o foco à busca ao abrir a ação da navegação por hash', () => {
    renderPage('/cliente#catalogo-servicos')

    expect(screen.getByLabelText('Buscar no catálogo de serviços')).toHaveFocus()
  })

  it('combina busca e categoria sem fundir especialidades Outros', async () => {
    const user = userEvent.setup()
    renderPage()

    const search = screen.getByLabelText('Buscar no catálogo de serviços')
    await user.type(search, 'outros')

    expect(
      screen.getByRole('link', {
        name: 'Solicitar Outros — Construção e manutenção',
      }),
    ).toHaveAttribute('href', '/cliente/solicitar?specialty=other-construction')
    expect(
      screen.getByRole('link', {
        name: 'Solicitar Outros — Serviços residenciais',
      }),
    ).toHaveAttribute('href', '/cliente/solicitar?specialty=other-residential')

    await user.click(
      screen.getByRole('button', { name: 'Construção e manutenção' }),
    )
    expect(
      screen.getByRole('link', {
        name: 'Solicitar Outros — Construção e manutenção',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', {
        name: 'Solicitar Outros — Serviços residenciais',
      }),
    ).not.toBeInTheDocument()
  })

  it('exibe as especialidades em ordem alfabética com desempate estável', () => {
    renderPage()

    const serviceLinks = screen.getAllByRole('link', { name: /^Solicitar .+ — / })
    expect(serviceLinks.map((link) => link.textContent?.trim())).toEqual([
      'EletricistaConstrução e manutenção',
      'JardineiroServiços residenciais',
      'OutrosConstrução e manutenção',
      'OutrosServiços residenciais',
    ])
  })

  it('trata nenhum resultado e limpa busca e categoria em conjunto', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Serviços residenciais' }))
    await user.type(
      screen.getByLabelText('Buscar no catálogo de serviços'),
      'eletricista',
    )
    expect(screen.getByText('Nenhum serviço encontrado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByRole('link', {
        name: 'Solicitar Eletricista — Construção e manutenção',
      }),
    ).toBeInTheDocument()
  })

  it('oferece nova tentativa quando o catálogo falha', async () => {
    const retry = vi.fn()
    vi.mocked(useCatalog).mockReturnValue({
      status: 'error',
      catalog: null,
      error: 'Verifique sua conexão e tente novamente.',
      retry,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent(/verifique sua conexão/i)
  })

  it('apresenta carregamento e catálogo vazio sem inventar opções', () => {
    vi.mocked(useCatalog).mockReturnValueOnce({
      status: 'loading',
      catalog: null,
      error: null,
      retry: vi.fn(),
    })
    const view = renderPage()
    expect(screen.getByRole('status', { name: 'Carregando catálogo de serviços' })).toBeInTheDocument()

    view.unmount()
    vi.mocked(useCatalog).mockReturnValueOnce({
      status: 'ready',
      catalog: { categories: [], specialties: [] },
      error: null,
      retry: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Nenhum serviço disponível')).toBeInTheDocument()
  })
})
