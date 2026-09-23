import { decodeJwt, jwtVerify } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import { createImageKitWorker, type Env, type ImagePurpose } from './index'

const env: Env = {
  IMAGEKIT_PRIVATE_KEY: 'private-test-key-never-bundled',
  IMAGEKIT_PUBLIC_KEY: 'public-test-key',
  FIREBASE_PROJECT_ID: 'profind-test',
  ALLOWED_ORIGINS: 'https://app.profind.test',
}
const origin = 'http://localhost:5173'

function request(
  path: string,
  method: 'POST' | 'DELETE',
  body: unknown,
  token = 'valid-token',
): Request<unknown, IncomingRequestCfProperties> {
  return new Request(`http://localhost:8787${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as unknown as Request<unknown, IncomingRequestCfProperties>
}

function firestoreImage(
  ownerId: string,
  purpose: ImagePurpose,
  providerId: string,
) {
  return {
    mapValue: {
      fields: {
        provider: { stringValue: 'IMAGEKIT' },
        ownerId: { stringValue: ownerId },
        purpose: { stringValue: purpose },
        providerId: { stringValue: providerId },
      },
    },
  }
}

function dependencies(firestoreOwner = 'owner-1') {
  return {
    verifyFirebaseToken: vi.fn(async (token: string) => {
      if (token !== 'valid-token') throw new Error('invalid')
      return { sub: 'owner-1', auth_time: 1 }
    }),
    deleteImage: vi.fn(async () => undefined),
    fetcher: vi.fn(async (input: RequestInfo | URL) => {
      const professional = String(input).includes('/professionalProfiles/')
      return Response.json({
        fields: {
          profileImage: firestoreImage(
            firestoreOwner,
            professional ? 'PROFESSIONAL_AVATAR' : 'CLIENT_AVATAR',
            professional ? 'professional-file' : 'client-file',
          ),
          portfolioImages: {
            arrayValue: {
              values: [
                firestoreImage(
                  firestoreOwner,
                  'PROFESSIONAL_PORTFOLIO',
                  'portfolio-file',
                ),
              ],
            },
          },
        },
      })
    }),
    now: () => 1_800_000_000_000,
    randomUUID: vi
      .fn()
      .mockReturnValueOnce('file-uuid')
      .mockReturnValue('jwt-uuid'),
  }
}

describe('ImageKit Cloudflare Worker', () => {
  it('preserva o binding nativo ao consultar a referência persistida', async () => {
    const runtimeFetch = vi.fn(function (this: unknown) {
      if (this !== undefined) {
        throw new TypeError('Illegal invocation')
      }
      return Promise.resolve(
        Response.json({
          fields: {
            profileImage: firestoreImage(
              'owner-1',
              'PROFESSIONAL_AVATAR',
              'professional-file',
            ),
          },
        }),
      )
    })
    vi.stubGlobal('fetch', runtimeFetch)
    const deleteImage = vi.fn(async () => undefined)

    try {
      const worker = createImageKitWorker({
        verifyFirebaseToken: vi.fn(async () => ({
          sub: 'owner-1',
          auth_time: 1,
        })),
        deleteImage,
      })
      const response = await worker.fetch!(
        request('/api/imagekit/files/professional-file', 'DELETE', {
          purpose: 'PROFESSIONAL_AVATAR',
        }),
        env,
        {} as ExecutionContext,
      )

      expect(response.status).toBe(204)
      expect(runtimeFetch).toHaveBeenCalledOnce()
      expect(deleteImage).toHaveBeenCalledWith(
        env.IMAGEKIT_PRIVATE_KEY,
        'professional-file',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('recusa autenticação ausente ou Firebase ID token inválido', async () => {
    const deps = dependencies()
    const worker = createImageKitWorker(deps)
    const body = {
      purpose: 'CLIENT_AVATAR',
      fileName: 'avatar.jpg',
      fileType: 'image/jpeg',
      fileSize: 1024,
      publicKey: env.IMAGEKIT_PUBLIC_KEY,
    }

    expect((await worker.fetch!(request('/api/imagekit/auth', 'POST', body, ''), env, {} as ExecutionContext)).status).toBe(401)
    expect((await worker.fetch!(request('/api/imagekit/auth', 'POST', body, 'invalid'), env, {} as ExecutionContext)).status).toBe(401)
  })

  it('restringe CORS a localhost e às origens configuradas', async () => {
    const worker = createImageKitWorker(dependencies())
    const denied = request(
      '/api/imagekit/auth',
      'POST',
      {
        purpose: 'CLIENT_AVATAR',
        fileName: 'avatar.jpg',
        fileType: 'image/jpeg',
        fileSize: 1024,
        publicKey: env.IMAGEKIT_PUBLIC_KEY,
      },
    )
    denied.headers.set('Origin', 'https://attacker.example')
    const deniedResponse = await worker.fetch!(
      denied,
      env,
      {} as ExecutionContext,
    )
    expect(deniedResponse.status).toBe(403)
    expect(deniedResponse.headers.has('Access-Control-Allow-Origin')).toBe(false)

    const preflight = new Request('http://localhost:8787/api/imagekit/auth', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.profind.test' },
    }) as unknown as Request<unknown, IncomingRequestCfProperties>
    const allowedResponse = await worker.fetch!(
      preflight,
      env,
      {} as ExecutionContext,
    )
    expect(allowedResponse.status).toBe(204)
    expect(allowedResponse.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.profind.test',
    )
  })

  it('assina o payload V2 completo com pasta, checks e transformação por finalidade', async () => {
    const purposes: ImagePurpose[] = [
      'CLIENT_AVATAR',
      'PROFESSIONAL_AVATAR',
      'PROFESSIONAL_PORTFOLIO',
    ]
    const expectedFolders = [
      '/profind/users/owner-1/client-avatar',
      '/profind/professionals/owner-1/avatar',
      '/profind/professionals/owner-1/portfolio',
    ]

    for (const [index, purpose] of purposes.entries()) {
      const worker = createImageKitWorker(dependencies())
      const response = await worker.fetch!(
        request('/api/imagekit/auth', 'POST', {
          purpose,
          fileName: 'photo.jpg',
          fileType: 'image/jpeg',
          fileSize: 1024,
          publicKey: env.IMAGEKIT_PUBLIC_KEY,
        }),
        env,
        {} as ExecutionContext,
      )
      expect(response.status).toBe(200)
      const result = (await response.json()) as {
        token: string
        uploadPayload: Record<string, string>
      }
      expect(result.uploadPayload.folder).toBe(expectedFolders[index])
      expect(result.uploadPayload.checks).toContain("'file.size' <= '5MB'")
      expect(result.uploadPayload.transformation).toContain('f-webp')
      const verified = await jwtVerify(
        result.token,
        new TextEncoder().encode(env.IMAGEKIT_PRIVATE_KEY),
        { algorithms: ['HS256'] },
      )
      expect(verified.protectedHeader.kid).toBe(env.IMAGEKIT_PUBLIC_KEY)
      expect(decodeJwt(result.token)).toMatchObject(result.uploadPayload)
    }
  })

  it('não confia em ownerId enviado pelo frontend', async () => {
    const worker = createImageKitWorker(dependencies())
    const response = await worker.fetch!(
      request('/api/imagekit/auth', 'POST', {
        ownerId: 'attacker-selected-owner',
        purpose: 'CLIENT_AVATAR',
        fileName: 'photo.jpg',
        fileType: 'image/jpeg',
        fileSize: 1024,
        publicKey: env.IMAGEKIT_PUBLIC_KEY,
      }),
      env,
      {} as ExecutionContext,
    )
    const result = (await response.json()) as {
      uploadPayload: Record<string, string>
    }
    expect(result.uploadPayload.folder).toContain('/owner-1/')
    expect(result.uploadPayload.folder).not.toContain('attacker')
  })

  it('remove somente uma referência ImageKit persistida para o UID e finalidade', async () => {
    const deps = dependencies()
    const worker = createImageKitWorker(deps)
    const response = await worker.fetch!(
      request('/api/imagekit/files/client-file', 'DELETE', {
        ownerId: 'another-user',
        purpose: 'CLIENT_AVATAR',
      }),
      env,
      {} as ExecutionContext,
    )
    expect(response.status).toBe(204)
    expect(deps.deleteImage).toHaveBeenCalledWith(
      env.IMAGEKIT_PRIVATE_KEY,
      'client-file',
    )
  })

  it('prepara a remocao sem excluir e permite concluir depois de limpar o Firestore', async () => {
    const deps = dependencies()
    const worker = createImageKitWorker(deps)
    const prepared = await worker.fetch!(
      request('/api/imagekit/files/client-file', 'DELETE', {
        purpose: 'CLIENT_AVATAR',
        prepareOnly: true,
      }),
      env,
      {} as ExecutionContext,
    )

    expect(prepared.status).toBe(200)
    expect(deps.deleteImage).not.toHaveBeenCalled()
    const authorization = (await prepared.json()) as {
      deletionGrant: string
      deletionProviderId: string
    }
    expect(authorization.deletionProviderId).toBe('client-file')

    deps.fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }))
    const removed = await worker.fetch!(
      request('/api/imagekit/files/client-file', 'DELETE', {
        purpose: 'CLIENT_AVATAR',
        deletionGrant: authorization.deletionGrant,
      }),
      env,
      {} as ExecutionContext,
    )

    expect(removed.status).toBe(204)
    expect(deps.deleteImage).toHaveBeenCalledWith(
      env.IMAGEKIT_PRIVATE_KEY,
      'client-file',
    )
  })

  it('recusa preparar a remocao para outro proprietario ou finalidade', async () => {
    const deps = dependencies('another-user')
    const worker = createImageKitWorker(deps)

    const response = await worker.fetch!(
      request('/api/imagekit/files/client-file', 'DELETE', {
        purpose: 'CLIENT_AVATAR',
        prepareOnly: true,
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(403)
    expect(deps.deleteImage).not.toHaveBeenCalled()
  })

  it('isola a remoção do avatar profissional por proprietário e finalidade', async () => {
    const deps = dependencies()
    const worker = createImageKitWorker(deps)
    const allowed = await worker.fetch!(
      request('/api/imagekit/files/professional-file', 'DELETE', {
        ownerId: 'another-user',
        purpose: 'PROFESSIONAL_AVATAR',
      }),
      env,
      {} as ExecutionContext,
    )
    expect(allowed.status).toBe(204)
    expect(deps.deleteImage).toHaveBeenCalledWith(
      env.IMAGEKIT_PRIVATE_KEY,
      'professional-file',
    )

    const wrongPurpose = await worker.fetch!(
      request('/api/imagekit/files/professional-file', 'DELETE', {
        purpose: 'CLIENT_AVATAR',
      }),
      env,
      {} as ExecutionContext,
    )
    expect(wrongPurpose.status).toBe(403)
  })

  it('trata como sucesso a remoção de arquivo que já não existe no ImageKit', async () => {
    const deps = dependencies()
    deps.deleteImage.mockRejectedValueOnce(
      Object.assign(new Error('file not found'), { status: 404 }),
    )
    const worker = createImageKitWorker(deps)

    const response = await worker.fetch!(
      request('/api/imagekit/files/professional-file', 'DELETE', {
        purpose: 'PROFESSIONAL_AVATAR',
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(204)
    expect(deps.deleteImage).toHaveBeenCalledOnce()
  })

  it('mantém falha real do ImageKit como erro do provedor', async () => {
    const deps = dependencies()
    deps.deleteImage.mockRejectedValueOnce(
      Object.assign(new Error('provider unavailable'), { status: 503 }),
    )
    const worker = createImageKitWorker(deps)

    const response = await worker.fetch!(
      request('/api/imagekit/files/professional-file', 'DELETE', {
        purpose: 'PROFESSIONAL_AVATAR',
      }),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(502)
  })

  it('impede excluir arquivo persistido por outro usuário', async () => {
    const deps = dependencies('another-user')
    const worker = createImageKitWorker(deps)
    const response = await worker.fetch!(
      request('/api/imagekit/files/client-file', 'DELETE', {
        purpose: 'CLIENT_AVATAR',
      }),
      env,
      {} as ExecutionContext,
    )
    expect(response.status).toBe(403)
    expect(deps.deleteImage).not.toHaveBeenCalled()
  })

  it('fica indisponível sem a chave privada', async () => {
    const worker = createImageKitWorker(dependencies())
    const response = await worker.fetch!(
      request('/api/imagekit/auth', 'POST', {
        purpose: 'CLIENT_AVATAR',
        fileName: 'avatar.jpg',
        fileType: 'image/jpeg',
        fileSize: 1024,
        publicKey: env.IMAGEKIT_PUBLIC_KEY,
      }),
      { ...env, IMAGEKIT_PRIVATE_KEY: '' },
      {} as ExecutionContext,
    )
    expect(response.status).toBe(503)
  })
})
