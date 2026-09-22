export type ImageProviderName = 'mock' | 'backend' | 'disabled'

export interface ImageProviderConfig {
  provider: ImageProviderName
  backendBaseUrl?: string
}

type Environment = Record<string, unknown>

function readString(environment: Environment, key: string) {
  const value = environment[key]
  return typeof value === 'string' ? value.trim() : ''
}

function isImageProviderName(value: string): value is ImageProviderName {
  return value === 'mock' || value === 'backend' || value === 'disabled'
}

export function parseImageProviderEnvironment(
  environment: Environment,
): ImageProviderConfig {
  const mode = readString(environment, 'MODE') || 'production'
  const configuredProvider = readString(environment, 'VITE_IMAGE_PROVIDER')
  const provider = configuredProvider || (mode === 'production' ? 'disabled' : 'mock')

  if (!isImageProviderName(provider)) {
    throw new Error(
      'VITE_IMAGE_PROVIDER deve ser "mock", "backend" ou "disabled".',
    )
  }
  if (provider === 'mock' && mode === 'production') {
    throw new Error('O ImageProvider mock não pode ser usado em produção.')
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
