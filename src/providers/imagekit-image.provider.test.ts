import { describe, expect, it, vi } from 'vitest'

import type { ImagePurpose, ImageReference } from '../types/image'
import { ImageKitImageProvider } from './imagekit-image.provider'

const ownerId = 'owner-both-roles'
const config = {
  publicKey: 'public_test',
  urlEndpoint: 'https://ik.imagekit.io/profind',
  authEndpoint: 'http://localhost:8787/api/imagekit/auth',
}

class UploadRequestStub {
  status = 200
  response: unknown = {
    fileId: 'imagekit-file-1',
    url: 'https://ik.imagekit.io/profind/client-avatar.webp',
  }
  responseType = ''
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
  onerror: (() => void) | null = null
  onload: (() => void) | null = null
  sentBody: FormData | null = null

  open = vi.fn()
  send(body: FormData) {
    this.sentBody = body
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: 5,
      total: 10,
    } as ProgressEvent)
    queueMicrotask(() => this.onload?.())
  }
}

function uploadAuthorization(purpose: ImagePurpose, deletion = false) {
  const folders: Record<ImagePurpose, string> = {
    CLIENT_AVATAR: `/profind/users/${ownerId}/client-avatar`,
    PROFESSIONAL_AVATAR: `/profind/professionals/${ownerId}/avatar`,
    PROFESSIONAL_PORTFOLIO: `/profind/professionals/${ownerId}/portfolio`,
  }
  return {
    token: `signed-${purpose}`,
    uploadPayload: {
      fileName: `${purpose.toLowerCase()}.webp`,
      folder: folders[purpose],
      checks: "'file.size' <= '5MB'",
      transformation: '{"pre":"f-webp"}',
    },
    ...(deletion
      ? { deletionGrant: 'delete-old', deletionProviderId: 'old-file' }
      : {}),
  }
}

function imageFile(name = 'avatar.jpg') {
  return new File(['image'], name, { type: 'image/jpeg' })
}

describe('ImageKitImageProvider', () => {
  it('autoriza com Firebase, envia o payload V2 assinado e retorna a URL real', async () => {
    const xhr = new UploadRequestStub()
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { purpose: ImagePurpose }
      return Response.json(uploadAuthorization(body.purpose))
    })
    const progress = vi.fn()
    const provider = new ImageKitImageProvider(config, {
      fetcher,
      createRequest: () => xhr as unknown as XMLHttpRequest,
      getIdToken: vi.fn(async () => 'firebase-id-token'),
    })

    await expect(
      provider.upload({
        ownerId,
        purpose: 'CLIENT_AVATAR',
        file: imageFile(),
        onProgress: progress,
      }),
    ).resolves.toEqual({
      provider: 'IMAGEKIT',
      providerId: 'imagekit-file-1',
      url: 'https://ik.imagekit.io/profind/client-avatar.webp',
    })
    expect(progress).toHaveBeenCalledWith(50)
    expect(xhr.open).toHaveBeenCalledWith(
      'POST',
      'https://upload.imagekit.io/api/v2/files/upload',
    )
    expect(xhr.sentBody?.get('token')).toBe('signed-CLIENT_AVATAR')
    expect(xhr.sentBody?.get('folder')).toBe(
      `/profind/users/${ownerId}/client-avatar`,
    )
    expect(fetcher).toHaveBeenCalledWith(
      config.authEndpoint,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-id-token',
        }),
      }),
    )
  })

  it('obtém credencial nova no retry depois de erro isolado', async () => {
    const failed = new UploadRequestStub()
    failed.status = 503
    const recovered = new UploadRequestStub()
    const requests = [failed, recovered]
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return Response.json(uploadAuthorization('CLIENT_AVATAR'))
      },
    )
    const provider = new ImageKitImageProvider(config, {
      fetcher,
      createRequest: () => requests.shift() as unknown as XMLHttpRequest,
      getIdToken: async () => 'firebase-id-token',
    })
    const request = {
      ownerId,
      purpose: 'CLIENT_AVATAR' as const,
      file: imageFile(),
    }

    await expect(provider.upload(request)).rejects.toThrow(/ImageKit/i)
    await expect(provider.retry(request)).resolves.toMatchObject({
      provider: 'IMAGEKIT',
      providerId: 'imagekit-file-1',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('orienta iniciar o Worker quando a autorização local está offline', async () => {
    const provider = new ImageKitImageProvider(config, {
      fetcher: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
      getIdToken: async () => 'firebase-id-token',
    })

    await expect(
      provider.upload({
        ownerId,
        purpose: 'CLIENT_AVATAR',
        file: imageFile(),
      }),
    ).rejects.toThrow(/npm run dev/i)
  })

  it('invoca o fetch global sem vinculá-lo à instância do provider', async () => {
    const originalFetch = globalThis.fetch
    const contexts: unknown[] = []
    globalThis.fetch = vi.fn(function (this: unknown) {
      contexts.push(this)
      return Promise.resolve(
        Response.json(uploadAuthorization('CLIENT_AVATAR')),
      )
    }) as typeof fetch
    const xhr = new UploadRequestStub()

    try {
      const provider = new ImageKitImageProvider(config, {
        createRequest: () => xhr as unknown as XMLHttpRequest,
        getIdToken: async () => 'firebase-id-token',
      })
      await provider.upload({
        ownerId,
        purpose: 'CLIENT_AVATAR',
        file: imageFile(),
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(contexts).toEqual([globalThis])
  })

  it('isola as três finalidades para a mesma conta com ambos os papéis', async () => {
    const purposes: ImagePurpose[] = [
      'CLIENT_AVATAR',
      'PROFESSIONAL_AVATAR',
      'PROFESSIONAL_PORTFOLIO',
    ]
    const authorizationBodies: unknown[] = []
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { purpose: ImagePurpose }
      authorizationBodies.push(body)
      return Response.json(uploadAuthorization(body.purpose))
    })
    let uploadIndex = 0
    const provider = new ImageKitImageProvider(config, {
      fetcher,
      createRequest: () => {
        const xhr = new UploadRequestStub()
        xhr.response = {
          fileId: `file-${uploadIndex}`,
          url: `${config.urlEndpoint}/file-${uploadIndex++}.webp`,
        }
        return xhr as unknown as XMLHttpRequest
      },
      getIdToken: async () => 'firebase-id-token',
    })

    for (const purpose of purposes) {
      await provider.upload({ ownerId, purpose, file: imageFile() })
    }
    expect(authorizationBodies).toEqual(
      purposes.map((purpose) =>
        expect.objectContaining({ purpose, publicKey: config.publicKey }),
      ),
    )
  })

  it('pré-autoriza a imagem anterior e preserva o grant para remoção após salvar', async () => {
    const xhr = new UploadRequestStub()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(uploadAuthorization('CLIENT_AVATAR', true)),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const provider = new ImageKitImageProvider(config, {
      fetcher,
      createRequest: () => xhr as unknown as XMLHttpRequest,
      getIdToken: async () => 'firebase-id-token',
    })
    const previousReference: ImageReference = {
      provider: 'IMAGEKIT',
      ownerId,
      purpose: 'CLIENT_AVATAR',
      url: `${config.urlEndpoint}/old.webp`,
      providerId: 'old-file',
      createdAt: 1,
      updatedAt: 1,
    }

    await provider.upload({
      ownerId,
      purpose: 'CLIENT_AVATAR',
      file: imageFile(),
      previousReference,
    })
    await provider.remove({
      ownerId,
      purpose: 'CLIENT_AVATAR',
      providerId: 'old-file',
    })

    const removal = fetcher.mock.calls[1]
    expect(removal[0]).toBe(
      'http://localhost:8787/api/imagekit/files/old-file',
    )
    expect(JSON.parse(String(removal[1]?.body))).toEqual({
      purpose: 'CLIENT_AVATAR',
      deletionGrant: 'delete-old',
    })
  })

  it('não tenta pré-autorizar a remoção de uma referência legada', async () => {
    const xhr = new UploadRequestStub()
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return Response.json(uploadAuthorization('CLIENT_AVATAR'))
      },
    )
    const provider = new ImageKitImageProvider(config, {
      fetcher,
      createRequest: () => xhr as unknown as XMLHttpRequest,
      getIdToken: async () => 'firebase-id-token',
    })

    await provider.upload({
      ownerId,
      purpose: 'CLIENT_AVATAR',
      file: imageFile(),
      previousReference: {
        provider: 'LEGACY',
        ownerId,
        purpose: 'CLIENT_AVATAR',
        url: 'https://mock-images.profind.invalid/old',
        providerId: 'old-mock-file',
        createdAt: 1,
        updatedAt: 1,
      },
    })

    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).not.toHaveProperty(
      'previousProviderId',
    )
  })

  it('recusa provider sem sessão e resposta com URL falsa', async () => {
    const providerWithoutSession = new ImageKitImageProvider(config, {
      getIdToken: async () => '',
    })
    await expect(
      providerWithoutSession.upload({
        ownerId,
        purpose: 'CLIENT_AVATAR',
        file: imageFile(),
      }),
    ).rejects.toThrow(/sessão/i)

    const xhr = new UploadRequestStub()
    xhr.response = {
      fileId: 'fake',
      url: 'https://mock-images.profind.invalid/fake',
    }
    const providerWithFakeResponse = new ImageKitImageProvider(config, {
      fetcher: async () =>
        Response.json(uploadAuthorization('CLIENT_AVATAR')),
      createRequest: () => xhr as unknown as XMLHttpRequest,
      getIdToken: async () => 'firebase-id-token',
    })
    await expect(
      providerWithFakeResponse.upload({
        ownerId,
        purpose: 'CLIENT_AVATAR',
        file: imageFile(),
      }),
    ).rejects.toThrow(/URL HTTPS e fileId/i)
  })
})
