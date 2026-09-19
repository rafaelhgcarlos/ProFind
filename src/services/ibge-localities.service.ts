import {
  BRAZILIAN_STATE_CODES,
  type BrazilianStateCode,
  type ProfessionalBaseLocation,
} from '../types/professional-profile'

const IBGE_LOCALITIES_API =
  'https://servicodados.ibge.gov.br/api/v1/localidades'

export interface IbgeMunicipality {
  city: string
  stateCode: BrazilianStateCode
  ibgeCode: string
}

interface IbgeMunicipalityResponse {
  id?: unknown
  nome?: unknown
}

export class IbgeLocalitiesError extends Error {
  constructor(
    message = 'Não foi possível carregar os municípios. Tente novamente.',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'IbgeLocalitiesError'
  }
}

export interface IbgeLocalitiesDependencies {
  fetcher?: typeof fetch
}

const municipalityCache = new Map<
  BrazilianStateCode,
  Promise<IbgeMunicipality[]>
>()

function isBrazilianStateCode(value: string): value is BrazilianStateCode {
  return BRAZILIAN_STATE_CODES.includes(value as BrazilianStateCode)
}

function parseMunicipalities(
  response: unknown,
  stateCode: BrazilianStateCode,
): IbgeMunicipality[] {
  if (!Array.isArray(response)) {
    throw new IbgeLocalitiesError('O IBGE retornou uma resposta inválida.')
  }

  const municipalities = response.flatMap((item: IbgeMunicipalityResponse) => {
    if (
      typeof item?.id !== 'number' ||
      !Number.isSafeInteger(item.id) ||
      typeof item.nome !== 'string' ||
      !item.nome.trim()
    ) {
      return []
    }

    return [
      {
        city: item.nome.trim(),
        stateCode,
        ibgeCode: String(item.id),
      },
    ]
  })

  return municipalities.sort((first, second) =>
    first.city.localeCompare(second.city, 'pt-BR'),
  )
}

export async function listMunicipalitiesByState(
  stateCode: string,
  dependencies: IbgeLocalitiesDependencies = {},
): Promise<IbgeMunicipality[]> {
  const normalizedStateCode = stateCode.trim().toUpperCase()
  if (!isBrazilianStateCode(normalizedStateCode)) {
    throw new IbgeLocalitiesError('Selecione uma UF válida.')
  }

  const cached = municipalityCache.get(normalizedStateCode)
  if (cached) return cached

  const fetcher = dependencies.fetcher ?? fetch
  const request = fetcher(
    `${IBGE_LOCALITIES_API}/estados/${normalizedStateCode}/municipios?orderBy=nome`,
    { headers: { Accept: 'application/json' } },
  )
    .then(async (result) => {
      if (!result.ok) throw new IbgeLocalitiesError()
      return parseMunicipalities(await result.json(), normalizedStateCode)
    })
    .catch((error: unknown) => {
      municipalityCache.delete(normalizedStateCode)
      if (error instanceof IbgeLocalitiesError) throw error
      throw new IbgeLocalitiesError(undefined, { cause: error })
    })

  municipalityCache.set(normalizedStateCode, request)
  return request
}

export function toProfessionalBaseLocation(
  municipality: IbgeMunicipality,
): ProfessionalBaseLocation {
  return { ...municipality }
}

export function clearIbgeMunicipalityCache() {
  municipalityCache.clear()
}
