import { describe, expect, it } from 'vitest'

import { parseImageProviderEnvironment } from './image-provider'

describe('image provider configuration', () => {
  it('usa mock apenas fora de produção e desabilita por padrão em produção', () => {
    expect(parseImageProviderEnvironment({ MODE: 'test' })).toEqual({
      provider: 'mock',
    })
    expect(parseImageProviderEnvironment({ MODE: 'production' })).toEqual({
      provider: 'disabled',
    })
    expect(() =>
      parseImageProviderEnvironment({
        MODE: 'production',
        VITE_IMAGE_PROVIDER: 'mock',
      }),
    ).toThrow(/mock não pode ser usado em produção/i)
  })

  it('aceita somente endpoint relativo ou HTTPS para o backend seguro', () => {
    expect(
      parseImageProviderEnvironment({
        MODE: 'production',
        VITE_IMAGE_PROVIDER: 'backend',
        VITE_IMAGE_API_BASE_URL: '/api/media/',
      }),
    ).toEqual({ provider: 'backend', backendBaseUrl: '/api/media' })
    expect(() =>
      parseImageProviderEnvironment({
        MODE: 'production',
        VITE_IMAGE_PROVIDER: 'backend',
        VITE_IMAGE_API_BASE_URL: 'http://unsafe.example',
      }),
    ).toThrow(/rota relativa ou uma URL HTTPS/i)
  })
})
