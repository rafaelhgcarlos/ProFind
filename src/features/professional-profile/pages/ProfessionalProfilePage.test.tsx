import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfessionalProfile } from '../../../types/professional-profile'
import { ProfessionalProfileError } from '../../../services/professional-profile.service'
import { PostalCodeError } from '../../../services/postal-code.service'
import { ProfessionalProfilePage } from './ProfessionalProfilePage'

const mocks = vi.hoisted(() => ({
  loadProfessionalProfile: vi.fn(),
  saveProfessionalProfile: vi.fn(),
  updateProfessionalAvailability: vi.fn(),
  lookupPostalCode: vi.fn(),
  listAvailableCatalog: vi.fn(),
  listMunicipalitiesByState: vi.fn(),
  syncProfessionalProfileStatus: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../auth/use-auth', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}))

vi.mock('../../onboarding/use-profile', () => ({
  useProfile: () => ({
    profile: { name: 'Marina Souza' },
    syncProfessionalProfileStatus: mocks.syncProfessionalProfileStatus,
  }),
}))

vi.mock('../../../services/catalog.service', () => ({
  listAvailableCatalog: mocks.listAvailableCatalog,
}))

vi.mock('../../../services/ibge-localities.service', () => ({
  listMunicipalitiesByState: mocks.listMunicipalitiesByState,
  toProfessionalBaseLocation: (municipality: unknown) => municipality,
}))

vi.mock('../../../services/postal-code.service', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('../../../services/postal-code.service')
  >()
  return {
    ...original,
    lookupPostalCode: mocks.lookupPostalCode,
  }
})

vi.mock('../../../services/professional-profile.service', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('../../../services/professional-profile.service')
  >()
  return {
    ...original,
    loadProfessionalProfile: mocks.loadProfessionalProfile,
    saveProfessionalProfile: mocks.saveProfessionalProfile,
    updateProfessionalAvailability: mocks.updateProfessionalAvailability,
  }
})

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess },
}))

const catalog = {
  categories: [
    { id: 'construction', name: 'Construção Civil', active: true, order: 10 },
  ],
  specialties: [
    { id: 'electrician', categoryId: 'construction', name: 'Eletricista', active: true, order: 10 },
  ],
}

const publishedProfile: ProfessionalProfile = {
  userId: 'user-123',
  publicName: 'Marina Souza',
  headline: 'Eletricista residencial',
  bio: 'Instalações e reparos residenciais.',
  categoryIds: ['construction'],
  specialtyIds: ['electrician'],
  experienceYears: 8,
  baseLocation: {
    city: 'Campinas',
    stateCode: 'SP',
    ibgeCode: '3509502',
  },
  serviceMode: 'RADIUS',
  serviceRadiusKm: 30,
  selectedCities: [],
  availability: 'AVAILABLE',
  phone: '11999998888',
  contactVisibility: 'PRIVATE',
  privateLocation: {
    postalCode: '13083852',
    neighborhood: 'Cidade Universitária',
  },
  status: 'PUBLISHED',
}

describe('ProfessionalProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listAvailableCatalog.mockResolvedValue(catalog)
    mocks.loadProfessionalProfile.mockResolvedValue(null)
    mocks.listMunicipalitiesByState.mockResolvedValue([
      { city: 'Campinas', stateCode: 'SP', ibgeCode: '3509502' },
    ])
    mocks.lookupPostalCode.mockResolvedValue({
      baseLocation: {
        city: 'Campinas',
        stateCode: 'SP',
        ibgeCode: '3509502',
      },
      privateLocation: {
        postalCode: '13083852',
        neighborhood: 'Cidade Universitária',
      },
    })
  })

  it('carrega o catálogo real e permite salvar um perfil incompleto como rascunho', async () => {
    mocks.saveProfessionalProfile.mockResolvedValue({
      ...publishedProfile,
      headline: '',
      bio: '',
      categoryIds: [],
      specialtyIds: [],
      experienceYears: null,
      baseLocation: { city: '', stateCode: '', ibgeCode: '' },
      serviceMode: 'CITY_ONLY',
      serviceRadiusKm: null,
      selectedCities: [],
      status: 'DRAFT',
    })
    const user = userEvent.setup()

    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    expect(await screen.findByLabelText('Nome público *')).toHaveValue('Marina Souza')
    expect(screen.getByRole('checkbox', { name: 'Construção Civil' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Eletricista' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(mocks.saveProfessionalProfile).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ publicName: 'Marina Souza', categoryIds: [] }),
      'DRAFT',
      catalog,
      null,
    )
    expect(await screen.findByText(/rascunho salvo/i)).toBeInTheDocument()
    expect(mocks.syncProfessionalProfileStatus).toHaveBeenCalledWith('incomplete')
  })

  it('apresenta erros por campo quando a publicação é inválida', async () => {
    mocks.saveProfessionalProfile.mockRejectedValue(
      new ProfessionalProfileError(
        'invalid-profile',
        'Complete os campos obrigatórios antes de publicar o perfil.',
        {
          categoryIds: 'Selecione ao menos uma categoria para publicar.',
        },
      ),
    )
    const user = userEvent.setup()

    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)
    await screen.findByLabelText('Nome público *')
    await user.click(screen.getByRole('button', { name: 'Publicar perfil' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /complete os campos obrigatórios/i,
    )
    expect(screen.getByText(/selecione ao menos uma categoria/i)).toBeInTheDocument()
  })

  it('apresenta a descrição como opcional e fora do checklist de publicação', async () => {
    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    const description = await screen.findByLabelText('Descrição')

    expect(description).not.toBeRequired()
    expect(description).toHaveAttribute('maxlength', '1200')
    expect(screen.getAllByText('Descrição')).toHaveLength(1)
  })

  it('carrega os dados para edição e oferece pausar um perfil publicado', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue(publishedProfile)

    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    expect(await screen.findByDisplayValue('Eletricista residencial')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Campinas')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'UF' })).toHaveTextContent('SP')
    expect(screen.queryByLabelText(/código IBGE/i)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '30 km' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Aceitando novos serviços' })).toBeChecked()
    expect(screen.getByText('Publicado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar perfil' })).toBeInTheDocument()
  })

  it('bloqueia a edição quando o perfil está suspenso', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue({
      ...publishedProfile,
      status: 'SUSPENDED',
    })

    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    expect(await screen.findByText('Perfil suspenso')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome público *')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /publicar perfil/i })).not.toBeInTheDocument()
  })

  it('mantém CEP e bairro em campos privados sem coletar endereço exato', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue(publishedProfile)
    mocks.saveProfessionalProfile.mockResolvedValue({
      ...publishedProfile,
      status: 'DRAFT',
    })
    const user = userEvent.setup()

    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    await user.click(
      await screen.findByRole('button', { name: 'Voltar para rascunho' }),
    )

    expect(mocks.saveProfessionalProfile).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        baseLocation: {
          city: 'Campinas',
          stateCode: 'SP',
          ibgeCode: '3509502',
        },
        privateLocation: {
          postalCode: '13083-852',
          neighborhood: 'Cidade Universitária',
        },
      }),
      'DRAFT',
      catalog,
      publishedProfile,
    )
    expect(screen.getByLabelText('CEP (privado)')).toHaveValue('13083-852')
    expect(screen.queryByLabelText(/logradouro|rua|número|complemento/i)).not.toBeInTheDocument()
  })

  it('alterna dinamicamente entre raio e atendimento somente na cidade', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    await screen.findByLabelText('Nome público *')
    expect(
      screen.queryByRole('radiogroup', { name: 'Raio aproximado' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('radio', {
        name: 'Minha cidade e regiões próximas',
      }),
    )
    expect(
      screen.getByRole('radiogroup', { name: 'Raio aproximado' }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('radio', { name: 'Somente na minha cidade' }),
    )
    expect(
      screen.queryByRole('radiogroup', { name: 'Raio aproximado' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('radio', { name: 'Atendimento remoto' }),
    ).not.toBeInTheDocument()
  })

  it('consulta o ViaCEP após oito dígitos e permite corrigir a localização', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    const postalCode = await screen.findByLabelText('CEP (privado)')
    await user.type(postalCode, '13083852')
    await user.tab()

    expect(await screen.findByText(/localização preenchida pelo CEP/i)).toBeInTheDocument()
    expect(mocks.lookupPostalCode).toHaveBeenCalledWith('13083852')
    expect(screen.getByDisplayValue('Campinas')).toBeInTheDocument()
    expect(screen.getByLabelText('Bairro (privado)')).toHaveValue(
      'Cidade Universitária',
    )
    expect(screen.getByText(/preenchimento manual/i)).toBeInTheDocument()
  })

  it('oferece nova tentativa e fallback manual quando o ViaCEP falha', async () => {
    mocks.lookupPostalCode.mockRejectedValue(
      new PostalCodeError(
        'provider-unavailable',
        'O serviço de CEP está indisponível. Tente novamente ou preencha a localização manualmente.',
      ),
    )
    const user = userEvent.setup()
    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    const postalCode = await screen.findByLabelText('CEP (privado)')
    await user.type(postalCode, '13083852')
    await user.tab()

    expect(await screen.findByText(/serviço de CEP está indisponível/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'UF' })).toBeEnabled()
    expect(screen.getByLabelText(/Município/)).toBeInTheDocument()
  })

  it('atualiza a disponibilidade sem republicar o perfil', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue(publishedProfile)
    mocks.updateProfessionalAvailability.mockResolvedValue({
      ...publishedProfile,
      availability: 'LIMITED',
    })
    const user = userEvent.setup()
    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    await user.click(
      await screen.findByRole('radio', { name: 'Agenda limitada' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Atualizar disponibilidade' }),
    )

    expect(mocks.updateProfessionalAvailability).toHaveBeenCalledWith(
      'user-123',
      'LIMITED',
      publishedProfile,
    )
    expect(mocks.saveProfessionalProfile).not.toHaveBeenCalled()
    expect(screen.getByText('Publicado')).toBeInTheDocument()
    expect(await screen.findByText(/sem alterar a publicação/i)).toBeInTheDocument()
  })

  it('exige nova escolha para um perfil legado com atendimento remoto', async () => {
    mocks.loadProfessionalProfile.mockResolvedValue({
      ...publishedProfile,
      serviceMode: null,
      serviceRadiusKm: null,
      status: 'DRAFT',
    })

    render(<MemoryRouter><ProfessionalProfilePage /></MemoryRouter>)

    expect(
      await screen.findByText('Escolha uma nova modalidade de atendimento'),
    ).toBeInTheDocument()
    const serviceModes = within(
      screen.getByRole('radiogroup', { name: 'Como você atende?' }),
    )
    expect(serviceModes.getAllByRole('radio')).toHaveLength(3)
    expect(
      serviceModes
        .getAllByRole('radio')
        .some((option) => option.getAttribute('data-state') === 'checked'),
    ).toBe(false)
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', {
        name: 'Área de atendimento: pendente',
      }),
    ).toBeInTheDocument()
  })
})
