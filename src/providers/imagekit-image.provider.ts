import {
  ImageProviderError,
  type ImageProvider,
  type ImageRemovalRequest,
  type ImageUploadRequest,
  type ImageUploadResult,
} from './image-provider'

interface ImageKitImageProviderConfig {
  publicKey: string
  urlEndpoint: string
  authEndpoint: string
}

interface ImageKitImageProviderDependencies {
  fetcher?: typeof fetch
  createRequest?: () => XMLHttpRequest
  getIdToken(): Promise<string>
}

interface UploadAuthorization {
  token: string
  uploadPayload: Record<string, string>
  deletionGrant?: string
  deletionProviderId?: string
}

interface RemovalAuthorization {
  deletionGrant: string
  deletionProviderId: string
}

const IMAGEKIT_UPLOAD_ENDPOINT =
  'https://upload.imagekit.io/api/v2/files/upload'

function expectedFolder(ownerId: string, purpose: ImageUploadRequest['purpose']) {
  const encodedOwner = encodeURIComponent(ownerId)
  switch (purpose) {
    case 'CLIENT_AVATAR':
      return `/profind/users/${encodedOwner}/client-avatar`
    case 'PROFESSIONAL_AVATAR':
      return `/profind/professionals/${encodedOwner}/avatar`
    case 'PROFESSIONAL_PORTFOLIO':
      return `/profind/professionals/${encodedOwner}/portfolio`
  }
}

function deletionEndpoint(authEndpoint: string, providerId: string) {
  const base = authEndpoint.replace(/\/auth$/, '')
  return `${base}/files/${encodeURIComponent(providerId)}`
}

function parseAuthorization(value: unknown): UploadAuthorization {
  if (typeof value !== 'object' || value === null) {
    throw new ImageProviderError(
      'invalid-response',
      'O backend do ImageKit retornou autorização inválida.',
    )
  }
  const response = value as Record<string, unknown>
  const payload = response.uploadPayload
  if (
    typeof response.token !== 'string' ||
    !response.token.trim() ||
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.values(payload).some((item) => typeof item !== 'string')
  ) {
    throw new ImageProviderError(
      'invalid-response',
      'O backend do ImageKit retornou autorização incompatível.',
    )
  }

  return {
    token: response.token,
    uploadPayload: payload as Record<string, string>,
    deletionGrant:
      typeof response.deletionGrant === 'string'
        ? response.deletionGrant
        : undefined,
    deletionProviderId:
      typeof response.deletionProviderId === 'string'
        ? response.deletionProviderId
        : undefined,
  }
}

function parseUploadResponse(
  value: unknown,
  urlEndpoint: string,
): ImageUploadResult {
  if (typeof value !== 'object' || value === null) {
    throw new ImageProviderError(
      'invalid-response',
      'O ImageKit retornou uma resposta inválida.',
    )
  }
  const response = value as Record<string, unknown>
  if (
    typeof response.fileId !== 'string' ||
    !response.fileId.trim() ||
    typeof response.url !== 'string' ||
    !response.url.startsWith(`${urlEndpoint}/`)
  ) {
    throw new ImageProviderError(
      'invalid-response',
      'O ImageKit não retornou URL HTTPS e fileId compatíveis.',
    )
  }
  return {
    provider: 'IMAGEKIT',
    providerId: response.fileId.trim(),
    url: response.url,
  }
}

function parseRemovalAuthorization(
  value: unknown,
  expectedProviderId: string,
): RemovalAuthorization {
  if (typeof value !== 'object' || value === null) {
    throw new ImageProviderError(
      'invalid-response',
      'O backend do ImageKit retornou autorização de remoção inválida.',
    )
  }
  const response = value as Record<string, unknown>
  if (
    typeof response.deletionGrant !== 'string' ||
    !response.deletionGrant.trim() ||
    response.deletionProviderId !== expectedProviderId
  ) {
    throw new ImageProviderError(
      'invalid-response',
      'O backend do ImageKit retornou autorização de remoção incompatível.',
    )
  }
  return {
    deletionGrant: response.deletionGrant,
    deletionProviderId: expectedProviderId,
  }
}

export class ImageKitImageProvider implements ImageProvider {
  readonly name = 'imagekit'
  readonly configured = true
  private readonly fetcher: typeof fetch
  private readonly createRequest: () => XMLHttpRequest
  private readonly deletionGrants = new Map<string, string>()

  constructor(
    private readonly config: ImageKitImageProviderConfig,
    private readonly dependencies: ImageKitImageProviderDependencies,
  ) {
    this.fetcher =
      dependencies.fetcher ??
      ((input, init) => globalThis.fetch(input, init))
    this.createRequest = dependencies.createRequest ?? (() => new XMLHttpRequest())
  }

  private async authorize(request: ImageUploadRequest) {
    const idToken = await this.dependencies.getIdToken()
    if (!idToken) {
      throw new ImageProviderError(
        'not-configured',
        'Sua sessão não está disponível para autorizar o upload.',
      )
    }
    if (
      request.previousReference &&
      (request.previousReference.ownerId !== request.ownerId ||
        request.previousReference.purpose !== request.purpose)
    ) {
      throw new ImageProviderError(
        'scope-mismatch',
        'A imagem anterior não pertence ao proprietário e à finalidade informados.',
      )
    }

    let response: Response
    try {
      response = await this.fetcher(this.config.authEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purpose: request.purpose,
          fileName: request.file.name,
          fileType: request.file.type,
          fileSize: request.file.size,
          publicKey: this.config.publicKey,
          previousProviderId:
            request.previousReference?.provider === 'IMAGEKIT'
              ? request.previousReference.providerId
              : undefined,
        }),
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(
          '[ImageKit] Falha de rede ao solicitar autorização ao Worker.',
          error instanceof Error ? error.message : 'Erro de rede desconhecido.',
        )
      }
      throw new ImageProviderError(
        'network-error',
        this.config.authEndpoint.startsWith('/api/imagekit/') ||
          this.config.authEndpoint.includes('localhost:8787') ||
          this.config.authEndpoint.includes('127.0.0.1:8787')
          ? 'Não foi possível acessar o Worker local do ImageKit. Inicie o projeto com npm run dev e tente novamente.'
          : 'Não foi possível acessar a autorização do ImageKit.',
        { cause: error },
      )
    }
    if (!response.ok) {
      throw new ImageProviderError(
        response.status === 401 || response.status === 403
          ? 'scope-mismatch'
          : 'upload-failed',
        response.status === 401 || response.status === 403
          ? 'Sua sessão não foi autorizada para enviar esta imagem.'
          : 'O backend não conseguiu autorizar o envio ao ImageKit.',
      )
    }

    const authorization = parseAuthorization(await response.json())
    if (
      authorization.uploadPayload.folder !==
      expectedFolder(request.ownerId, request.purpose)
    ) {
      throw new ImageProviderError(
        'invalid-response',
        'A autorização do ImageKit não corresponde ao proprietário e à finalidade.',
      )
    }
    return authorization
  }

  private performUpload(request: ImageUploadRequest) {
    return this.authorize(request).then(
      (authorization) =>
        new Promise<ImageUploadResult>((resolve, reject) => {
          const xhr = this.createRequest()
          xhr.open('POST', IMAGEKIT_UPLOAD_ENDPOINT)
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
                'Não foi possível acessar o upload do ImageKit.',
              ),
            )
          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(
                new ImageProviderError(
                  'upload-failed',
                  'O ImageKit não conseguiu enviar a imagem.',
                ),
              )
              return
            }
            try {
              const result = parseUploadResponse(
                xhr.response,
                this.config.urlEndpoint,
              )
              if (
                authorization.deletionGrant &&
                authorization.deletionProviderId
              ) {
                this.deletionGrants.set(
                  authorization.deletionProviderId,
                  authorization.deletionGrant,
                )
              }
              resolve(result)
            } catch (error) {
              reject(error)
            }
          }

          const form = new FormData()
          form.append('file', request.file, request.file.name)
          form.append('token', authorization.token)
          Object.entries(authorization.uploadPayload).forEach(([key, value]) =>
            form.append(key, value),
          )
          xhr.send(form)
        }),
    )
  }

  upload(request: ImageUploadRequest) {
    return this.performUpload(request)
  }

  retry(request: ImageUploadRequest) {
    return this.performUpload(request)
  }

  async prepareRemoval({ purpose, providerId }: ImageRemovalRequest) {
    const idToken = await this.dependencies.getIdToken()
    if (!idToken) {
      throw new ImageProviderError(
        'not-configured',
        'Sua sessão não está disponível para autorizar a remoção da imagem.',
      )
    }

    try {
      const response = await this.fetcher(
        deletionEndpoint(this.config.authEndpoint, providerId),
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ purpose, prepareOnly: true }),
        },
      )
      if (!response.ok) {
        throw new ImageProviderError(
          response.status === 401 || response.status === 403
            ? 'scope-mismatch'
            : 'removal-failed',
          response.status === 401 || response.status === 403
            ? 'A imagem não pertence à sua conta e à finalidade informada.'
            : 'O backend não conseguiu autorizar a remoção da imagem do ImageKit.',
        )
      }
      const authorization = parseRemovalAuthorization(
        await response.json(),
        providerId,
      )
      this.deletionGrants.set(providerId, authorization.deletionGrant)
    } catch (error) {
      if (error instanceof ImageProviderError) throw error
      throw new ImageProviderError(
        'network-error',
        'Não foi possível acessar a autorização de remoção do ImageKit.',
        { cause: error },
      )
    }
  }

  async remove({ purpose, providerId }: ImageRemovalRequest) {
    const idToken = await this.dependencies.getIdToken()
    if (!idToken) {
      throw new ImageProviderError(
        'not-configured',
        'Sua sessão não está disponível para remover a imagem.',
      )
    }

    try {
      const response = await this.fetcher(
        deletionEndpoint(this.config.authEndpoint, providerId),
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            purpose,
            deletionGrant: this.deletionGrants.get(providerId),
          }),
        },
      )
      if (!response.ok) {
        throw new ImageProviderError(
          response.status === 401 || response.status === 403
            ? 'scope-mismatch'
            : 'removal-failed',
          response.status === 401 || response.status === 403
            ? 'A imagem não pertence à sua conta e à finalidade informada.'
            : 'O backend não conseguiu remover a imagem do ImageKit.',
        )
      }
      this.deletionGrants.delete(providerId)
    } catch (error) {
      if (error instanceof ImageProviderError) throw error
      throw new ImageProviderError(
        'network-error',
        'Não foi possível acessar a remoção do ImageKit.',
        { cause: error },
      )
    }
  }
}
