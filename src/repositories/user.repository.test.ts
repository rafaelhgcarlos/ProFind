import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  firestore: { name: 'firestore' },
  reference: { path: 'users/user-123' },
  timestamp: { type: 'server-timestamp' },
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
  serverTimestamp: vi.fn(),
  getFirebaseFirestore: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  deleteField: firebaseMocks.deleteField,
  doc: firebaseMocks.doc,
  getDoc: firebaseMocks.getDoc,
  setDoc: firebaseMocks.setDoc,
  updateDoc: firebaseMocks.updateDoc,
  serverTimestamp: firebaseMocks.serverTimestamp,
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseFirestore: firebaseMocks.getFirebaseFirestore,
}))

import { userRepository } from './user.repository'
import { CURRENT_LEGAL_ACCEPTANCE } from '../features/legal/legal-documents'

describe('userRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firebaseMocks.getFirebaseFirestore.mockReturnValue(firebaseMocks.firestore)
    firebaseMocks.doc.mockReturnValue(firebaseMocks.reference)
    firebaseMocks.serverTimestamp.mockReturnValue(firebaseMocks.timestamp)
    firebaseMocks.deleteField.mockReturnValue({ type: 'delete-field' })
    firebaseMocks.setDoc.mockResolvedValue(undefined)
    firebaseMocks.updateDoc.mockResolvedValue(undefined)
  })

  it('cria o documento base no caminho users/{userId}', async () => {
    await userRepository.createBaseDocument({
      userId: 'user-123',
      name: 'Marina Souza',
      email: 'marina@example.com',
      termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
      privacyPolicyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyPolicyVersion,
    })

    expect(firebaseMocks.doc).toHaveBeenCalledWith(
      firebaseMocks.firestore,
      'users',
      'user-123',
    )
    expect(firebaseMocks.setDoc).toHaveBeenCalledWith(firebaseMocks.reference, {
      name: 'Marina Souza',
      email: 'marina@example.com',
      roles: [],
      activeMode: null,
      professionalProfileStatus: 'not-started',
      createdAt: firebaseMocks.timestamp,
      updatedAt: firebaseMocks.timestamp,
      legalAcceptances: {
        termsOfUse: {
          version: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
          acceptedAt: firebaseMocks.timestamp,
        },
        privacyPolicy: {
          version: CURRENT_LEGAL_ACCEPTANCE.privacyPolicyVersion,
          acceptedAt: firebaseMocks.timestamp,
        },
      },
    })
  })

  it('lê contas anteriores ao onboarding como perfil ainda não configurado', async () => {
    firebaseMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ name: 'Marina Souza', email: 'marina@example.com' }),
    })

    await expect(userRepository.findById('user-123')).resolves.toEqual({
      userId: 'user-123',
      name: 'Marina Souza',
      email: 'marina@example.com',
      roles: [],
      activeMode: null,
      professionalProfileStatus: 'not-started',
    })
  })

  it('persiste os dois papéis e o modo inicial no mesmo documento', async () => {
    await userRepository.configureRoles(
      'user-123',
      ['client', 'professional'],
      'client',
    )

    expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
      firebaseMocks.reference,
      {
        roles: ['client', 'professional'],
        activeMode: 'client',
        updatedAt: firebaseMocks.timestamp,
      },
    )
  })

  it('altera somente o modo ativo e o timestamp', async () => {
    await userRepository.updateActiveMode('user-123', 'professional')

    expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
      firebaseMocks.reference,
      {
        activeMode: 'professional',
        updatedAt: firebaseMocks.timestamp,
      },
    )
  })

  it('persiste avatar de cliente somente no escopo correto', async () => {
    const avatar = {
      ownerId: 'user-123',
      purpose: 'CLIENT_AVATAR' as const,
      url: 'https://images.example/client.webp',
      providerId: 'client-avatar-1',
      createdAt: 100,
      updatedAt: 100,
    }

    await userRepository.updateClientAvatar('user-123', avatar)

    expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
      firebaseMocks.reference,
      { clientAvatar: avatar, updatedAt: firebaseMocks.timestamp },
    )
    expect(() =>
      userRepository.updateClientAvatar('user-123', {
        ...avatar,
        purpose: 'PROFESSIONAL_AVATAR',
      }),
    ).toThrow(/não pertence ao proprietário e à finalidade/i)
  })

  it('remove somente a referência do avatar de cliente', async () => {
    await userRepository.updateClientAvatar('user-123', null)

    expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
      firebaseMocks.reference,
      {
        clientAvatar: { type: 'delete-field' },
        updatedAt: firebaseMocks.timestamp,
      },
    )
  })

  it('adiciona papéis por uma operação separada da alternância de modo', async () => {
    await userRepository.addGrantedRole(
      'user-123',
      ['client', 'professional'],
    )

    expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
      firebaseMocks.reference,
      {
        roles: ['client', 'professional'],
        updatedAt: firebaseMocks.timestamp,
      },
    )
  })
})
