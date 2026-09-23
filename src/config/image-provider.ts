export type ImageProviderName = 'imagekit' | 'mock' | 'backend' | 'disabled'

export interface ImageKitProviderConfig {
  publicKey: string
  urlEndpoint: string
  authEndpoint: string
}

export interface ImageProviderConfig {
  provider: ImageProviderName
  backendBaseUrl?: string
  imageKit?: ImageKitProviderConfig
}

type Environment = Record<string, unknown>

function readString(environment: Environment, key: string) {
  const value = environment[key]
  return typeof value === 'string' ? value.trim() : ''
}

function isImageProviderName(value: string): value is ImageProviderName {
  return (
    value === 'imagekit' ||
    value === 'mock' ||
    value === 'backend' ||
    value === 'disabled'
  )
}

function isSecureEndpoint(value: string, allowLocalHttp = false) {
  if (value.startsWith('/')) return true
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' ||
      (allowLocalHttp &&
        url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    )
  } catch {
    return false
  }
}

function isHttpsEndpoint(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function developmentAuthEndpoint(value: string, mode: string) {
  if (mode === 'production') return value
  try {
    const url = new URL(value)
    if (
      url.protocol === 'http:' &&
      url.port === '8787' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return `${url.pathname}${url.search}`
    }
  } catch {
    // Endpoints relativos já usam a mesma origem do frontend.
  }
  return value
}

export function parseImageProviderEnvironment(
  environment: Environment,
): ImageProviderConfig {
  const mode = readString(environment, 'MODE') || 'production'
  const configuredProvider = readString(environment, 'VITE_IMAGE_PROVIDER')
  const imageKitPublicKey = readString(environment, 'VITE_IMAGEKIT_PUBLIC_KEY')
  const imageKitUrlEndpoint = readString(
    environment,
    'VITE_IMAGEKIT_URL_ENDPOINT',
  ).replace(/\/$/, '')
  const imageKitAuthEndpoint = readString(
    environment,
    'VITE_IMAGEKIT_AUTH_ENDPOINT',
  ).replace(/\/$/, '')
  const hasImageKitConfig = Boolean(
    imageKitPublicKey && imageKitUrlEndpoint && imageKitAuthEndpoint,
  )
  const provider =
    configuredProvider ||
    (mode === 'test' ? 'mock' : hasImageKitConfig ? 'imagekit' : 'disabled')

  if (!isImageProviderName(provider)) {
    throw new Error(
      'VITE_IMAGE_PROVIDER deve ser "imagekit", "mock", "backend" ou "disabled".',
    )
  }
  if (provider === 'mock' && mode === 'production') {
    throw new Error('O ImageProvider mock não pode ser usado em produção.')
  }
  if (provider === 'imagekit') {
    if (
      !hasImageKitConfig ||
      !isHttpsEndpoint(imageKitUrlEndpoint) ||
      !isSecureEndpoint(imageKitAuthEndpoint, mode !== 'production')
    ) {
      throw new Error(
        'Configure public key, URL HTTPS e endpoint de autenticação seguro do ImageKit.',
      )
    }
    return {
      provider,
      imageKit: {
        publicKey: imageKitPublicKey,
        urlEndpoint: imageKitUrlEndpoint,
        authEndpoint: developmentAuthEndpoint(imageKitAuthEndpoint, mode),
      },
    }
  }
  if (provider !== 'backend') return { provider }

  const backendBaseUrl = readString(environment, 'VITE_IMAGE_API_BASE_URL')
    .replace(/\/$/, '')
  if (
    !backendBaseUrl ||
    (!backendBaseUrl.startsWith('/') &&
      !backendBaseUrl.startsWith('https://'))
  ) {
    throw new Error(
      'VITE_IMAGE_API_BASE_URL deve ser uma rota relativa ou uma URL HTTPS.',
    )
  }

  return { provider, backendBaseUrl }
}

export function getImageProviderConfig() {
  return parseImageProviderEnvironment(import.meta.env)
}
