import { describe, expect, it } from 'vitest'

import { hasActiveAdminAccess } from './admin-access.service'

describe('hasActiveAdminAccess', () => {
  it('autoriza somente o documento ativo na versão esperada', () => {
    expect(hasActiveAdminAccess({ active: true, schemaVersion: 1 })).toBe(true)
  })

  it.each([
    null,
    { active: false, schemaVersion: 1 },
    { active: true, schemaVersion: 0 },
    { active: true, schemaVersion: 2 },
  ])('falha de forma fechada para %j', (access) => {
    expect(hasActiveAdminAccess(access)).toBe(false)
  })
})
