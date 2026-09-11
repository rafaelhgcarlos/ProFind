import { describe, expect, it } from 'vitest'

import { normalizeAuthenticationError } from './auth-errors'

describe('normalizeAuthenticationError', () => {
  it.each([
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-email',
  ])('usa mensagem genérica para %s', (code) => {
    expect(normalizeAuthenticationError({ code })).toMatchObject({
      code: 'invalid-credentials',
      message: 'E-mail ou senha inválidos.',
    })
  })

  it('identifica uma conta desativada sem liberar o acesso', () => {
    expect(normalizeAuthenticationError({ code: 'auth/user-disabled' })).toMatchObject({
      code: 'account-disabled',
      message: expect.stringMatching(/conta está desativada/i),
    })
  })

  it('identifica uma sessão expirada', () => {
    expect(normalizeAuthenticationError({ code: 'auth/user-token-expired' })).toMatchObject({
      code: 'session-expired',
      message: expect.stringMatching(/sessão expirou/i),
    })
  })
})
