import {
  ImageProviderError,
  type ImageProvider,
  type ImageRemovalRequest,
  type ImageUploadRequest,
  type ImageUploadResult,
} from './image-provider'

type XMLHttpRequestFactory = () => XMLHttpRequest

interface BackendImageProviderDependencies {
  createRequest?: XMLHttpRequestFactory
  fetcher?: typeof fetch
}

function parseUploadResponse(value: unknown): ImageUploadResult {
  if (typeof value !== 'object' || value === null) {
    throw new ImageProviderError(
      'invalid-response',
      'O backend de imagens retornou uma resposta inválida.',
    )
  }

  const response = value as Record<string, unknown>
  if (
    typeof response.url !== 'string' ||
    !response.url.startsWith('https://') ||
    typeof response.providerId !== 'string' ||
    !response.providerId.trim()
  ) {
    throw new ImageProviderError(
      'invalid-response',
      'O backend de imagens não retornou URL e identificador válidos.',
    )
  }

  return {
    url: response.url,
    providerId: response.providerId.trim(),
  }
}

export class BackendImageProvider implements ImageProvider {
  readonly name = 'backend'
  readonly configured = true
  private readonly createRequest: XMLHttpRequestFactory
  private readonly fetcher: typeof fetch

  constructor(
    private readonly baseUrl: string,
    dependencies: BackendImageProviderDependencies = {},
  ) {
    this.createRequest = dependencies.createRequest ?? (() => new XMLHttpRequest())
    this.fetcher = dependencies.fetcher ?? fetch
  }

  private performUpload(request: ImageUploadRequest): Promise<ImageUploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = this.createRequest()
      xhr.open('POST', `${this.baseUrl}/images`)
      xhr.withCredentials = true
      xhr.responseType = 'json'
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        request.onProgress?.(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        )
      }
      xhr.onerror = () =>
        reject(
          new ImageProviderError(
            'network-error',
            'Não foi possível acessar o backend de imagens.',
          ),
        )
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new ImageProviderError(
              'upload-failed',
              'O backend não conseguiu enviar a imagem.',
            ),
          )
          return
        }
        try {
          resolve(parseUploadResponse(xhr.response))
        } catch (error) {
          reject(error)
        }
      }

      const form = new FormData()
      form.append('file', request.file)
      form.append('purpose', request.purpose)
      form.append('ownerId', request.ownerId)
      xhr.send(form)
    })
  }

  upload(request: ImageUploadRequest) {
    return this.performUpload(request)
  }

  retry(request: ImageUploadRequest) {
    return this.performUpload(request)
  }

  async remove({ ownerId, purpose, providerId }: ImageRemovalRequest) {
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/images/${encodeURIComponent(providerId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerId, purpose }),
        },
      )
      if (!response.ok) {
        throw new ImageProviderError(
          'removal-failed',
          'O backend não conseguiu remover a imagem.',
        )
      }
    } catch (error) {
      if (error instanceof ImageProviderError) throw error
      throw new ImageProviderError(
        'network-error',
        'Não foi possível acessar o backend de imagens.',
        { cause: error },
      )
    }
  }
}
