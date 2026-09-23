import { describe, expect, it, vi } from 'vitest'

import { ImageProviderError, type ImageProvider } from '../providers/image-provider'
import { IMAGE_PURPOSES, type ImageReference } from '../types/image'
import {
  PROFESSIONAL_IMAGE_MAX_SIZE_BYTES,
  ProfessionalImageError,
  removeImageReference,
  replaceImageReference,
  uploadImageReference,
  uploadProfessionalImage,
  validateProfessionalImageFile,
} from './professional-images.service'

function imageFile(
  name = 'servico.webp',
  type = 'image/webp',
  size = 32,
) {
  return new File([new Uint8Array(size)], name, { type })
}

function provider(): ImageProvider {
  return {
    name: 'test',
    configured: true,
    upload: vi.fn().mockResolvedValue({
      provider: 'IMAGEKIT',
      url: 'https://images.example/upload.webp',
      providerId: 'image-upload',
    }),
    retry: vi.fn().mockResolvedValue({
      provider: 'IMAGEKIT',
      url: 'https://images.example/retry.webp',
      providerId: 'image-retry',
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  }
}

function reference(
  purpose: ImageReference['purpose'],
  ownerId = 'owner-1',
): ImageReference {
  return {
    provider: 'IMAGEKIT',
    ownerId,
    purpose,
    url: 'https://images.example/previous.webp',
    providerId: 'image-previous',
    createdAt: 100,
    updatedAt: 100,
  }
}

describe('professional images service', () => {
  it('valida tipo, tamanho e limite antes de chamar o provedor', async () => {
    const imageProvider = provider()

    expect(() =>
      validateProfessionalImageFile(
        imageFile('arquivo.gif', 'image/gif'),
        'PROFESSIONAL_AVATAR',
      ),
    ).toThrowError(ProfessionalImageError)
    expect(() =>
      validateProfessionalImageFile(
        imageFile(
          'grande.jpg',
          'image/jpeg',
          PROFESSIONAL_IMAGE_MAX_SIZE_BYTES + 1,
        ),
        'CLIENT_AVATAR',
      ),
    ).toThrow(/5 MB/i)
    await expect(
      uploadImageReference(
        imageProvider,
        {
          ownerId: 'owner-1',
          file: imageFile(),
          purpose: 'PROFESSIONAL_PORTFOLIO',
        },
        { currentPortfolioCount: 3 },
      ),
    ).rejects.toMatchObject({ code: 'portfolio-limit' })
    expect(imageProvider.upload).not.toHaveBeenCalled()
  })

  it.each(IMAGE_PURPOSES)(
    'cobre upload, retry, remoção e substituição isolados para %s',
    async (purpose) => {
      const imageProvider = provider()
      const request = { ownerId: 'owner-1', file: imageFile(), purpose }

      const uploaded = await uploadImageReference(imageProvider, request, {
        now: () => 200,
      })
      const retried = await uploadImageReference(imageProvider, request, {
        retry: true,
        now: () => 300,
      })
      await removeImageReference(
        imageProvider,
        uploaded,
        'owner-1',
        purpose,
      )
      const replacement = await replaceImageReference(
        imageProvider,
        reference(purpose),
        request,
        {
          now: () => 400,
          persistReplacement: vi.fn(async () => undefined),
        },
      )

      expect(uploaded).toMatchObject({
        ownerId: 'owner-1',
        purpose,
        createdAt: 200,
        updatedAt: 200,
      })
      expect(retried).toMatchObject({
        ownerId: 'owner-1',
        purpose,
        providerId: 'image-retry',
      })
      expect(replacement).toMatchObject({
        ownerId: 'owner-1',
        purpose,
        createdAt: 400,
      })
      expect(imageProvider.retry).toHaveBeenCalledWith(request)
      expect(imageProvider.remove).toHaveBeenCalledWith({
        ownerId: 'owner-1',
        purpose,
        providerId: 'image-previous',
      })
    },
  )

  it('recusa proprietário ou finalidade incompatível antes de acessar o provedor', async () => {
    const imageProvider = provider()
    const clientAvatar = reference('CLIENT_AVATAR')

    await expect(
      removeImageReference(
        imageProvider,
        clientAvatar,
        'owner-2',
        'CLIENT_AVATAR',
      ),
    ).rejects.toMatchObject({ code: 'scope-mismatch' })
    await expect(
      replaceImageReference(
        imageProvider,
        clientAvatar,
        {
          ownerId: 'owner-1',
          file: imageFile(),
          purpose: 'PROFESSIONAL_AVATAR',
        },
        { persistReplacement: vi.fn(async () => undefined) },
      ),
    ).rejects.toMatchObject({ code: 'scope-mismatch' })
    expect(imageProvider.upload).not.toHaveBeenCalled()
    expect(imageProvider.remove).not.toHaveBeenCalled()
  })

  it('mantém estado recuperável quando a substituição envia a nova imagem mas não remove a anterior', async () => {
    const imageProvider = provider()
    const persistReplacement = vi.fn(async () => undefined)
    vi.mocked(imageProvider.remove).mockRejectedValueOnce(
      new ImageProviderError('removal-failed', 'Falha ao remover.'),
    )

    await expect(
      replaceImageReference(
        imageProvider,
        reference('CLIENT_AVATAR'),
        {
          ownerId: 'owner-1',
          file: imageFile(),
          purpose: 'CLIENT_AVATAR',
        },
        { now: () => 500, persistReplacement },
      ),
    ).rejects.toMatchObject({
      code: 'replacement-failed',
      recoveryReference: {
        ownerId: 'owner-1',
        purpose: 'CLIENT_AVATAR',
        providerId: 'image-upload',
        createdAt: 500,
      },
    })
    expect(persistReplacement).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'image-upload' }),
    )
  })

  it('preserva a imagem anterior quando a persistência da substituta falha', async () => {
    const imageProvider = provider()

    await expect(
      replaceImageReference(
        imageProvider,
        reference('CLIENT_AVATAR'),
        {
          ownerId: 'owner-1',
          file: imageFile(),
          purpose: 'CLIENT_AVATAR',
        },
        {
          now: () => 600,
          persistReplacement: vi.fn(async () => {
            throw new Error('Falha ao persistir.')
          }),
        },
      ),
    ).rejects.toMatchObject({
      code: 'replacement-failed',
      recoveryReference: { providerId: 'image-upload' },
    })
    expect(imageProvider.remove).not.toHaveBeenCalled()
  })

  it('retorna metadados profissionais sem arquivo bruto', async () => {
    const imageProvider = provider()
    const result = await uploadProfessionalImage(
      imageProvider,
      {
        ownerId: 'owner-1',
        file: imageFile(),
        purpose: 'PROFESSIONAL_PORTFOLIO',
      },
      {
        order: 2,
        altText: '  Quadro elétrico organizado  ',
        now: () => 600,
      },
    )

    expect(result).toEqual({
      provider: 'IMAGEKIT',
      ownerId: 'owner-1',
      purpose: 'PROFESSIONAL_PORTFOLIO',
      url: 'https://images.example/upload.webp',
      providerId: 'image-upload',
      createdAt: 600,
      updatedAt: 600,
      order: 2,
      altText: 'Quadro elétrico organizado',
    })
    expect(result).not.toHaveProperty('file')
    expect(result).not.toHaveProperty('base64')
  })

  it('não transforma URL blob ou resposta incompleta em referência persistível', async () => {
    const imageProvider = provider()
    vi.mocked(imageProvider.upload).mockResolvedValueOnce({
      provider: 'IMAGEKIT',
      url: 'blob:local-preview',
      providerId: 'blob-avatar',
    })
    await expect(
      uploadImageReference(imageProvider, {
        ownerId: 'owner-1',
        file: imageFile(),
        purpose: 'CLIENT_AVATAR',
      }),
    ).rejects.toMatchObject({ code: 'upload-failed' })

    vi.mocked(imageProvider.upload).mockResolvedValueOnce({
      provider: 'IMAGEKIT',
      url: 'https://images.example/client.webp',
      providerId: '   ',
    })
    await expect(
      uploadImageReference(imageProvider, {
        ownerId: 'owner-1',
        file: imageFile(),
        purpose: 'CLIENT_AVATAR',
      }),
    ).rejects.toMatchObject({ code: 'upload-failed' })
  })
})
