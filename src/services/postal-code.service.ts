import {
  BRAZILIAN_STATE_CODES,
  type BrazilianStateCode,
  type ProfessionalBaseLocation,
} from '../types/professional-profile'

const VIA_CEP_API = 'https://viacep.com.br/ws'
const DEFAULT_TIMEOUT_MS = 5_000

export type PostalCodeErrorCode =
  | 'invalid-postal-code'
  | 'not-found'
  | 'invalid-response'
  | 'timeout'
  | 'offline'
  | 'provider-unavailable'

export class PostalCodeError extends Error {
  constructor(
    public readonly code: PostalCodeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PostalCodeError'
  }
}

export interface PostalCodeResult {
  baseLocation: ProfessionalBaseLocation
  privateLocation: {
    postalCode: string
    neighborhood?: string
  }
}

export interface PostalCodeDependencies {
  fetcher?: typeof fetch
  timeoutMs?: number
  isOnline?: () => boolean
}

interface ViaCepResponse {
  cep?: unknown
  bairro?: unknown
  localidade?: unknown
  uf?: unknown
  ibge?: unknown
  erro?: unknown
}

export function normalizePostalCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function formatPostalCode(value: string) {
  const digits = normalizePostalCode(value)
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits
}

function isBrazilianStateCode(value: string): value is BrazilianStateCode {
  return BRAZILIAN_STATE_CODES.includes(value as BrazilianStateCode)
}

function invalidResponse(): PostalCodeError {
  return new PostalCodeError(
    'invalid-response',
    'O provedor de CEP retornou dados inválidos. Preencha a localização manualmente ou tente novamente.',
  )
}

function parseViaCepResponse(
  response: ViaCepResponse,
  postalCode: string,
): PostalCodeResult {
  if (response.erro === true || response.erro === 'true') {
    throw new PostalCodeError(
      'not-found',
      'CEP não encontrado. Confira o número ou preencha a localização manualmente.',
    )
  }

  const city = typeof response.localidade === 'string'
    ? response.localidade.trim()
    : ''
  const stateCode = typeof response.uf === 'string'
    ? response.uf.trim().toUpperCase()
    : ''
  const ibgeCode = typeof response.ibge === 'string'
    ? response.ibge.trim()
    : ''
  const neighborhood = typeof response.bairro === 'string'
    ? response.bairro.trim()
    : ''

  if (
    !city ||
    !isBrazilianStateCode(stateCode) ||
    !/^\d{7}$/.test(ibgeCode)
  ) {
    throw invalidResponse()
  }

  return {
    baseLocation: { city, stateCode, ibgeCode },
    privateLocation: {
      postalCode,
      ...(neighborhood ? { neighborhood } : {}),
    },
  }
}

export async function lookupPostalCode(
  value: string,
  dependencies: PostalCodeDependencies = {},
): Promise<PostalCodeResult> {
  const postalCode = normalizePostalCode(value)
  if (postalCode.length !== 8) {
    throw new PostalCodeError(
      'invalid-postal-code',
      'Informe um CEP válido com oito dígitos.',
    )
  }

  const isOnline = dependencies.isOnline ?? (() => navigator.onLine)
  if (!isOnline()) {
    throw new PostalCodeError(
      'offline',
      'Você está sem conexão. Tente novamente quando estiver online ou preencha a localização manualmente.',
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )

  try {
    const response = await (dependencies.fetcher ?? fetch)(
      `${VIA_CEP_API}/${postalCode}/json/`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    )

    if (response.status === 400) {
      throw new PostalCodeError(
        'invalid-postal-code',
        'O CEP informado é inválido. Confira os oito dígitos.',
      )
    }
    if (!response.ok) {
      throw new PostalCodeError(
        'provider-unavailable',
        'O serviço de CEP está indisponível. Tente novamente ou preencha a localização manualmente.',
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      throw new PostalCodeError(
        'invalid-response',
        invalidResponse().message,
        { cause: error },
      )
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw invalidResponse()
    }
    return parseViaCepResponse(body as ViaCepResponse, postalCode)
  } catch (error) {
    if (error instanceof PostalCodeError) throw error
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      throw new PostalCodeError(
        'timeout',
        'A consulta de CEP demorou demais. Tente novamente ou preencha a localização manualmente.',
        { cause: error },
      )
    }
    if (!isOnline()) {
      throw new PostalCodeError(
        'offline',
        'Você está sem conexão. Tente novamente quando estiver online ou preencha a localização manualmente.',
        { cause: error },
      )
    }
    throw new PostalCodeError(
      'provider-unavailable',
      'Não foi possível consultar o CEP. Tente novamente ou preencha a localização manualmente.',
      { cause: error },
    )
  } finally {
    clearTimeout(timeout)
  }
}
