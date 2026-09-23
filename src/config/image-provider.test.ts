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
    expect(parseImageProviderEnvironment({ MODE: 'development' })).toEqual({
      provider: 'disabled',
    })
    expect(() =>
      parseImageProviderEnvironment({
        MODE: 'production',
        VITE_IMAGE_PROVIDER: 'mock',
      }),
    ).toThrow(/mock não pode ser usado em produção/i)
  })

  it('seleciona ImageKit quando as três variáveis públicas estão configuradas', () => {
    expect(
      parseImageProviderEnvironment({
        MODE: 'development',
        VITE_IMAGEKIT_PUBLIC_KEY: 'public_test',
        VITE_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/profind/',
        VITE_IMAGEKIT_AUTH_ENDPOINT:
          'http://localhost:8787/api/imagekit/auth/',
      }),
    ).toEqual({
      provider: 'imagekit',
      imageKit: {
        publicKey: 'public_test',
        urlEndpoint: 'https://ik.imagekit.io/profind',
        authEndpoint: '/api/imagekit/auth',
      },
    })
  })

  it('recusa ImageKit incompleto e HTTP remoto', () => {
    expect(() =>
      parseImageProviderEnvironment({
        MODE: 'development',
        VITE_IMAGE_PROVIDER: 'imagekit',
        VITE_IMAGEKIT_PUBLIC_KEY: 'public_test',
      }),
    ).toThrow(/ImageKit/i)
    expect(() =>
      parseImageProviderEnvironment({
        MODE: 'development',
        VITE_IMAGE_PROVIDER: 'imagekit',
        VITE_IMAGEKIT_PUBLIC_KEY: 'public_test',
        VITE_IMAGEKIT_URL_ENDPOINT: '/unsafe-relative-endpoint',
        VITE_IMAGEKIT_AUTH_ENDPOINT:
          'http://localhost:8787/api/imagekit/auth',
      }),
    ).toThrow(/ImageKit/i)
    expect(() =>
      parseImageProviderEnvironment({
        MODE: 'production',
        VITE_IMAGE_PROVIDER: 'imagekit',
        VITE_IMAGEKIT_PUBLIC_KEY: 'public_test',
        VITE_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/profind',
        VITE_IMAGEKIT_AUTH_ENDPOINT: 'http://api.example.com/auth',
      }),
    ).toThrow(/ImageKit/i)
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
