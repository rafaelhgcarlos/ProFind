export const IMAGE_PURPOSES = [
  'CLIENT_AVATAR',
  'PROFESSIONAL_AVATAR',
  'PROFESSIONAL_PORTFOLIO',
] as const

export type ImagePurpose = (typeof IMAGE_PURPOSES)[number]

export const IMAGE_PROVIDERS = ['IMAGEKIT', 'BACKEND', 'MOCK', 'LEGACY'] as const

export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number]

export interface ImageReference {
  provider: ImageProviderId
  ownerId: string
  purpose: ImagePurpose
  url: string
  providerId: string
  createdAt: number
  updatedAt: number
}

export function isImageProviderId(value: unknown): value is ImageProviderId {
  return (
    typeof value === 'string' &&
    IMAGE_PROVIDERS.includes(value as ImageProviderId)
  )
}

export function isImagePurpose(value: unknown): value is ImagePurpose {
  return (
    typeof value === 'string' &&
    IMAGE_PURPOSES.includes(value as ImagePurpose)
  )
}
