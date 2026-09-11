import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  firestore: { name: 'firestore' },
  reference: { path: 'users/user-123' },
  timestamp: { type: 'server-timestamp' },
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  getFirebaseFirestore: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: firebaseMocks.doc,
  setDoc: firebaseMocks.setDoc,
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
    firebaseMocks.setDoc.mockResolvedValue(undefined)
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
})
