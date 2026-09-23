import {
  ImageProviderError,
  type ImageProvider,
  type ImageUploadRequest,
} from '../providers/image-provider'
import type { ImagePurpose, ImageReference } from '../types/image'
import type { ProfessionalImageMetadata } from '../types/professional-profile'

export const PROFESSIONAL_IMAGE_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const PROFESSIONAL_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024
export const PROFESSIONAL_PORTFOLIO_MAX_IMAGES = 3
export const PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH = 240

export type ProfessionalImageErrorCode =
  | 'invalid-type'
  | 'invalid-size'
  | 'portfolio-limit'
  | 'scope-mismatch'
  | 'provider-unavailable'
  | 'upload-failed'
  | 'removal-failed'
  | 'replacement-failed'

export class ProfessionalImageError extends Error {
  constructor(
    public readonly code: ProfessionalImageErrorCode,
    message: string,
    options?: ErrorOptions & { recoveryReference?: ImageReference },
  ) {
    super(message, options)
    this.name = 'ProfessionalImageError'
    this.recoveryReference = options?.recoveryReference
  }

  readonly recoveryReference?: ImageReference
}

function providerError(
  error: unknown,
  operation: 'upload' | 'remove',
): ProfessionalImageError {
  if (error instanceof ProfessionalImageError) return error
  if (error instanceof ImageProviderError && error.code === 'not-configured') {
    return new ProfessionalImageError('provider-unavailable', error.message, {
      cause: error,
    })
  }
  if (error instanceof ImageProviderError && error.code === 'scope-mismatch') {
    return new ProfessionalImageError('scope-mismatch', error.message, {
      cause: error,
    })
  }
  if (error instanceof ImageProviderError) {
    return new ProfessionalImageError(
      operation === 'upload' ? 'upload-failed' : 'removal-failed',
      error.message,
      { cause: error },
    )
  }
  return new ProfessionalImageError(
    operation === 'upload' ? 'upload-failed' : 'removal-failed',
    operation === 'upload'
      ? 'Não foi possível enviar a imagem. Tente novamente.'
      : 'Não foi possível remover a imagem. Tente novamente.',
    { cause: error },
  )
}

export function validateProfessionalImageFile(
  file: File,
  purpose: ImagePurpose,
  currentPortfolioCount = 0,
) {
  if (
    !PROFESSIONAL_IMAGE_ACCEPTED_TYPES.includes(
      file.type as (typeof PROFESSIONAL_IMAGE_ACCEPTED_TYPES)[number],
    )
  ) {
    throw new ProfessionalImageError(
      'invalid-type',
      'Use uma imagem JPEG, PNG ou WebP.',
    )
  }
  if (file.size <= 0 || file.size > PROFESSIONAL_IMAGE_MAX_SIZE_BYTES) {
    throw new ProfessionalImageError(
      'invalid-size',
      'A imagem deve ter no máximo 5 MB.',
    )
  }
  if (
    purpose === 'PROFESSIONAL_PORTFOLIO' &&
    currentPortfolioCount >= PROFESSIONAL_PORTFOLIO_MAX_IMAGES
  ) {
    throw new ProfessionalImageError(
      'portfolio-limit',
      `Adicione no máximo ${PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens ao portfólio.`,
    )
  }
}

export function assertImageReferenceScope(
  reference: ImageReference,
  ownerId: string,
  purpose: ImagePurpose,
) {
  if (reference.ownerId !== ownerId || reference.purpose !== purpose) {
    throw new ProfessionalImageError(
      'scope-mismatch',
      'A imagem não pertence ao proprietário e à finalidade informados.',
    )
  }
}

export async function uploadImageReference(
  provider: ImageProvider,
  request: ImageUploadRequest,
  options: {
    retry?: boolean
    currentPortfolioCount?: number
    now?: () => number
  } = {},
): Promise<ImageReference> {
  validateProfessionalImageFile(
    request.file,
    request.purpose,
    options.currentPortfolioCount,
  )

  try {
    const result = options.retry
      ? await provider.retry(request)
      : await provider.upload(request)
    if (
      !result.url.startsWith('https://') ||
      !result.providerId.trim()
    ) {
      throw new ProfessionalImageError(
        'upload-failed',
        'O provedor não retornou uma URL HTTPS e um identificador válidos.',
      )
    }
    const timestamp = (options.now ?? Date.now)()
    return {
      provider: result.provider,
      ownerId: request.ownerId,
      purpose: request.purpose,
      url: result.url,
      providerId: result.providerId.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  } catch (error) {
    throw providerError(error, 'upload')
  }
}

export async function uploadProfessionalImage(
  provider: ImageProvider,
  request: ImageUploadRequest,
  options: {
    retry?: boolean
    order?: number
    altText?: string
    currentPortfolioCount?: number
    now?: () => number
  } = {},
): Promise<ProfessionalImageMetadata> {
  const reference = await uploadImageReference(provider, request, options)
  return {
    ...reference,
    order: options.order ?? 0,
    altText: options.altText?.trim() ?? '',
  }
}

export async function removeImageReference(
  provider: ImageProvider,
  reference: ImageReference,
  ownerId: string,
  purpose: ImagePurpose,
) {
  assertImageReferenceScope(reference, ownerId, purpose)
  try {
    await provider.remove({ ownerId, purpose, providerId: reference.providerId })
  } catch (error) {
    throw providerError(error, 'remove')
  }
}

export async function removeProfessionalImage(
  provider: ImageProvider,
  reference: ProfessionalImageMetadata,
  ownerId: string,
  purpose: ImagePurpose,
) {
  await removeImageReference(provider, reference, ownerId, purpose)
}

export async function replaceImageReference(
  provider: ImageProvider,
  previous: ImageReference,
  request: ImageUploadRequest,
  options: {
    persistReplacement(reference: ImageReference): Promise<void>
    retry?: boolean
    now?: () => number
  },
) {
  assertImageReferenceScope(previous, request.ownerId, request.purpose)
  const replacement = await uploadImageReference(
    provider,
    { ...request, previousReference: previous },
    options,
  )

  try {
    await options.persistReplacement(replacement)
  } catch (error) {
    throw new ProfessionalImageError(
      'replacement-failed',
      'A nova imagem foi enviada, mas não pôde ser persistida. A imagem anterior foi preservada.',
      { cause: error, recoveryReference: replacement },
    )
  }

  if (previous.provider !== replacement.provider) return replacement

  try {
    await removeImageReference(
      provider,
      previous,
      request.ownerId,
      request.purpose,
    )
  } catch (error) {
    throw new ProfessionalImageError(
      'replacement-failed',
      'A nova imagem foi enviada, mas a anterior não pôde ser removida. Tente a limpeza novamente.',
      { cause: error, recoveryReference: replacement },
    )
  }

  return replacement
}
