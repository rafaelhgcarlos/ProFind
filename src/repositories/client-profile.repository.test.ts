import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  firestore: { name: 'firestore' },
  timestamp: { type: 'server-timestamp' },
  getDoc: vi.fn(),
  doc: vi.fn((_firestore, collection: string, id: string) => ({
    path: `${collection}/${id}`,
  })),
  serverTimestamp: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn(),
  writeBatch: vi.fn(),
  getFirebaseFirestore: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  serverTimestamp: mocks.serverTimestamp,
  writeBatch: mocks.writeBatch,
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseFirestore: mocks.getFirebaseFirestore,
}))

import { clientProfileRepository } from './client-profile.repository'

const avatar = {
  provider: 'IMAGEKIT' as const,
  ownerId: 'client-123',
  purpose: 'CLIENT_AVATAR' as const,
  url: 'https://images.example/client.webp',
  providerId: 'client-avatar-1',
  createdAt: 100,
  updatedAt: 100,
}

describe('clientProfileRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getFirebaseFirestore.mockReturnValue(mocks.firestore)
    mocks.serverTimestamp.mockReturnValue(mocks.timestamp)
    mocks.commit.mockResolvedValue(undefined)
    mocks.writeBatch.mockReturnValue({
      set: mocks.set,
      update: mocks.update,
      commit: mocks.commit,
    })
  })

  it('lê somente telefone e referência CLIENT_AVATAR do proprietário', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ phone: '11999998888', profileImage: avatar }),
    })
    await expect(
      clientProfileRepository.findByOwnerId('client-123'),
    ).resolves.toEqual({
      userId: 'client-123',
      phone: '11999998888',
      profileImage: avatar,
    })
  })

  it('descarta metadados de imagem com finalidade incorreta', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        phone: '',
        profileImage: { ...avatar, purpose: 'PROFESSIONAL_AVATAR' },
      }),
    })
    await expect(
      clientProfileRepository.findByOwnerId('client-123'),
    ).resolves.toMatchObject({ profileImage: null })
  })

  it('descarta URL local e timestamps incompatíveis no converter', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        phone: '',
        profileImage: { ...avatar, url: 'blob:local-preview' },
      }),
    })
    await expect(
      clientProfileRepository.findByOwnerId('client-123'),
    ).resolves.toMatchObject({ profileImage: null })

    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        phone: '',
        profileImage: { ...avatar, updatedAt: { toMillis: () => 100 } },
      }),
    })
    await expect(
      clientProfileRepository.findByOwnerId('client-123'),
    ).resolves.toMatchObject({ profileImage: null })
  })

  it('cria o documento privado e atualiza somente o nome compartilhado', async () => {
    await clientProfileRepository.save({
      userId: 'client-123',
      profile: { name: 'Marina Souza', phone: '', profileImage: avatar },
      exists: false,
    })

    expect(mocks.set).toHaveBeenCalledWith(
      { path: 'clientProfiles/client-123' },
      {
        ownerId: 'client-123',
        phone: '',
        profileImage: avatar,
        createdAt: mocks.timestamp,
        updatedAt: mocks.timestamp,
      },
    )
    expect(mocks.update).toHaveBeenCalledWith(
      { path: 'users/client-123' },
      { name: 'Marina Souza', updatedAt: mocks.timestamp },
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('edita o mesmo documento sem recriar a identidade', async () => {
    await clientProfileRepository.save({
      userId: 'client-123',
      profile: { name: 'Marina Souza', phone: '11999998888', profileImage: null },
      exists: true,
    })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      { path: 'clientProfiles/client-123' },
      {
        ownerId: 'client-123',
        phone: '11999998888',
        profileImage: null,
        updatedAt: mocks.timestamp,
      },
    )
  })
})
