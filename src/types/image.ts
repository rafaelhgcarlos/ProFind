export const IMAGE_PURPOSES = [
  'CLIENT_AVATAR',
  'PROFESSIONAL_AVATAR',
  'PROFESSIONAL_PORTFOLIO',
] as const

export type ImagePurpose = (typeof IMAGE_PURPOSES)[number]

export interface ImageReference {
  ownerId: string
  purpose: ImagePurpose
  url: string
  providerId: string
  createdAt: number
  updatedAt: number
}

export function isImagePurpose(value: unknown): value is ImagePurpose {
  return (
    typeof value === 'string' &&
    IMAGE_PURPOSES.includes(value as ImagePurpose)
  )
}
