import { describe, expect, it, vi } from 'vitest'

import {
  formatPostalCode,
  lookupPostalCode,
  PostalCodeError,
} from './postal-code.service'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('postal code service', () => {
  it.each(['13083-852', '13083852'])(
    'consulta CEP válido com e sem máscara (%s)',
    async (postalCode) => {
      const fetcher = vi.fn().mockResolvedValue(
        response({
          cep: '13083-852',
          bairro: 'Cidade Universitária',
          localidade: 'Campinas',
          uf: 'SP',
          ibge: '3509502',
        }),
      )

      await expect(
        lookupPostalCode(postalCode, {
          fetcher: fetcher as typeof fetch,
          isOnline: () => true,
        }),
      ).resolves.toEqual({
        baseLocation: {
          city: 'Campinas',
          stateCode: 'SP',
          ibgeCode: '3509502',
        },
        privateLocation: {
          postalCode: '13083852',
          neighborhood: 'Cidade Universitária',
        },
      })
      expect(fetcher).toHaveBeenCalledWith(
        'https://viacep.com.br/ws/13083852/json/',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    },
  )

  it('aplica máscara sem aceitar mais de oito dígitos', () => {
    expect(formatPostalCode('1308385299')).toBe('13083-852')
  })

  it('não chama o provedor quando o CEP não possui oito dígitos', async () => {
    const fetcher = vi.fn()
    await expect(
      lookupPostalCode('1308-3', {
        fetcher: fetcher as typeof fetch,
        isOnline: () => true,
      }),
    ).rejects.toMatchObject({ code: 'invalid-postal-code' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('distingue CEP inexistente e resposta inválida', async () => {
    const notFound = vi.fn().mockResolvedValue(response({ erro: true }))
    const invalid = vi.fn().mockResolvedValue(
      response({ localidade: 'Campinas', uf: 'SP', ibge: '' }),
    )

    await expect(
      lookupPostalCode('13083852', {
        fetcher: notFound as typeof fetch,
        isOnline: () => true,
      }),
    ).rejects.toMatchObject({ code: 'not-found' })
    await expect(
      lookupPostalCode('13083852', {
        fetcher: invalid as typeof fetch,
        isOnline: () => true,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('distingue HTTP 400, indisponibilidade e ausência de rede', async () => {
    await expect(
      lookupPostalCode('13083852', {
        fetcher: vi.fn().mockResolvedValue(response({}, 400)) as typeof fetch,
        isOnline: () => true,
      }),
    ).rejects.toMatchObject({ code: 'invalid-postal-code' })
    await expect(
      lookupPostalCode('13083852', {
        fetcher: vi.fn().mockResolvedValue(response({}, 503)) as typeof fetch,
        isOnline: () => true,
      }),
    ).rejects.toMatchObject({ code: 'provider-unavailable' })
    await expect(
      lookupPostalCode('13083852', { isOnline: () => false }),
    ).rejects.toMatchObject({ code: 'offline' })
  })

  it('transforma timeout em erro específico e permite nova tentativa', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      }),
    )

    await expect(
      lookupPostalCode('13083852', {
        fetcher: fetcher as typeof fetch,
        timeoutMs: 1,
        isOnline: () => true,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<PostalCodeError>>({
      code: 'timeout',
    }))

    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('trata falha de rede do provedor', async () => {
    await expect(
      lookupPostalCode('13083852', {
        fetcher: vi.fn().mockRejectedValue(new TypeError('fetch failed')) as typeof fetch,
        isOnline: () => true,
      }),
    ).rejects.toMatchObject({ code: 'provider-unavailable' })
  })
})
