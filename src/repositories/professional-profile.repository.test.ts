import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  firestore: { name: 'firestore' },
  profileReference: { path: 'professionalProfiles/user-123' },
  privateProfileReference: { path: 'professionalPrivateProfiles/user-123' },
  userReference: { path: 'users/user-123' },
  timestamp: { type: 'server-timestamp' },
  deletedField: { type: 'delete-field' },
  batch: {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
  },
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
  getFirebaseFirestore: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  deleteField: firebaseMocks.deleteField,
  doc: firebaseMocks.doc,
  getDoc: firebaseMocks.getDoc,
  serverTimestamp: firebaseMocks.serverTimestamp,
  updateDoc: firebaseMocks.updateDoc,
  writeBatch: firebaseMocks.writeBatch,
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseFirestore: firebaseMocks.getFirebaseFirestore,
}))

import { professionalProfileRepository } from './professional-profile.repository'

const profileInput = {
  publicName: 'Marina Souza',
  headline: 'Eletricista residencial',
  bio: 'Atendimento residencial com cuidado e organização.',
  categoryIds: ['construction'],
  specialtyIds: ['electrician'],
  experienceYears: 8,
  baseLocation: {
    city: 'Campinas',
    stateCode: 'SP',
    ibgeCode: '3509502',
  },
  serviceMode: 'RADIUS' as const,
  serviceRadiusKm: 25,
  selectedCities: [],
  availability: 'AVAILABLE' as const,
  phone: '11999998888',
  contactVisibility: 'PRIVATE' as const,
  privateLocation: {
    postalCode: '13083852',
    neighborhood: 'Cidade Universitária',
  },
  profileImage: null,
  portfolioImages: [],
}

describe('professionalProfileRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firebaseMocks.getFirebaseFirestore.mockReturnValue(firebaseMocks.firestore)
    firebaseMocks.doc.mockImplementation((_firestore, collection) => {
      if (collection === 'professionalProfiles') {
        return firebaseMocks.profileReference
      }
      if (collection === 'professionalPrivateProfiles') {
        return firebaseMocks.privateProfileReference
      }
      return firebaseMocks.userReference
    })
    firebaseMocks.deleteField.mockReturnValue(firebaseMocks.deletedField)
    firebaseMocks.serverTimestamp.mockReturnValue(firebaseMocks.timestamp)
    firebaseMocks.writeBatch.mockReturnValue(firebaseMocks.batch)
    firebaseMocks.batch.commit.mockResolvedValue(undefined)
  })

  it('lê os campos do perfil e mantém métricas somente como leitura', async () => {
    firebaseMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ...profileInput,
        status: 'PUBLISHED',
        rating: 4.8,
        reviewCount: 12,
        completedJobsCount: 30,
      }),
    })

    await expect(
      professionalProfileRepository.findByOwnerId('user-123'),
    ).resolves.toEqual({
      userId: 'user-123',
      ...profileInput,
      status: 'PUBLISHED',
      rating: 4.8,
      reviewCount: 12,
      completedJobsCount: 30,
    })
  })

  it('descarta avatar profissional com URL não HTTPS ou identificador vazio', async () => {
    const invalidAvatar = {
      provider: 'IMAGEKIT',
      ownerId: 'user-123',
      purpose: 'PROFESSIONAL_AVATAR',
      url: 'blob:preview-local',
      providerId: '',
      createdAt: 100,
      updatedAt: 100,
      order: 0,
      altText: 'Prévia local',
    }
    firebaseMocks.getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ...profileInput,
          profileImage: invalidAvatar,
          status: 'DRAFT',
        }),
      })
      .mockResolvedValueOnce({ exists: () => false })

    await expect(
      professionalProfileRepository.findByOwnerId('user-123'),
    ).resolves.toMatchObject({ profileImage: null })
  })

  it('mantém o perfil público acessível durante a migração das regras privadas', async () => {
    firebaseMocks.getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ...profileInput,
          phone: undefined,
          privateLocation: undefined,
          contactVisibility: undefined,
          status: 'PUBLISHED',
        }),
      })
      .mockRejectedValueOnce({ code: 'firestore/permission-denied' })

    await expect(
      professionalProfileRepository.findByOwnerId('user-123'),
    ).resolves.toMatchObject({
      userId: 'user-123',
      phone: '',
      contactVisibility: 'PRIVATE',
      privateLocation: { postalCode: '' },
      status: 'PUBLISHED',
    })
  })

  it('cria o perfil e atualiza o resumo do usuário em um único batch', async () => {
    await professionalProfileRepository.save({
      userId: 'user-123',
      profile: profileInput,
      status: 'DRAFT',
      exists: false,
    })

    expect(firebaseMocks.batch.set).toHaveBeenCalledWith(
      firebaseMocks.profileReference,
      {
        ownerId: 'user-123',
        publicName: profileInput.publicName,
        headline: profileInput.headline,
        bio: profileInput.bio,
        categoryIds: profileInput.categoryIds,
        specialtyIds: profileInput.specialtyIds,
        experienceYears: profileInput.experienceYears,
        baseLocation: profileInput.baseLocation,
        serviceMode: profileInput.serviceMode,
        serviceRadiusKm: profileInput.serviceRadiusKm,
        selectedCities: profileInput.selectedCities,
        availability: profileInput.availability,
        contactVisibility: profileInput.contactVisibility,
        profileImage: null,
        portfolioImages: [],
        selectedCityIbgeCodes: [],
        status: 'DRAFT',
        createdAt: firebaseMocks.timestamp,
        updatedAt: firebaseMocks.timestamp,
      },
    )
    expect(firebaseMocks.batch.set).toHaveBeenCalledWith(
      firebaseMocks.privateProfileReference,
      {
        ownerId: 'user-123',
        phone: profileInput.phone,
        privateLocation: profileInput.privateLocation,
        updatedAt: firebaseMocks.timestamp,
      },
    )
    expect(firebaseMocks.batch.update).toHaveBeenCalledWith(
      firebaseMocks.userReference,
      {
        professionalProfileStatus: 'incomplete',
        updatedAt: firebaseMocks.timestamp,
      },
    )
    expect(firebaseMocks.batch.commit).toHaveBeenCalledOnce()
  })

  it('descarta uma localização legada em texto livre ao ler o perfil', async () => {
    firebaseMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ...profileInput,
        baseLocation: 'Campinas, SP',
        status: 'DRAFT',
      }),
    })

    await expect(
      professionalProfileRepository.findByOwnerId('user-123'),
    ).resolves.toMatchObject({
      baseLocation: { city: '', stateCode: '', ibgeCode: '' },
    })
  })

  it('aceita um perfil armazenado sem descrição', async () => {
    const storedProfile: Partial<typeof profileInput> = { ...profileInput }
    delete storedProfile.bio
    firebaseMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...storedProfile, status: 'PUBLISHED' }),
    })

    await expect(
      professionalProfileRepository.findByOwnerId('user-123'),
    ).resolves.toMatchObject({ bio: '' })
  })

  it('trata REMOTE legado como rascunho sem escolher outra modalidade', async () => {
    firebaseMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ...profileInput,
        serviceMode: 'REMOTE',
        status: 'PUBLISHED',
      }),
    })

    await expect(
      professionalProfileRepository.findByOwnerId('user-123'),
    ).resolves.toMatchObject({
      serviceMode: null,
      status: 'DRAFT',
    })
    expect(firebaseMocks.writeBatch).not.toHaveBeenCalled()
  })

  it('não envia rating ou métricas derivadas durante uma edição', async () => {
    await professionalProfileRepository.save({
      userId: 'user-123',
      profile: profileInput,
      status: 'PUBLISHED',
      exists: true,
    })

    expect(firebaseMocks.batch.update).toHaveBeenCalledWith(
      firebaseMocks.profileReference,
      expect.any(Object),
    )
    const profileUpdate = firebaseMocks.batch.update.mock.calls.find(
      ([reference]) => reference === firebaseMocks.profileReference,
    )
    const writtenData = profileUpdate?.[1]
    expect(writtenData).not.toHaveProperty('rating')
    expect(writtenData).not.toHaveProperty('reviewCount')
    expect(writtenData).not.toHaveProperty('completedJobsCount')
    expect(writtenData).not.toHaveProperty('createdAt')
    expect(writtenData).not.toHaveProperty('privateLocation')
    expect(writtenData).not.toHaveProperty('file')
    expect(writtenData).not.toHaveProperty('base64')
    expect(writtenData?.phone).toBe(firebaseMocks.deletedField)
    expect(firebaseMocks.batch.update).toHaveBeenCalledWith(
      firebaseMocks.userReference,
      expect.objectContaining({ professionalProfileStatus: 'complete' }),
    )
  })

  it('persiste apenas os metadados necessários das imagens', async () => {
    const imageMetadata = {
      provider: 'IMAGEKIT' as const,
      ownerId: 'user-123',
      purpose: 'PROFESSIONAL_AVATAR' as const,
      url: 'https://images.example/profile.webp',
      providerId: 'profile-1',
      createdAt: 100,
      updatedAt: 100,
      order: 0,
      altText: 'Profissional em atendimento',
    }

    await professionalProfileRepository.save({
      userId: 'user-123',
      profile: {
        ...profileInput,
        profileImage: imageMetadata,
        portfolioImages: [
          {
            ...imageMetadata,
            purpose: 'PROFESSIONAL_PORTFOLIO',
            providerId: 'portfolio-1',
          },
        ],
      },
      status: 'DRAFT',
      exists: true,
    })

    const profileUpdate = firebaseMocks.batch.update.mock.calls.find(
      ([reference]) => reference === firebaseMocks.profileReference,
    )?.[1]
    expect(profileUpdate).toMatchObject({
      profileImage: imageMetadata,
      portfolioImages: [
        {
          ...imageMetadata,
          purpose: 'PROFESSIONAL_PORTFOLIO',
          providerId: 'portfolio-1',
        },
      ],
    })
    expect(JSON.stringify(profileUpdate)).not.toMatch(/base64|data:image|"file"/i)
  })

  it('expõe o telefone no documento público somente quando autorizado', async () => {
    await professionalProfileRepository.save({
      userId: 'user-123',
      profile: { ...profileInput, contactVisibility: 'PUBLIC' },
      status: 'PUBLISHED',
      exists: true,
    })

    expect(firebaseMocks.batch.update).toHaveBeenCalledWith(
      firebaseMocks.profileReference,
      expect.objectContaining({
        phone: '11999998888',
        contactVisibility: 'PUBLIC',
      }),
    )
  })

  it('atualiza disponibilidade sem alterar status ou republicar', async () => {
    firebaseMocks.updateDoc.mockResolvedValue(undefined)

    await professionalProfileRepository.updateAvailability(
      'user-123',
      'LIMITED',
    )

    expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
      firebaseMocks.profileReference,
      {
        availability: 'LIMITED',
        updatedAt: firebaseMocks.timestamp,
      },
    )
    expect(firebaseMocks.writeBatch).not.toHaveBeenCalled()
  })
})
