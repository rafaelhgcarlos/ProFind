import { describe, expect, it, vi } from 'vitest'

import type { ServiceCatalog } from '../types/catalog'
import type { ProfessionalProfileInput } from '../types/professional-profile'
import {
  ProfessionalProfileError,
  saveProfessionalProfile,
  updateProfessionalAvailability,
  validateProfessionalProfile,
  type ProfessionalProfileDependencies,
} from './professional-profile.service'

const catalog: ServiceCatalog = {
  categories: [
    { id: 'construction', name: 'Construção Civil', active: true, order: 10 },
  ],
  specialties: [
    { id: 'electrician', categoryId: 'construction', name: 'Eletricista', active: true, order: 10 },
  ],
}

const emptyInput: ProfessionalProfileInput = {
  publicName: '',
  headline: '',
  bio: '',
  categoryIds: [],
  specialtyIds: [],
  experienceYears: null,
  baseLocation: { city: '', stateCode: '', ibgeCode: '' },
  serviceMode: 'CITY_ONLY',
  serviceRadiusKm: null,
  selectedCities: [],
  availability: 'AVAILABLE',
  phone: '',
  contactVisibility: 'PRIVATE',
  privateLocation: { postalCode: '' },
  profileImage: null,
  portfolioImages: [],
}

const publishableInput: ProfessionalProfileInput = {
  ...emptyInput,
  publicName: 'Marina Souza',
  bio: 'Instalações e reparos residenciais.',
  categoryIds: ['construction'],
  specialtyIds: ['electrician'],
  baseLocation: {
    city: 'Campinas',
    stateCode: 'SP',
    ibgeCode: '3509502',
  },
  serviceMode: 'RADIUS',
  serviceRadiusKm: 30,
  phone: '11999998888',
}

const imageReferenceBase = {
  ownerId: 'user-123',
  createdAt: 100,
  updatedAt: 100,
}

function dependencies(): ProfessionalProfileDependencies {
  return {
    findByOwnerId: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    updateAvailability: vi.fn().mockResolvedValue(undefined),
  }
}

describe('professional profile service', () => {
  it('permite salvar um perfil incompleto como DRAFT', async () => {
    const repository = dependencies()

    await expect(
      saveProfessionalProfile(
        'user-123',
        emptyInput,
        'DRAFT',
        catalog,
        null,
        repository,
      ),
    ).resolves.toMatchObject({ userId: 'user-123', status: 'DRAFT' })
    expect(repository.save).toHaveBeenCalledWith({
      userId: 'user-123',
      profile: emptyInput,
      status: 'DRAFT',
      exists: false,
    })
  })

  it('impede publicar um perfil incompleto e informa todos os campos ausentes', async () => {
    const repository = dependencies()

    await expect(
      saveProfessionalProfile(
        'user-123',
        emptyInput,
        'PUBLISHED',
        catalog,
        null,
        repository,
      ),
    ).rejects.toMatchObject({
      code: 'invalid-profile',
      fieldErrors: {
        publicName: expect.any(String),
        categoryIds: expect.any(String),
        specialtyIds: expect.any(String),
        baseLocation: expect.any(String),
      },
    })
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('publica um perfil completo usando apenas itens ativos do catálogo', async () => {
    const repository = dependencies()

    await expect(
      saveProfessionalProfile(
        'user-123',
        publishableInput,
        'PUBLISHED',
        catalog,
        null,
        repository,
      ),
    ).resolves.toMatchObject({ status: 'PUBLISHED' })
    expect(repository.save).toHaveBeenCalledOnce()
  })

  it('permite publicar com a descrição vazia ou ausente', async () => {
    const emptyBioRepository = dependencies()
    const missingBioRepository = dependencies()
    const inputWithoutBio = { ...publishableInput }
    delete inputWithoutBio.bio

    await expect(
      saveProfessionalProfile(
        'user-123',
        { ...publishableInput, bio: '   ' },
        'PUBLISHED',
        catalog,
        null,
        emptyBioRepository,
      ),
    ).resolves.toMatchObject({ status: 'PUBLISHED', bio: '' })
    await expect(
      saveProfessionalProfile(
        'user-123',
        inputWithoutBio,
        'PUBLISHED',
        catalog,
        null,
        missingBioRepository,
      ),
    ).resolves.toMatchObject({ status: 'PUBLISHED' })

    expect(missingBioRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.not.objectContaining({ bio: expect.anything() }),
      }),
    )
  })

  it('mantém o limite de 1.200 caracteres para a descrição preenchida', () => {
    const errors = validateProfessionalProfile(
      { ...publishableInput, bio: 'a'.repeat(1201) },
      'PUBLISHED',
      catalog,
    )

    expect(errors.bio).toMatch(/1\.200 caracteres/i)
  })

  it('normaliza e valida somente metadados de imagens', async () => {
    const repository = dependencies()
    const inputWithImages: ProfessionalProfileInput = {
      ...publishableInput,
      profileImage: {
        ...imageReferenceBase,
        purpose: 'PROFESSIONAL_AVATAR',
        url: '  https://images.example/profile.webp  ',
        providerId: '  profile-1  ',
        order: 4,
        altText: '  Profissional em atendimento  ',
      },
      portfolioImages: [
        {
          ...imageReferenceBase,
          purpose: 'PROFESSIONAL_PORTFOLIO',
          url: 'https://images.example/two.webp',
          providerId: 'portfolio-2',
          order: 9,
          altText: 'Segundo serviço',
        },
        {
          ...imageReferenceBase,
          purpose: 'PROFESSIONAL_PORTFOLIO',
          url: 'https://images.example/one.webp',
          providerId: 'portfolio-1',
          order: 8,
          altText: 'Primeiro serviço',
        },
      ],
    }

    await saveProfessionalProfile(
      'user-123',
      inputWithImages,
      'PUBLISHED',
      catalog,
      null,
      repository,
    )

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          profileImage: {
            ...imageReferenceBase,
            purpose: 'PROFESSIONAL_AVATAR',
            url: 'https://images.example/profile.webp',
            providerId: 'profile-1',
            order: 0,
            altText: 'Profissional em atendimento',
          },
          portfolioImages: [
            expect.objectContaining({ providerId: 'portfolio-2', order: 0 }),
            expect.objectContaining({ providerId: 'portfolio-1', order: 1 }),
          ],
        }),
      }),
    )
  })

  it('exige texto alternativo ao publicar e rejeita URL não HTTPS', () => {
    expect(
      validateProfessionalProfile(
        {
          ...publishableInput,
          profileImage: {
            ...imageReferenceBase,
            purpose: 'PROFESSIONAL_AVATAR',
            url: 'https://images.example/profile.webp',
            providerId: 'profile-1',
            order: 0,
            altText: '',
          },
        },
        'PUBLISHED',
        catalog,
      ),
    ).toHaveProperty('profileImage')
    expect(
      validateProfessionalProfile(
        {
          ...publishableInput,
          portfolioImages: [
            {
              ...imageReferenceBase,
              purpose: 'PROFESSIONAL_PORTFOLIO',
              url: 'data:image/webp;base64,AAAA',
              providerId: 'portfolio-1',
              order: 0,
              altText: 'Serviço concluído',
            },
          ],
        },
        'DRAFT',
        catalog,
      ),
    ).toHaveProperty('portfolioImages')
  })

  it('rejeita especialidade que não pertence à categoria selecionada', () => {
    const errors = validateProfessionalProfile(
      {
        ...publishableInput,
        categoryIds: [],
      },
      'DRAFT',
      catalog,
    )

    expect(errors.specialtyIds).toMatch(/categorias escolhidas/i)
  })

  it('valida os campos condicionais de cada modalidade de atendimento', () => {
    expect(
      validateProfessionalProfile(
        { ...publishableInput, serviceMode: 'CITY_ONLY', serviceRadiusKm: null },
        'PUBLISHED',
        catalog,
      ),
    ).not.toHaveProperty('serviceRadiusKm')
    expect(
      validateProfessionalProfile(
        { ...publishableInput, serviceMode: 'RADIUS', serviceRadiusKm: null },
        'PUBLISHED',
        catalog,
      ),
    ).toHaveProperty('serviceRadiusKm')
    expect(
      validateProfessionalProfile(
        {
          ...publishableInput,
          serviceMode: 'SELECTED_CITIES',
          serviceRadiusKm: null,
          selectedCities: [],
        },
        'PUBLISHED',
        catalog,
      ),
    ).toHaveProperty('selectedCities')
  })

  it('mantém modalidade ausente no rascunho e exige uma opção válida para publicar', () => {
    const draftErrors = validateProfessionalProfile(
      { ...publishableInput, serviceMode: null, serviceRadiusKm: null },
      'DRAFT',
      catalog,
    )
    const publicationErrors = validateProfessionalProfile(
      { ...publishableInput, serviceMode: null, serviceRadiusKm: null },
      'PUBLISHED',
      catalog,
    )

    expect(draftErrors).not.toHaveProperty('serviceMode')
    expect(publicationErrors.serviceMode).toMatch(/selecione como você atende/i)
  })

  it('rejeita REMOTE em vez de convertê-lo para outra modalidade', () => {
    const legacyRemoteInput = {
      ...publishableInput,
      serviceMode: 'REMOTE',
      serviceRadiusKm: null,
    } as unknown as ProfessionalProfileInput

    const errors = validateProfessionalProfile(
      legacyRemoteInput,
      'DRAFT',
      catalog,
    )

    expect(errors.serviceMode).toMatch(/não está disponível/i)
  })

  it('persiste municípios selecionados sem duplicatas e remove o raio', async () => {
    const repository = dependencies()
    const campinas = {
      city: 'Campinas',
      stateCode: 'SP',
      ibgeCode: '3509502',
    }

    await saveProfessionalProfile(
      'user-123',
      {
        ...publishableInput,
        serviceMode: 'SELECTED_CITIES',
        selectedCities: [campinas, { ...campinas }],
      },
      'PUBLISHED',
      catalog,
      null,
      repository,
    )

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          serviceRadiusKm: null,
          selectedCities: [campinas],
        }),
      }),
    )
  })

  it('rejeita localização livre ou código IBGE incompatível com a UF', () => {
    const invalidState = validateProfessionalProfile(
      {
        ...publishableInput,
        baseLocation: {
          city: 'Campinas, SP',
          stateCode: 'XX',
          ibgeCode: '3509502',
        },
      },
      'PUBLISHED',
      catalog,
    )
    const mismatchedIbgeCode = validateProfessionalProfile(
      {
        ...publishableInput,
        baseLocation: {
          city: 'Campinas',
          stateCode: 'RJ',
          ibgeCode: '3509502',
        },
      },
      'PUBLISHED',
      catalog,
    )

    expect(invalidState.baseLocation).toMatch(/cidade, UF e código IBGE válidos/i)
    expect(mismatchedIbgeCode.baseLocation).toMatch(/não pertence à UF/i)
  })

  it('impede alterações de um perfil suspenso', async () => {
    const repository = dependencies()

    await expect(
      saveProfessionalProfile(
        'user-123',
        publishableInput,
        'DRAFT',
        catalog,
        {
          userId: 'user-123',
          ...publishableInput,
          status: 'SUSPENDED',
        },
        repository,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ProfessionalProfileError>>({
        code: 'suspended',
      }),
    )
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('valida telefone e visibilidade antes de publicar', () => {
    const missingPhone = validateProfessionalProfile(
      { ...publishableInput, phone: '' },
      'PUBLISHED',
      catalog,
    )
    const invalidPhone = validateProfessionalProfile(
      { ...publishableInput, phone: '11999' },
      'PUBLISHED',
      catalog,
    )
    const publicWithoutPhone = validateProfessionalProfile(
      {
        ...emptyInput,
        contactVisibility: 'PUBLIC',
      },
      'DRAFT',
      catalog,
    )

    expect(missingPhone.phone).toMatch(/telefone com DDD/i)
    expect(invalidPhone.phone).toMatch(/10 ou 11 dígitos/i)
    expect(publicWithoutPhone.phone).toMatch(/antes de torná-lo público/i)
  })

  it('normaliza contato e localização privada antes de persistir', async () => {
    const repository = dependencies()

    await saveProfessionalProfile(
      'user-123',
      {
        ...publishableInput,
        phone: '(11) 99999-8888',
        privateLocation: {
          postalCode: '13083-852',
          neighborhood: '  Cidade Universitária  ',
        },
      },
      'PUBLISHED',
      catalog,
      null,
      repository,
    )

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          phone: '11999998888',
          privateLocation: {
            postalCode: '13083852',
            neighborhood: 'Cidade Universitária',
          },
        }),
      }),
    )
  })

  it('atualiza somente a disponibilidade e preserva o status publicado', async () => {
    const repository = dependencies()
    const currentProfile = {
      userId: 'user-123',
      ...publishableInput,
      status: 'PUBLISHED' as const,
    }

    await expect(
      updateProfessionalAvailability(
        'user-123',
        'LIMITED',
        currentProfile,
        repository,
      ),
    ).resolves.toMatchObject({
      availability: 'LIMITED',
      status: 'PUBLISHED',
    })
    expect(repository.updateAvailability).toHaveBeenCalledWith(
      'user-123',
      'LIMITED',
    )
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('encerra uma gravação pendente com feedback de rede', async () => {
    const repository: ProfessionalProfileDependencies = {
      ...dependencies(),
      persistenceTimeoutMs: 1,
      save: vi.fn(() => new Promise<void>(() => undefined)),
    }

    await expect(
      saveProfessionalProfile(
        'user-123',
        emptyInput,
        'DRAFT',
        catalog,
        null,
        repository,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ProfessionalProfileError>>({
        code: 'network-error',
        message: expect.stringMatching(/demorou mais que o esperado/i),
      }),
    )
  })
})
