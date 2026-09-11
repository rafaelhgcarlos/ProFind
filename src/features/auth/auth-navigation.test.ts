import { describe, expect, it } from 'vitest'

import { getSafeIntendedRoute, getSessionNotice, isSafeInternalPath } from './auth-navigation'

describe('navegação após autenticação', () => {
  it('preserva caminho, busca e âncora internos', () => {
    expect(getSafeIntendedRoute({ from: '/conta?origem=aviso#sessao' })).toBe(
      '/conta?origem=aviso#sessao',
    )
  })

  it.each(['//site-malicioso.example', 'https://site.example', '/entrar', '/recuperar-senha']) (
    'recusa destino inseguro ou recursivo: %s',
    (path) => {
      expect(isSafeInternalPath(path)).toBe(false)
      expect(getSafeIntendedRoute({ from: path })).toBe('/conta')
    },
  )

  it('aceita apenas avisos de sessão conhecidos', () => {
    expect(getSessionNotice({
      notice: 'Sua sessão expirou. Entre novamente para continuar.',
    })).toMatch(/sessão expirou/i)
    expect(getSessionNotice({ notice: 'mensagem arbitrária' })).toBeNull()
  })
})
