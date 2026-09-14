import { describe, expect, it } from 'vitest'

import {
  hasCompletedOnboarding,
  hasPublicableProfessionalProfile,
  initialModeForChoice,
  rolesForChoice,
  type UserProfile,
} from './user-role'

describe('configuração de papéis', () => {
  it('mapeia as três escolhas permitidas sem criar outra identidade', () => {
    expect(rolesForChoice('client')).toEqual(['client'])
    expect(rolesForChoice('professional')).toEqual(['professional'])
    expect(rolesForChoice('both')).toEqual(['client', 'professional'])
    expect(initialModeForChoice('both')).toBe('client')
  })

  it('considera incompleta uma configuração cujo modo não pertence aos papéis', () => {
    const profile: UserProfile = {
      userId: 'user-123',
      name: 'Marina',
      email: 'marina@example.com',
      roles: ['client'],
      activeMode: 'professional',
      professionalProfileStatus: 'not-started',
    }

    expect(hasCompletedOnboarding(profile)).toBe(false)
  })

  it('não confunde papel Profissional com perfil profissional publicável', () => {
    const profile: UserProfile = {
      userId: 'user-123',
      name: 'Marina',
      email: 'marina@example.com',
      roles: ['professional'],
      activeMode: 'professional',
      professionalProfileStatus: 'not-started',
    }

    expect(hasCompletedOnboarding(profile)).toBe(true)
    expect(hasPublicableProfessionalProfile(profile)).toBe(false)
    expect(
      hasPublicableProfessionalProfile({
        ...profile,
        professionalProfileStatus: 'complete',
      }),
    ).toBe(true)
  })
})
