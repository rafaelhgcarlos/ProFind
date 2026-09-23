import { describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '../features/onboarding/user-role'
import type { ClientProfile } from '../types/client-profile'
import {
  clientLandingRoute,
  deriveClientProfileReadiness,
  loadClientProfileEditor,
  loadClientProfileState,
  saveClientProfile,
  type ClientProfileDependencies,
} from './client-profile.service'

const user: UserProfile = {
  userId: 'client-123',
  name: 'Marina Souza',
  email: 'marina@example.com',
  roles: ['client'],
  activeMode: 'client',
  professionalProfileStatus: 'not-started',
}

const clientProfile: ClientProfile = {
  userId: user.userId,
  phone: '11999998888',
  profileImage: null,
}

function dependencies(
  profile: ClientProfile | null = clientProfile,
): ClientProfileDependencies {
  return {
    findUser: vi.fn().mockResolvedValue(user),
    findClientProfile: vi.fn().mockResolvedValue(profile),
    saveClientProfile: vi.fn().mockResolvedValue(undefined),
  }
}

describe('clientProfileService', () => {
  it('deriva a prontidão sem depender de um campo editável', () => {
    expect(deriveClientProfileReadiness(user, null)).toEqual({
      isComplete: false,
      missingFields: ['clientProfile'],
    })
    expect(
      deriveClientProfileReadiness({ name: ' ' }, clientProfile),
    ).toEqual({ isComplete: false, missingFields: ['name'] })
    expect(deriveClientProfileReadiness(user, clientProfile)).toEqual({
      isComplete: true,
      missingFields: [],
    })
  })

  it('direciona somente clientes prontos para o dashboard', () => {
    expect(clientLandingRoute({ isComplete: false, missingFields: ['name'] })).toBe(
      '/cliente/perfil',
    )
    expect(clientLandingRoute({ isComplete: true, missingFields: [] })).toBe(
      '/cliente',
    )
  })

  it('carrega perfil existente sem duplicar o e-mail no documento do cliente', async () => {
    const deps = dependencies()
    await expect(loadClientProfileEditor(user.userId, deps)).resolves.toEqual({
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: clientProfile.phone,
      profileImage: null,
      exists: true,
    })
    expect(deps.findUser).toHaveBeenCalledWith(user.userId)
    expect(deps.findClientProfile).toHaveBeenCalledWith(user.userId)
  })

  it('representa criação idempotente quando o documento específico ainda não existe', async () => {
    const deps = dependencies(null)
    const editor = await loadClientProfileEditor(user.userId, deps)
    const saved = await saveClientProfile(
      editor,
      { name: '  Marina   Souza  ', phone: '(11) 99999-8888', profileImage: null },
      deps,
    )

    expect(deps.saveClientProfile).toHaveBeenCalledWith({
      userId: user.userId,
      profile: {
        name: 'Marina Souza',
        phone: '11999998888',
        profileImage: null,
      },
      exists: false,
    })
    expect(saved.exists).toBe(true)
  })

  it('mantém telefone e foto opcionais fora dos bloqueios de prontidão', async () => {
    const deps = dependencies({ ...clientProfile, phone: '', profileImage: null })
    await expect(loadClientProfileState(user, deps)).resolves.toEqual({
      profile: { ...clientProfile, phone: '', profileImage: null },
      readiness: { isComplete: true, missingFields: [] },
    })
  })

  it('bloqueia papéis não autorizados e referências de outra finalidade', async () => {
    const deps = dependencies(null)
    deps.findUser = vi.fn().mockResolvedValue({
      ...user,
      roles: ['professional'],
      activeMode: 'professional',
    })
    await expect(loadClientProfileEditor(user.userId, deps)).rejects.toMatchObject({
      code: 'not-authorized',
    })

    await expect(
      saveClientProfile(
        {
          userId: user.userId,
          name: user.name,
          email: user.email,
          phone: '',
          profileImage: null,
          exists: false,
        },
        {
          name: user.name,
          phone: '',
          profileImage: {
            provider: 'IMAGEKIT',
            ownerId: user.userId,
            purpose: 'PROFESSIONAL_AVATAR',
            url: 'https://images.example/avatar.webp',
            providerId: 'avatar-1',
            createdAt: 1,
            updatedAt: 1,
          },
        },
        dependencies(null),
      ),
    ).rejects.toMatchObject({ code: 'validation' })
  })

  it('traduz indisponibilidade e preserva uma mensagem recuperável', async () => {
    const deps = dependencies()
    deps.findClientProfile = vi.fn().mockRejectedValue({
      code: 'firestore/unavailable',
    })
    await expect(loadClientProfileState(user, deps)).rejects.toMatchObject({
      code: 'network-error',
      message: expect.stringMatching(/conexão/i),
    })
  })

  it('impede persistir preview blob ou timestamps inválidos como avatar', async () => {
    const deps = dependencies(null)
    const baseEditor = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: '',
      profileImage: null,
      exists: false,
    }
    await expect(
      saveClientProfile(
        baseEditor,
        {
          name: user.name,
          phone: '',
          profileImage: {
            provider: 'IMAGEKIT',
            ownerId: user.userId,
            purpose: 'CLIENT_AVATAR',
            url: 'blob:local-preview',
            providerId: 'client-avatar-1',
            createdAt: 100,
            updatedAt: 100,
          },
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      saveClientProfile(
        baseEditor,
        {
          name: user.name,
          phone: '',
          profileImage: {
            provider: 'IMAGEKIT',
            ownerId: user.userId,
            purpose: 'CLIENT_AVATAR',
            url: 'https://images.example/client.webp',
            providerId: 'client-avatar-1',
            createdAt: 200,
            updatedAt: 100,
          },
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(deps.saveClientProfile).not.toHaveBeenCalled()
  })
})
