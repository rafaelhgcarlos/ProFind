import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  firestore: { name: 'firestore' },
  profileReference: { path: 'professionalProfiles/user-123' },
  userReference: { path: 'users/user-123' },
  timestamp: { type: 'server-timestamp' },
  batch: {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
  },
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
  getFirebaseFirestore: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: firebaseMocks.doc,
  getDoc: firebaseMocks.getDoc,
  serverTimestamp: firebaseMocks.serverTimestamp,
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
}

describe('professionalProfileRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firebaseMocks.getFirebaseFirestore.mockReturnValue(firebaseMocks.firestore)
    firebaseMocks.doc.mockImplementation((_firestore, collection) =>
      collection === 'professionalProfiles'
        ? firebaseMocks.profileReference
        : firebaseMocks.userReference,
    )
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
        ...profileInput,
        status: 'DRAFT',
        createdAt: firebaseMocks.timestamp,
        updatedAt: firebaseMocks.timestamp,
      },
      { merge: true },
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

  it('não envia rating ou métricas derivadas durante uma edição', async () => {
    await professionalProfileRepository.save({
      userId: 'user-123',
      profile: profileInput,
      status: 'PUBLISHED',
      exists: true,
    })

    const writtenData = firebaseMocks.batch.set.mock.calls[0][1]
    expect(writtenData).not.toHaveProperty('rating')
    expect(writtenData).not.toHaveProperty('reviewCount')
    expect(writtenData).not.toHaveProperty('completedJobsCount')
    expect(writtenData).not.toHaveProperty('createdAt')
    expect(firebaseMocks.batch.update).toHaveBeenCalledWith(
      firebaseMocks.userReference,
      expect.objectContaining({ professionalProfileStatus: 'complete' }),
    )
  })
})
