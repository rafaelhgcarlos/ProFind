import { describe, expect, it, vi } from 'vitest'

import {
  registerAccount,
  type RegistrationDependencies,
  type RegistrationInput,
} from './registration.service'
import { CURRENT_LEGAL_ACCEPTANCE } from '../features/legal/legal-documents'

const validInput: RegistrationInput = {
  name: '  Marina Souza  ',
  email: '  MARINA@EXAMPLE.COM ',
  password: 'senha-segura',
  legalAcceptance: CURRENT_LEGAL_ACCEPTANCE,
}

function createDependencies() {
  const rollback = vi.fn().mockResolvedValue(undefined)
  const dependencies: RegistrationDependencies = {
    createIdentity: vi.fn().mockResolvedValue({
      userId: 'user-123',
      email: 'marina@example.com',
      rollback,
    }),
    createUserDocument: vi.fn().mockResolvedValue(undefined),
  }

  return { dependencies, rollback }
}

describe('registerAccount', () => {
  it('cria a identidade e o documento base com dados normalizados', async () => {
    const { dependencies, rollback } = createDependencies()

    await expect(registerAccount(validInput, dependencies)).resolves.toEqual({
      userId: 'user-123',
      email: 'marina@example.com',
    })
    expect(dependencies.createIdentity).toHaveBeenCalledWith(
      'marina@example.com',
      'senha-segura',
    )
    expect(dependencies.createUserDocument).toHaveBeenCalledWith({
      userId: 'user-123',
      name: 'Marina Souza',
      email: 'marina@example.com',
      termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
      privacyPolicyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyPolicyVersion,
    })
    expect(rollback).not.toHaveBeenCalled()
  })

  it('não cria identidade sem o aceite legal', async () => {
    const { dependencies } = createDependencies()

    await expect(
      registerAccount({ ...validInput, legalAcceptance: undefined }, dependencies),
    ).rejects.toMatchObject({ code: 'legal-acceptance-required' })
    expect(dependencies.createIdentity).not.toHaveBeenCalled()
  })

  it('não aceita versões jurídicas desatualizadas', async () => {
    const { dependencies } = createDependencies()

    await expect(
      registerAccount(
        {
          ...validInput,
          legalAcceptance: {
            ...CURRENT_LEGAL_ACCEPTANCE,
            termsVersion: '0.9.0',
          },
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'legal-acceptance-required' })
    expect(dependencies.createIdentity).not.toHaveBeenCalled()
  })

  it('orienta login ou recuperação quando o e-mail já está cadastrado', async () => {
    const { dependencies } = createDependencies()
    vi.mocked(dependencies.createIdentity).mockRejectedValue({
      code: 'auth/email-already-in-use',
    })

    await expect(registerAccount(validInput, dependencies)).rejects.toMatchObject({
      code: 'email-already-in-use',
      message: expect.stringMatching(/entre na sua conta.*recuperação de senha/i),
    })
    expect(dependencies.createUserDocument).not.toHaveBeenCalled()
  })

  it('remove a identidade quando a criação do documento falha', async () => {
    const { dependencies, rollback } = createDependencies()
    vi.mocked(dependencies.createUserDocument).mockRejectedValue(
      new Error('Firestore indisponível'),
    )

    await expect(registerAccount(validInput, dependencies)).rejects.toMatchObject({
      code: 'profile-creation-failed',
      message: expect.stringMatching(/nenhuma conta foi mantida/i),
    })
    expect(rollback).toHaveBeenCalledOnce()
  })

  it('diferencia uma recusa das regras do Firestore', async () => {
    const { dependencies, rollback } = createDependencies()
    vi.mocked(dependencies.createUserDocument).mockRejectedValue({
      code: 'permission-denied',
    })

    await expect(registerAccount(validInput, dependencies)).rejects.toMatchObject({
      code: 'profile-creation-failed',
      message: expect.stringMatching(/recusou a gravação.*configuração de acesso/i),
    })
    expect(rollback).toHaveBeenCalledOnce()
  })

  it('expõe uma falha parcial tratável quando o rollback também falha', async () => {
    const { dependencies, rollback } = createDependencies()
    vi.mocked(dependencies.createUserDocument).mockRejectedValue(
      new Error('Firestore indisponível'),
    )
    rollback.mockRejectedValue(new Error('Auth indisponível'))

    await expect(registerAccount(validInput, dependencies)).rejects.toMatchObject({
      code: 'partial-failure',
      message: expect.stringMatching(/não crie outra conta/i),
    })
    expect(rollback).toHaveBeenCalledOnce()
  })
})
