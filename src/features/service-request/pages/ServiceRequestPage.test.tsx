import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceRequestPage } from './ServiceRequestPage'
import type { OwnRequestDetailsSubscriptionInput } from '../../../services/service-request.service'
import {
  ServiceRequestError,
  type OwnServiceRequestDetails,
} from '../../../types/service-request'

const mocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  updateOwnRequest: vi.fn(),
  cancelOwnRequest: vi.fn(),
  getOwnRequest: vi.fn(),
  getOwnRequestDetails: vi.fn(),
  ownDetailsSubscriptions: [] as OwnRequestDetailsSubscriptionInput[],
  useAuth: vi.fn(),
  useProfile: vi.fn(),
  useCatalog: vi.fn(),
}))

vi.mock('../../../components/layout/ClientLayout', () => ({
  ClientLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('../../onboarding/components/ModeSwitcher', () => ({ ModeSwitcher: () => null }))
vi.mock('../../auth/use-auth', () => ({ useAuth: mocks.useAuth }))
vi.mock('../../onboarding/use-profile', () => ({ useProfile: mocks.useProfile }))
vi.mock('../../home/use-catalog', () => ({ useCatalog: mocks.useCatalog }))
vi.mock('../../../services/service-request.service', () => ({
  serviceRequestService: {
    createRequest: mocks.createRequest,
    updateOwnRequest: mocks.updateOwnRequest,
    cancelOwnRequest: mocks.cancelOwnRequest,
    getOwnRequest: mocks.getOwnRequest,
    getOwnRequestDetails: mocks.getOwnRequestDetails,
    subscribeOwnRequestDetails: vi.fn((input) => {
      mocks.ownDetailsSubscriptions.push(input)
      let active = true
      void mocks.getOwnRequestDetails(input.requestId).then(
        (details: OwnServiceRequestDetails) => {
          if (active) input.onDetails({ details, fromCache: false })
        },
        (error: unknown) => {
          if (active) input.onError(error)
        },
      )
      return () => {
        active = false
      }
    }),
  },
}))
vi.mock('../../professional-profile/components/MunicipalityCombobox', () => ({
  MunicipalityCombobox: ({ onSelect }: { onSelect(value: { city: string; stateCode: string; ibgeCode: string }): void }) => (
    <button type="button" onClick={() => onSelect({ city: 'Campinas', stateCode: 'SP', ibgeCode: '3509502' })}>
      Escolher Campinas
    </button>
  ),
}))

const catalog = {
  categories: [{ id: 'maintenance', name: 'Manutenção', active: true, order: 1 }],
  specialties: [{ id: 'electrician', categoryId: 'maintenance', name: 'Eletricista', active: true, order: 1 }],
}

const profileState = {
  profile: {
    userId: 'client-owner',
    name: 'Cliente Exemplo',
    email: 'client@example.com',
    roles: ['client'],
    activeMode: 'client',
    professionalProfileStatus: 'not-started',
  },
  clientProfile: { userId: 'client-owner', phone: '', profileImage: null },
  clientProfileReadiness: { isComplete: true, missingFields: [] },
}

const recoveredDetails: OwnServiceRequestDetails = {
  request: {
    requestId: 'request-operation-key-000001',
    operationKey: 'request-operation-key-000001',
    clientId: 'client-owner',
    categoryId: 'maintenance',
    specialtyId: 'electrician',
    cityIbgeCode: '3509502',
    serviceDate: '2026-11-10',
    period: 'MORNING',
    periodStartAt: new Date('2026-11-10T11:00:00Z'),
    acceptUntil: new Date('2026-11-20T10:30:00Z'),
    status: 'OPEN',
    round: 1,
    currentRoundId: 'round-1',
    assignedProfessionalId: null,
    currentAssignmentId: null,
    reopenReason: null,
    excludedProfessionalIds: [],
  },
  privateData: {
    requestId: 'request-operation-key-000001',
    operationKey: 'request-operation-key-000001',
    clientId: 'client-owner',
    contactName: 'Cliente Exemplo',
    contactPhone: '',
    notes: 'Duas tomadas pararam de funcionar.',
    address: {
      street: 'Rua das Flores',
      number: '100',
      complement: '',
      neighborhood: 'Centro',
      city: 'Campinas',
      stateCode: 'SP',
      postalCode: '13000000',
      ibgeCode: '3509502',
    },
  },
}

function renderPage(path = '/cliente/solicitar?specialty=electrician') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ServiceRequestPage />
    </MemoryRouter>,
  )
}

async function fillForm() {
  const user = userEvent.setup()
  await waitFor(() => expect(screen.getByLabelText('Especialidade *')).toHaveValue('electrician'))
  await user.type(screen.getByLabelText('Descreva o que precisa *'), 'Duas tomadas pararam de funcionar.')
  await user.selectOptions(screen.getByLabelText('UF *'), 'SP')
  await user.click(screen.getByRole('button', { name: 'Escolher Campinas' }))
  await user.type(screen.getByLabelText('Logradouro *'), 'Rua das Flores')
  await user.type(screen.getByLabelText('Número *'), '100')
  await user.type(screen.getByLabelText('Bairro *'), 'Centro')
  await user.type(screen.getByLabelText('CEP *'), '13000000')
  await user.type(screen.getByLabelText('Data *'), '2026-11-10')
  await user.click(screen.getByLabelText(/Manhã/))
  return user
}

describe('ServiceRequestPage', { timeout: 10_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ownDetailsSubscriptions.length = 0
    localStorage.clear()
    mocks.useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'client-owner' } })
    mocks.useProfile.mockReturnValue(profileState)
    mocks.useCatalog.mockReturnValue({ status: 'ready', catalog, error: null, retry: vi.fn() })
    mocks.createRequest.mockResolvedValue({
      idempotent: false,
      request: {
        requestId: 'request-operation-key-000001',
        operationKey: 'request-operation-key-000001',
        clientId: 'client-owner',
        categoryId: 'maintenance',
        specialtyId: 'electrician',
        cityIbgeCode: '3509502',
        serviceDate: '2026-11-10',
        period: 'MORNING',
        periodStartAt: new Date(),
        acceptUntil: new Date('2026-11-20T10:30:00Z'),
        status: 'OPEN',
        round: 1,
        currentRoundId: 'round-1',
        assignedProfessionalId: null,
        currentAssignmentId: null,
        reopenReason: null,
        excludedProfessionalIds: [],
      },
    })
    mocks.getOwnRequestDetails.mockResolvedValue(recoveredDetails)
    mocks.updateOwnRequest.mockResolvedValue({
      idempotent: false,
      request: { ...recoveredDetails.request, round: 2, currentRoundId: 'round-2' },
    })
    mocks.cancelOwnRequest.mockResolvedValue({
      idempotent: false,
      request: {
        requestId: 'request-operation-key-000001',
        serviceDate: '2026-11-10',
        period: 'MORNING',
        status: 'CANCELLED',
      },
    })
  })

  it('valida a especialidade da query pelo catálogo e envia um período', async () => {
    renderPage()
    const user = await fillForm()
    await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }))

    await waitFor(() => expect(mocks.createRequest).toHaveBeenCalledOnce())
    expect(mocks.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      specialtyId: 'electrician',
      cityIbgeCode: '3509502',
      period: 'MORNING',
      contactPhone: '',
    }))
    expect(await screen.findByRole('heading', { name: 'Procurando profissional' })).toBeInTheDocument()
  })

  it('preserva os campos em falha e permite nova tentativa com a mesma chave', async () => {
    const successfulResult = {
      idempotent: true,
      request: {
        requestId: 'request-operation-key-000001', operationKey: 'request-operation-key-000001',
        clientId: 'client-owner', categoryId: 'maintenance', specialtyId: 'electrician', cityIbgeCode: '3509502',
        serviceDate: '2026-11-10', period: 'MORNING', periodStartAt: new Date(), acceptUntil: new Date('2026-11-20T10:30:00Z'), status: 'OPEN',
        round: 1, currentRoundId: 'round-1', assignedProfessionalId: null, currentAssignmentId: null,
        reopenReason: null, excludedProfessionalIds: [],
      },
    }
    mocks.createRequest.mockRejectedValueOnce(new Error('Conexão interrompida.')).mockResolvedValueOnce(successfulResult)
    renderPage()
    const user = await fillForm()

    await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida.')
    expect(screen.getByLabelText('Descreva o que precisa *')).toHaveValue('Duas tomadas pararam de funcionar.')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }))

    await screen.findByRole('heading', { name: 'Procurando profissional' })
    const firstKey = mocks.createRequest.mock.calls[0][0].operationKey
    expect(mocks.createRequest.mock.calls[1][0].operationKey).toBe(firstKey)
  })

  it('recupera uma solicitação confirmada pela URL após recarga', async () => {
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    expect(await screen.findByRole('heading', { name: 'Procurando profissional' })).toBeInTheDocument()
    expect(mocks.getOwnRequestDetails).toHaveBeenCalledWith('request-operation-key-000001')
  })

  it('reflete o início do atendimento recebido pelo listener em tempo real', async () => {
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')
    await screen.findByRole('heading', { name: 'Procurando profissional' })

    act(() => {
      mocks.ownDetailsSubscriptions[0].onDetails({
        details: {
          ...recoveredDetails,
          request: { ...recoveredDetails.request, status: 'IN_PROGRESS' },
        },
        fromCache: false,
      })
    })

    expect(
      screen.getByRole('heading', { name: 'Atendimento iniciado' }),
    ).toBeVisible()
  })

  it('cancela somente após confirmação explícita e mostra o estado persistido', async () => {
    const user = userEvent.setup()
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    await user.click(await screen.findByRole('button', { name: 'Cancelar solicitação' }))
    expect(mocks.cancelOwnRequest).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await screen.findByRole('heading', { name: 'Solicitação cancelada' })).toBeInTheDocument()
    expect(mocks.cancelOwnRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-operation-key-000001',
      expectedRound: 1,
      expectedAssignmentId: null,
    }))
  })

  it('reutiliza o formulário para editar e inicia a nova rodada somente após o commit', async () => {
    const user = userEvent.setup()
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    await user.click(await screen.findByRole('button', { name: 'Editar solicitação' }))
    expect(screen.getByLabelText('Descreva o que precisa *')).toHaveValue(
      'Duas tomadas pararam de funcionar.',
    )
    await user.clear(screen.getByLabelText('Descreva o que precisa *'))
    await user.type(
      screen.getByLabelText('Descreva o que precisa *'),
      'Agora são três tomadas sem energia.',
    )
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(mocks.updateOwnRequest).toHaveBeenCalledOnce())
    expect(mocks.updateOwnRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-operation-key-000001',
      expectedRound: 1,
      description: 'Agora são três tomadas sem energia.',
    }))
    expect(await screen.findByRole('heading', { name: 'Procurando profissional' })).toBeInTheDocument()
  })

  it('preserva o rascunho e relê o pedido quando um aceite vence a edição', async () => {
    mocks.updateOwnRequest.mockRejectedValueOnce(
      new ServiceRequestError('round-changed', 'A solicitação mudou.'),
    )
    mocks.getOwnRequestDetails
      .mockResolvedValueOnce(recoveredDetails)
      .mockResolvedValueOnce({
        ...recoveredDetails,
        request: {
          ...recoveredDetails.request,
          status: 'ASSIGNED',
          assignedProfessionalId: 'professional-a',
          currentAssignmentId: 'round-1',
        },
      })
    const user = userEvent.setup()
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')
    await user.click(await screen.findByRole('button', { name: 'Editar solicitação' }))
    await user.clear(screen.getByLabelText('Descreva o que precisa *'))
    await user.type(
      screen.getByLabelText('Descreva o que precisa *'),
      'Alteração que não pode ser perdida no conflito.',
    )
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText('O pedido mudou enquanto você editava')).toBeInTheDocument()
    expect(screen.getByLabelText('Descreva o que precisa *')).toHaveValue(
      'Alteração que não pode ser perdida no conflito.',
    )
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('permite confirmar o cancelamento de um pedido atribuído sem oferecer edição', async () => {
    mocks.getOwnRequestDetails.mockResolvedValueOnce({
      ...recoveredDetails,
      request: {
        ...recoveredDetails.request,
        status: 'ASSIGNED',
        assignedProfessionalId: 'professional-a',
        currentAssignmentId: 'round-1',
      },
    })
    const user = userEvent.setup()
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    expect(await screen.findByRole('heading', { name: 'Profissional confirmado' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar solicitação' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar solicitação' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(mocks.cancelOwnRequest).toHaveBeenCalledWith(expect.objectContaining({
      expectedRound: 1,
      expectedAssignmentId: 'round-1',
    }))
  })

  it('mantém pedido vencido visível como pendência sem criar estado EXPIRED', async () => {
    mocks.getOwnRequestDetails.mockResolvedValueOnce({
      ...recoveredDetails,
      request: {
        ...recoveredDetails.request,
        acceptUntil: new Date('2026-11-01T10:30:00Z'),
      },
    })
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    expect(await screen.findByRole('heading', { name: 'Pedido pendente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar solicitação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar solicitação' })).toBeInTheDocument()
  })

  it('mostra procura de substituto somente enquanto novos aceites são permitidos', async () => {
    mocks.getOwnRequestDetails.mockResolvedValueOnce({
      ...recoveredDetails,
      request: {
        ...recoveredDetails.request,
        reopenReason: 'PROFESSIONAL_CANCELLATION',
        round: 2,
        currentRoundId: 'round-2',
      },
    })
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    expect(await screen.findByRole('heading', { name: 'Procurando substituto' })).toBeInTheDocument()
    expect(screen.getByText(/depende de um novo aceite válido/i)).toBeInTheDocument()
  })

  it('sinaliza intervenção quando o cancelamento profissional ocorre após o corte de aceite', async () => {
    mocks.getOwnRequestDetails.mockResolvedValueOnce({
      ...recoveredDetails,
      request: {
        ...recoveredDetails.request,
        reopenReason: 'PROFESSIONAL_CANCELLATION',
        round: 2,
        currentRoundId: 'round-2',
        acceptUntil: new Date('2026-11-01T10:30:00Z'),
      },
    })
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    expect(await screen.findByRole('heading', { name: 'Substituição pendente' })).toBeInTheDocument()
    expect(screen.getByText(/intervenção ou reagendamento/i)).toBeInTheDocument()
  })

  it('recusa uma especialidade inexistente sem perder o formulário', async () => {
    renderPage('/cliente/solicitar?specialty=removed')
    expect(await screen.findByText(/não está mais disponível/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qual serviço você precisa?' })).toBeInTheDocument()
  })
})
