import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearIbgeMunicipalityCache,
  IbgeLocalitiesError,
  listMunicipalitiesByState,
} from './ibge-localities.service'

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('IBGE localities service', () => {
  beforeEach(() => clearIbgeMunicipalityCache())

  it('normaliza municípios da API oficial e reutiliza o cache por UF', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response([
        { id: 3550308, nome: 'São Paulo' },
        { id: 3509502, nome: 'Campinas' },
      ]),
    )

    const first = await listMunicipalitiesByState('sp', {
      fetcher: fetcher as unknown as typeof fetch,
    })
    const cached = await listMunicipalitiesByState('SP', {
      fetcher: fetcher as unknown as typeof fetch,
    })

    expect(first).toEqual([
      { city: 'Campinas', stateCode: 'SP', ibgeCode: '3509502' },
      { city: 'São Paulo', stateCode: 'SP', ibgeCode: '3550308' },
    ])
    expect(cached).toBe(first)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/estados/SP/municipios?orderBy=nome'),
      { headers: { Accept: 'application/json' } },
    )
  })

  it('remove falhas do cache para permitir nova tentativa', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response([{ id: 3304557, nome: 'Rio de Janeiro' }]))

    await expect(
      listMunicipalitiesByState('RJ', {
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(IbgeLocalitiesError)
    await expect(
      listMunicipalitiesByState('RJ', {
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).resolves.toEqual([
      { city: 'Rio de Janeiro', stateCode: 'RJ', ibgeCode: '3304557' },
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejeita UF e payload inválidos', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ municipios: [] }))

    await expect(
      listMunicipalitiesByState('XX', {
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ message: 'Selecione uma UF válida.' })
    await expect(
      listMunicipalitiesByState('SC', {
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ message: 'O IBGE retornou uma resposta inválida.' })
  })
})
