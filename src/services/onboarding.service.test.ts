import { describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '../features/onboarding/user-role'
import {
  completeOnboarding,
  enableAdditionalRole,
  loadUserProfile,
  switchActiveMode,
  type OnboardingDependencies,
} from './onboarding.service'

const baseProfile: UserProfile = {
  userId: 'user-123',
  name: 'Marina Souza',
  email: 'marina@example.com',
  roles: [],
  activeMode: null,
  professionalProfileStatus: 'not-started',
}

function createDependencies(profile: UserProfile | null = baseProfile) {
  return {
    findUser: vi.fn().mockResolvedValue(profile),
    configureRoles: vi.fn().mockResolvedValue(undefined),
    updateActiveMode: vi.fn().mockResolvedValue(undefined),
    addGrantedRole: vi.fn().mockResolvedValue(undefined),
  } satisfies OnboardingDependencies
}

describe('onboardingService', () => {
  it('habilita Cliente e Profissional na mesma identidade', async () => {
    const dependencies = createDependencies()

    await expect(
      completeOnboarding('user-123', 'both', dependencies),
    ).resolves.toEqual({
      ...baseProfile,
      roles: ['client', 'professional'],
      activeMode: 'client',
    })
    expect(dependencies.configureRoles).toHaveBeenCalledWith(
      'user-123',
      ['client', 'professional'],
      'client',
    )
  })

  it('inicia diretamente no modo Profissional quando essa é a escolha', async () => {
    const dependencies = createDependencies()

    const result = await completeOnboarding(
      'user-123',
      'professional',
      dependencies,
    )

    expect(result.roles).toEqual(['professional'])
    expect(result.activeMode).toBe('professional')
  })

  it('bloqueia escolhas fora das opções habilitadas', async () => {
    const dependencies = createDependencies()

    await expect(
      completeOnboarding(
        'user-123',
        'company' as never,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'invalid-choice' })
    expect(dependencies.configureRoles).not.toHaveBeenCalled()
  })

  it('não sobrescreve papéis de uma conta já configurada', async () => {
    const dependencies = createDependencies({
      ...baseProfile,
      roles: ['client'],
      activeMode: 'client',
    })

    await expect(
      completeOnboarding('user-123', 'professional', dependencies),
    ).rejects.toMatchObject({ code: 'invalid-choice' })
    expect(dependencies.configureRoles).not.toHaveBeenCalled()
  })

  it('alterna somente para um papel já pertencente à mesma conta', async () => {
    const dependencies = createDependencies()
    const profile: UserProfile = {
      ...baseProfile,
      roles: ['client', 'professional'],
      activeMode: 'client',
    }

    await expect(
      switchActiveMode(profile, 'professional', dependencies),
    ).resolves.toEqual({ ...profile, activeMode: 'professional' })
    expect(dependencies.updateActiveMode).toHaveBeenCalledWith(
      'user-123',
      'professional',
    )
    expect(dependencies.configureRoles).not.toHaveBeenCalled()
  })

  it('bloqueia um modo que não pertence à conta antes de gravar', async () => {
    const dependencies = createDependencies()
    const profile: UserProfile = {
      ...baseProfile,
      roles: ['client'],
      activeMode: 'client',
    }

    await expect(
      switchActiveMode(profile, 'professional', dependencies),
    ).rejects.toMatchObject({ code: 'invalid-mode' })
    expect(dependencies.updateActiveMode).not.toHaveBeenCalled()
  })

  it('diferencia perfil ausente de indisponibilidade de rede', async () => {
    await expect(
      loadUserProfile('user-123', createDependencies(null)),
    ).rejects.toMatchObject({ code: 'profile-not-found' })

    const dependencies = createDependencies()
    dependencies.findUser.mockRejectedValue({ code: 'firestore/unavailable' })
    await expect(loadUserProfile('user-123', dependencies)).rejects.toMatchObject({
      code: 'network-error',
      message: expect.stringMatching(/conexão/i),
    })
  })

  it('prepara a adição validada de um novo papel sem alterar o modo ou o perfil profissional', async () => {
    const dependencies = createDependencies()
    const profile: UserProfile = {
      ...baseProfile,
      roles: ['client'],
      activeMode: 'client',
    }

    await expect(
      enableAdditionalRole(profile, 'professional', dependencies),
    ).resolves.toEqual({
      ...profile,
      roles: ['client', 'professional'],
      activeMode: 'client',
      professionalProfileStatus: 'not-started',
    })
    expect(dependencies.addGrantedRole).toHaveBeenCalledWith(
      'user-123',
      ['client', 'professional'],
    )
    expect(dependencies.updateActiveMode).not.toHaveBeenCalled()
  })

  it('traduz a ausência de grant em bloqueio explícito da habilitação', async () => {
    const dependencies = createDependencies()
    dependencies.addGrantedRole.mockRejectedValue({
      code: 'firestore/permission-denied',
    })
    const profile: UserProfile = {
      ...baseProfile,
      roles: ['professional'],
      activeMode: 'professional',
    }

    await expect(
      enableAdditionalRole(profile, 'client', dependencies),
    ).rejects.toMatchObject({ code: 'role-enable-not-authorized' })
  })
})
