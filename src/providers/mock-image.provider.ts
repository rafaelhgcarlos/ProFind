import {
  ImageProviderError,
  type ImageProvider,
  type ImageRemovalRequest,
  type ImageUploadRequest,
  type ImageUploadResult,
} from './image-provider'

export interface MockImageProviderOptions {
  uploadFailures?: number
  removalFailures?: number
}

function imageIdentifier() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class MockImageProvider implements ImageProvider {
  readonly name = 'mock'
  readonly configured = true
  private uploadFailures: number
  private removalFailures: number
  private readonly storedImages = new Map<
    string,
    { ownerId: string; purpose: ImageUploadRequest['purpose'] }
  >()

  constructor(options: MockImageProviderOptions = {}) {
    this.uploadFailures = options.uploadFailures ?? 0
    this.removalFailures = options.removalFailures ?? 0
  }

  private async performUpload(
    request: ImageUploadRequest,
  ): Promise<ImageUploadResult> {
    request.onProgress?.(10)
    await Promise.resolve()
    request.onProgress?.(55)

    if (this.uploadFailures > 0) {
      this.uploadFailures -= 1
      throw new ImageProviderError(
        'upload-failed',
        'O provedor de imagens simulou uma falha no envio.',
      )
    }

    const providerId = `${request.purpose.toLowerCase()}-${imageIdentifier()}`
    this.storedImages.set(providerId, {
      ownerId: request.ownerId,
      purpose: request.purpose,
    })
    request.onProgress?.(100)

    return {
      provider: 'MOCK',
      providerId,
      url: `https://mock-images.profind.invalid/${encodeURIComponent(request.ownerId)}/${encodeURIComponent(providerId)}`,
    }
  }

  upload(request: ImageUploadRequest) {
    return this.performUpload(request)
  }

  retry(request: ImageUploadRequest) {
    return this.performUpload(request)
  }

  async prepareRemoval({ ownerId, purpose, providerId }: ImageRemovalRequest) {
    const storedImage = this.storedImages.get(providerId)
    if (
      storedImage &&
      (storedImage.ownerId !== ownerId || storedImage.purpose !== purpose)
    ) {
      throw new ImageProviderError(
        'scope-mismatch',
        'A imagem não pertence ao proprietário e à finalidade informados.',
      )
    }
  }

  async remove({ ownerId, purpose, providerId }: ImageRemovalRequest) {
    if (this.removalFailures > 0) {
      this.removalFailures -= 1
      throw new ImageProviderError(
        'removal-failed',
        'O provedor de imagens simulou uma falha na remoção.',
      )
    }
    const storedImage = this.storedImages.get(providerId)
    if (
      storedImage &&
      (storedImage.ownerId !== ownerId || storedImage.purpose !== purpose)
    ) {
      throw new ImageProviderError(
        'scope-mismatch',
        'A imagem não pertence ao proprietário e à finalidade informados.',
      )
    }
    this.storedImages.delete(providerId)
  }
}
