import { describe, expect, it, vi } from 'vitest'

import { IMAGE_PURPOSES } from '../types/image'
import { MockImageProvider } from './mock-image.provider'

const file = new File(['image'], 'profile.png', { type: 'image/png' })

describe('MockImageProvider', () => {
  it.each(IMAGE_PURPOSES)(
    'isola upload, retry e remoção para %s',
    async (purpose) => {
      const provider = new MockImageProvider({ uploadFailures: 1 })
      const onProgress = vi.fn()
      const request = { ownerId: 'owner-1', file, purpose, onProgress }

      await expect(provider.upload(request)).rejects.toMatchObject({
        code: 'upload-failed',
      })
      const uploaded = await provider.retry(request)

      expect(uploaded).toMatchObject({
        providerId: expect.stringContaining(purpose.toLowerCase()),
        url: expect.stringMatching(/^https:\/\//),
      })
      expect(onProgress).toHaveBeenCalledWith(10)
      expect(onProgress).toHaveBeenCalledWith(55)
      expect(onProgress).toHaveBeenCalledWith(100)
      await expect(
        provider.remove({
          ownerId: 'owner-1',
          purpose,
          providerId: uploaded.providerId,
        }),
      ).resolves.toBeUndefined()
    },
  )

  it('recusa remoção com proprietário ou finalidade incompatível', async () => {
    const provider = new MockImageProvider()
    const uploaded = await provider.upload({
      ownerId: 'owner-1',
      file,
      purpose: 'CLIENT_AVATAR',
    })

    await expect(
      provider.remove({
        ownerId: 'owner-2',
        purpose: 'CLIENT_AVATAR',
        providerId: uploaded.providerId,
      }),
    ).rejects.toMatchObject({ code: 'scope-mismatch' })
    await expect(
      provider.remove({
        ownerId: 'owner-1',
        purpose: 'PROFESSIONAL_AVATAR',
        providerId: uploaded.providerId,
      }),
    ).rejects.toMatchObject({ code: 'scope-mismatch' })
  })

  it('mantém avatar de cliente, avatar profissional e portfólio separados para a mesma conta', async () => {
    const provider = new MockImageProvider()
    const uploaded = await Promise.all(
      IMAGE_PURPOSES.map((purpose) =>
        provider.upload({ ownerId: 'owner-both', file, purpose }),
      ),
    )

    expect(new Set(uploaded.map((image) => image.providerId))).toHaveLength(3)
    await Promise.all(
      uploaded.map((image, index) =>
        provider.remove({
          ownerId: 'owner-both',
          purpose: IMAGE_PURPOSES[index],
          providerId: image.providerId,
        }),
      ),
    )
  })
})
