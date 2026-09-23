import {
  getImageProviderConfig,
  type ImageProviderConfig,
} from '../config/image-provider'
import { BackendImageProvider } from './backend-image.provider'
import { DisabledImageProvider } from './disabled-image.provider'
import { ImageKitImageProvider } from './imagekit-image.provider'
import type { ImageProvider } from './image-provider'
import { MockImageProvider } from './mock-image.provider'
import { authService } from '../services/auth.service'

export function createImageProvider(
  config: ImageProviderConfig,
): ImageProvider {
  switch (config.provider) {
    case 'imagekit': {
      if (!config.imageKit) return new DisabledImageProvider()
      return new ImageKitImageProvider(config.imageKit, {
        async getIdToken() {
          const user = authService.getCurrentUser()
          if (!user) return ''
          return user.getIdToken()
        },
      })
    }
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
