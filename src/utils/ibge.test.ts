import { describe, expect, it } from 'vitest'

import { isIbgeMunicipalityCodeForState } from './ibge'

describe('IBGE municipality codes', () => {
  it('confere o prefixo oficial da UF sem aceitar código livre', () => {
    expect(isIbgeMunicipalityCodeForState('SP', '3509502')).toBe(true)
    expect(isIbgeMunicipalityCodeForState('RJ', '3509502')).toBe(false)
    expect(isIbgeMunicipalityCodeForState('XX', '3509502')).toBe(false)
    expect(isIbgeMunicipalityCodeForState('SP', 'campinas')).toBe(false)
  })
})
