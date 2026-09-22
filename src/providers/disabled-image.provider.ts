import { ImageProviderError, type ImageProvider } from './image-provider'

function notConfiguredError() {
  return new ImageProviderError(
    'not-configured',
    'O envio de imagens ainda não está configurado neste ambiente.',
  )
}

export class DisabledImageProvider implements ImageProvider {
  readonly name = 'disabled'
  readonly configured = false

  async upload(): Promise<never> {
    throw notConfiguredError()
  }

  async retry(): Promise<never> {
    throw notConfiguredError()
  }

  async remove(): Promise<never> {
    throw notConfiguredError()
  }
}
