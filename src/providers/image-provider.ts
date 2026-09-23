import type {
  ImageProviderId,
  ImagePurpose,
  ImageReference,
} from '../types/image'

export interface ImageUploadRequest {
  ownerId: string
  file: File
  purpose: ImagePurpose
  previousReference?: ImageReference | null
  onProgress?(progress: number): void
}

export interface ImageRemovalRequest {
  ownerId: string
  purpose: ImagePurpose
  providerId: string
}

export interface ImageUploadResult {
  provider: ImageProviderId
  url: string
  providerId: string
}

export type ImageProviderErrorCode =
  | 'not-configured'
  | 'scope-mismatch'
  | 'upload-failed'
  | 'removal-failed'
  | 'invalid-response'
  | 'network-error'

export class ImageProviderError extends Error {
  constructor(
    public readonly code: ImageProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ImageProviderError'
  }
}

export interface ImageProvider {
  readonly name: string
  readonly configured: boolean
  upload(request: ImageUploadRequest): Promise<ImageUploadResult>
  retry(request: ImageUploadRequest): Promise<ImageUploadResult>
  prepareRemoval(request: ImageRemovalRequest): Promise<void>
  remove(request: ImageRemovalRequest): Promise<void>
}
