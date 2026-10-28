import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PROFESSIONAL_SUPPORT_WHATSAPP,
  PROFESSIONAL_SUPPORT_MESSAGE,
  professionalSupportUrl,
} from './professional-support'

describe('professional support configuration', () => {
  it('uses the official configured destination with only a generic message', () => {
    const url = professionalSupportUrl('+55 (12) 99170-6194')

    expect(url).toBe(
      `https://wa.me/${DEFAULT_PROFESSIONAL_SUPPORT_WHATSAPP}?text=${encodeURIComponent(PROFESSIONAL_SUPPORT_MESSAGE)}`,
    )
    expect(url).not.toMatch(/user-|uid|@|senha|cpf|rg/i)
  })

  it('does not invent a destination when support is explicitly disabled or invalid', () => {
    expect(professionalSupportUrl('')).toBeNull()
    expect(professionalSupportUrl('canal-invalido')).toBeNull()
  })
})
