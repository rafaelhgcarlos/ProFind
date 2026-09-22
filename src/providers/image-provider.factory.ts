import {
  getImageProviderConfig,
  type ImageProviderConfig,
} from '../config/image-provider'
import { BackendImageProvider } from './backend-image.provider'
import { DisabledImageProvider } from './disabled-image.provider'
import type { ImageProvider } from './image-provider'
import { MockImageProvider } from './mock-image.provider'

export function createImageProvider(
  config: ImageProviderConfig,
): ImageProvider {
  switch (config.provider) {
    case 'mock':
      return new MockImageProvider()
    case 'backend':
      return new BackendImageProvider(config.backendBaseUrl ?? '')
    case 'disabled':
      return new DisabledImageProvider()
  }
}

let providerInstance: ImageProvider | undefined

export function getImageProvider() {
  if (!providerInstance) {
    try {
      providerInstance = createImageProvider(getImageProviderConfig())
    } catch {
      providerInstance = new DisabledImageProvider()
    }
  }
  return providerInstance
}

export function resetImageProvider() {
  providerInstance = undefined
}
