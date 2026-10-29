import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceRequestPage } from './ServiceRequestPage'

const mocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  cancelOwnRequest: vi.fn(),
  getOwnRequest: vi.fn(),
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
    cancelOwnRequest: mocks.cancelOwnRequest,
    getOwnRequest: mocks.getOwnRequest,
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

describe('ServiceRequestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
        acceptUntil: new Date(),
        status: 'OPEN',
        round: 1,
        currentRoundId: 'round-1',
        assignedProfessionalId: null,
        currentAssignmentId: null,
        reopenReason: null,
        excludedProfessionalIds: [],
      },
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
        serviceDate: '2026-11-10', period: 'MORNING', periodStartAt: new Date(), acceptUntil: new Date(), status: 'OPEN',
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
    mocks.getOwnRequest.mockResolvedValue({
      requestId: 'request-operation-key-000001',
      serviceDate: '2026-11-10',
      period: 'MORNING',
      status: 'OPEN',
    })
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    expect(await screen.findByRole('heading', { name: 'Procurando profissional' })).toBeInTheDocument()
    expect(mocks.getOwnRequest).toHaveBeenCalledWith('request-operation-key-000001')
  })

  it('cancela somente após confirmação explícita e mostra o estado persistido', async () => {
    mocks.getOwnRequest.mockResolvedValue({
      requestId: 'request-operation-key-000001',
      serviceDate: '2026-11-10',
      period: 'MORNING',
      status: 'OPEN',
    })
    const user = userEvent.setup()
    renderPage('/cliente/solicitar?pedido=request-operation-key-000001')

    await user.click(await screen.findByRole('button', { name: 'Cancelar solicitação' }))
    expect(mocks.cancelOwnRequest).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await screen.findByRole('heading', { name: 'Solicitação cancelada' })).toBeInTheDocument()
    expect(mocks.cancelOwnRequest).toHaveBeenCalledWith('request-operation-key-000001')
  })

  it('recusa uma especialidade inexistente sem perder o formulário', async () => {
    renderPage('/cliente/solicitar?specialty=removed')
    expect(await screen.findByText(/não está mais disponível/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qual serviço você precisa?' })).toBeInTheDocument()
  })
})
