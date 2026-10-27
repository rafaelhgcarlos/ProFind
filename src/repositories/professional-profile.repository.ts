import {
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import type { ImageProviderId, ImagePurpose } from '../types/image'
import {
  professionalReviewReasonCode,
  reviewEventId,
  type ProfessionalReviewStatus,
} from '../types/professional-review'
import type { ProfessionalProfileStatus as UserProfessionalProfileStatus } from '../features/onboarding/user-role'
import {
  isProfessionalAvailability,
  isProfessionalContactVisibility,
  isProfessionalProfileStatus,
  isProfessionalServiceMode,
  type ProfessionalAvailability,
  type ProfessionalProfile,
  type ProfessionalProfileInput,
  type ProfessionalProfileStatus,
  type ProfessionalBaseLocation,
  type ProfessionalImageMetadata,
  type ProfessionalPrivateLocation,
} from '../types/professional-profile'

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : []
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isPermissionDenied(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }

  return (
    error.code === 'permission-denied' ||
    error.code === 'firestore/permission-denied'
  )
}

function professionalBaseLocation(value: unknown): ProfessionalBaseLocation {
  if (typeof value !== 'object' || value === null) {
    return { city: '', stateCode: '', ibgeCode: '' }
  }

  const location = value as Record<string, unknown>
  return {
    city: typeof location.city === 'string' ? location.city : '',
    stateCode:
      typeof location.stateCode === 'string' ? location.stateCode : '',
    ibgeCode: typeof location.ibgeCode === 'string' ? location.ibgeCode : '',
  }
}

function professionalBaseLocations(value: unknown): ProfessionalBaseLocation[] {
  if (!Array.isArray(value)) return []

  const locations = value
    .map(professionalBaseLocation)
    .filter((location) => location.ibgeCode)
  return locations.filter(
    (location, index) =>
      locations.findIndex(
        (candidate) => candidate.ibgeCode === location.ibgeCode,
      ) === index,
  )
}

function professionalImage(
  value: unknown,
  fallbackOrder: number,
  ownerId: string,
  purpose: ImagePurpose,
): ProfessionalImageMetadata | null {
  if (typeof value !== 'object' || value === null) return null

  const image = value as Record<string, unknown>
  const provider: ImageProviderId | null =
    image.provider === undefined
      ? 'LEGACY'
      : image.provider === 'IMAGEKIT' || image.provider === 'BACKEND'
        ? image.provider
        : null
  if (
    !provider ||
    typeof image.url !== 'string' ||
    !image.url.startsWith('https://') ||
    image.url.length > 2_048 ||
    typeof image.providerId !== 'string' ||
    !image.providerId.trim() ||
    image.providerId.length > 300 ||
    image.ownerId !== ownerId ||
    image.purpose !== purpose ||
    typeof image.createdAt !== 'number' ||
    !Number.isSafeInteger(image.createdAt) ||
    typeof image.updatedAt !== 'number' ||
    !Number.isSafeInteger(image.updatedAt)
  ) {
    return null
  }

  return {
    provider,
    ownerId,
    purpose,
    url: image.url.trim(),
    providerId: image.providerId.trim(),
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    order:
      typeof image.order === 'number' && Number.isSafeInteger(image.order)
        ? image.order
        : fallbackOrder,
    altText: typeof image.altText === 'string' ? image.altText : '',
  }
}

function persistedProfessionalImage(image: ProfessionalImageMetadata | null) {
  if (!image || image.provider !== 'LEGACY') return image
  return {
    ownerId: image.ownerId,
    purpose: image.purpose,
    url: image.url,
    providerId: image.providerId,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    order: image.order,
    altText: image.altText,
  }
}

function professionalImages(
  value: unknown,
  ownerId: string,
): ProfessionalImageMetadata[] {
  if (!Array.isArray(value)) return []

  return value
    .map((image, index) =>
      professionalImage(
        image,
        index,
        ownerId,
        'PROFESSIONAL_PORTFOLIO',
      ),
    )
    .filter((image): image is ProfessionalImageMetadata => image !== null)
    .sort((first, second) => first.order - second.order)
}

function professionalPrivateLocation(value: unknown): ProfessionalPrivateLocation {
  if (typeof value !== 'object' || value === null) {
    return { postalCode: '' }
  }

  const location = value as Record<string, unknown>
  const neighborhood =
    typeof location.neighborhood === 'string'
      ? location.neighborhood
      : undefined

  return {
    postalCode:
      typeof location.postalCode === 'string' ? location.postalCode : '',
    ...(neighborhood ? { neighborhood } : {}),
  }
}

export interface SaveProfessionalProfileInput {
  userId: string
  profile: ProfessionalProfileInput
  status: Exclude<ProfessionalProfileStatus, 'SUSPENDED'>
  exists: boolean
}

function userProfileStatusFor(
  status: Exclude<ProfessionalProfileStatus, 'SUSPENDED'>,
): UserProfessionalProfileStatus {
  return status === 'DRAFT' ? 'incomplete' : 'complete'
}

function reviewedProjection(data: Record<string, unknown>) {
  const stringList = (value: unknown, sort = false) => {
    const values = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
    return sort ? [...values].sort() : values
  }
  const location = (value: unknown) => {
    const current =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {}
    return [current.city ?? '', current.stateCode ?? '', current.ibgeCode ?? '']
  }
  const locations = Array.isArray(data.selectedCities)
    ? data.selectedCities.map(location).sort((first, second) =>
        String(first[2]).localeCompare(String(second[2])),
      )
    : []
  const image = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return null
    const current = value as Record<string, unknown>
    return [
      current.provider ?? 'LEGACY',
      current.ownerId ?? '',
      current.purpose ?? '',
      current.url ?? '',
      current.providerId ?? '',
      current.createdAt ?? 0,
      current.updatedAt ?? 0,
      current.order ?? 0,
      current.altText ?? '',
    ]
  }

  return {
    publicName: data.publicName ?? '',
    headline: data.headline ?? '',
    bio: data.bio ?? '',
    categoryIds: stringList(data.categoryIds, true),
    specialtyIds: stringList(data.specialtyIds, true),
    experienceYears: data.experienceYears ?? null,
    baseLocation: location(data.baseLocation),
    serviceMode: data.serviceMode ?? null,
    serviceRadiusKm: data.serviceRadiusKm ?? null,
    selectedCities: locations,
    selectedCityIbgeCodes: stringList(data.selectedCityIbgeCodes, true),
    profileImage: image(data.profileImage),
    portfolioImages: Array.isArray(data.portfolioImages)
      ? data.portfolioImages.map(image)
      : [],
  }
}

function hasRelevantProfileChange(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  return JSON.stringify(reviewedProjection(current)) !== JSON.stringify(reviewedProjection(next))
}

function nextReviewStatus(
  current: ProfessionalReviewStatus,
  status: Exclude<ProfessionalProfileStatus, 'SUSPENDED'>,
  relevantChange: boolean,
) {
  if (current === 'REJECTED' || current === 'SUSPENDED') return current
  if (current === 'APPROVED' && relevantChange) return 'UNDER_REVIEW'
  if (current === 'UNDER_REVIEW') return 'UNDER_REVIEW'
  if (status === 'PUBLISHED' && ['DRAFT', 'CHANGES_REQUESTED'].includes(current)) {
    return 'UNDER_REVIEW'
  }
  return current
}

function profileReviewAction(
  current: ProfessionalReviewStatus,
  next: ProfessionalReviewStatus,
  relevantChange: boolean,
) {
  if (current === 'APPROVED' && relevantChange) return 'REANALYSIS_REQUIRED' as const
  if (next === 'UNDER_REVIEW' && current === 'DRAFT') return 'PROFILE_SUBMITTED' as const
  if (next === 'UNDER_REVIEW' && current === 'CHANGES_REQUESTED') {
    return 'PROFILE_RESUBMITTED' as const
  }
  if (current === 'UNDER_REVIEW' && relevantChange) {
    return 'REANALYSIS_REQUIRED' as const
  }
  return 'PROFILE_UPDATED' as const
}

export const professionalProfileRepository = {
  async findByOwnerId(userId: string): Promise<ProfessionalProfile | null> {
    const firestore = getFirebaseFirestore()
    const [snapshot, privateSnapshot] = await Promise.all([
      getDoc(doc(firestore, 'professionalProfiles', userId)),
      getDoc(doc(firestore, 'professionalPrivateProfiles', userId)).catch(
        (error: unknown) => {
          // Mantém a edição de perfis legados disponível durante a janela entre
          // a publicação do cliente e a atualização das Security Rules.
          if (isPermissionDenied(error)) return null
          throw error
        },
      ),
    ])

    if (!snapshot.exists()) return null

    const data = snapshot.data()
    const privateData = privateSnapshot?.exists() ? privateSnapshot.data() : {}
    const serviceMode = isProfessionalServiceMode(data.serviceMode)
      ? data.serviceMode
      : null
    const storedStatus = isProfessionalProfileStatus(data.status)
      ? data.status
      : 'DRAFT'

    return {
      userId,
      publicName: typeof data.publicName === 'string' ? data.publicName : '',
      headline: typeof data.headline === 'string' ? data.headline : '',
      bio: typeof data.bio === 'string' ? data.bio : '',
      categoryIds: stringArray(data.categoryIds),
      specialtyIds: stringArray(data.specialtyIds),
      experienceYears: nullableNumber(data.experienceYears),
      baseLocation: professionalBaseLocation(data.baseLocation),
      serviceMode,
      serviceRadiusKm: nullableNumber(data.serviceRadiusKm),
      selectedCities: professionalBaseLocations(data.selectedCities),
      availability: isProfessionalAvailability(data.availability)
        ? data.availability
        : 'AVAILABLE',
      phone:
        typeof privateData.phone === 'string'
          ? privateData.phone
          : typeof data.phone === 'string'
            ? data.phone
            : '',
      contactVisibility: isProfessionalContactVisibility(data.contactVisibility)
        ? data.contactVisibility
        : 'PRIVATE',
      privateLocation: professionalPrivateLocation(privateData.privateLocation),
      profileImage: professionalImage(
        data.profileImage,
        0,
        userId,
        'PROFESSIONAL_AVATAR',
      ),
      portfolioImages: professionalImages(data.portfolioImages, userId),
      status:
        storedStatus === 'SUSPENDED' || serviceMode !== null
          ? storedStatus
          : 'DRAFT',
      rating: optionalNumber(data.rating),
      reviewCount: optionalNumber(data.reviewCount),
      completedJobsCount: optionalNumber(data.completedJobsCount),
    }
  },

  async save({
    userId,
    profile,
    status,
  }: SaveProfessionalProfileInput): Promise<void> {
    const firestore = getFirebaseFirestore()
    const profileReference = doc(firestore, 'professionalProfiles', userId)
    const privateProfileReference = doc(
      firestore,
      'professionalPrivateProfiles',
      userId,
    )
    const userReference = doc(firestore, 'users', userId)
    const {
      phone,
      privateLocation,
      ...publicProfile
    } = profile
    const profileData = {
      ownerId: userId,
      ...publicProfile,
      profileImage: persistedProfessionalImage(publicProfile.profileImage),
      portfolioImages: publicProfile.portfolioImages.map((image) =>
        persistedProfessionalImage(image),
      ),
      selectedCityIbgeCodes: profile.selectedCities.map(
        (location) => location.ibgeCode,
      ),
      status,
    }
    const operationalReference = doc(
      firestore,
      'professionalOperationalProfiles',
      userId,
    )

    await runTransaction(firestore, async (transaction) => {
      const [profileSnapshot, operationalSnapshot] = await Promise.all([
        transaction.get(profileReference),
        transaction.get(operationalReference),
      ])
      const timestamp = serverTimestamp()
      const currentProfile = profileSnapshot.exists()
        ? profileSnapshot.data()
        : undefined
      const relevantChange = currentProfile
        ? hasRelevantProfileChange(currentProfile, profileData)
        : true

      if (profileSnapshot.exists()) {
        transaction.update(profileReference, {
          ...profileData,
          phone:
            profile.contactVisibility === 'PUBLIC' ? phone : deleteField(),
          updatedAt: timestamp,
        })
      } else {
        transaction.set(profileReference, {
          ...profileData,
          ...(profile.contactVisibility === 'PUBLIC' ? { phone } : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }
      transaction.set(privateProfileReference, {
        ownerId: userId,
        phone,
        privateLocation,
        updatedAt: timestamp,
      })
      transaction.update(userReference, {
        professionalProfileStatus: userProfileStatusFor(status),
        updatedAt: timestamp,
      })

      const currentOperational = operationalSnapshot.exists()
        ? operationalSnapshot.data()
        : undefined
      const currentStatus = (currentOperational?.reviewStatus ??
        'DRAFT') as ProfessionalReviewStatus
      const profileVersion = currentOperational
        ? Number(currentOperational.profileVersion) + (relevantChange ? 1 : 0)
        : 1
      const reviewStatus = nextReviewStatus(
        currentStatus,
        status,
        relevantChange,
      )
      const shouldRecordReview =
        !currentOperational ||
        relevantChange ||
        reviewStatus !== currentStatus

      if (!shouldRecordReview) return

      const revision = currentOperational
        ? Number(currentOperational.revision ?? 0) + 1
        : 1
      const eventId = reviewEventId(revision)
      const action = profileReviewAction(
        currentStatus,
        reviewStatus,
        relevantChange,
      )
      const submittedVersion =
        reviewStatus === 'UNDER_REVIEW' ? profileVersion : null
      const operationalData = {
        schemaVersion: 1,
        professionalId: userId,
        reviewStatus,
        active: currentOperational?.active === true,
        profileVersion,
        submittedVersion,
        approvedVersion:
          typeof currentOperational?.approvedVersion === 'number'
            ? currentOperational.approvedVersion
            : null,
        revision,
        lastEventId: eventId,
        professionalFeedback:
          reviewStatus === 'UNDER_REVIEW'
            ? null
            : typeof currentOperational?.professionalFeedback === 'string'
              ? currentOperational.professionalFeedback
              : null,
        approvedCategoryIds: stringArray(currentOperational?.approvedCategoryIds),
        approvedSpecialtyIds: stringArray(currentOperational?.approvedSpecialtyIds),
        approvedBaseCityIbgeCode:
          typeof currentOperational?.approvedBaseCityIbgeCode === 'string'
            ? currentOperational.approvedBaseCityIbgeCode
            : '',
        approvedSelectedCityIbgeCodes: stringArray(
          currentOperational?.approvedSelectedCityIbgeCodes,
        ),
        eligibleCityIbgeCodes: stringArray(currentOperational?.eligibleCityIbgeCodes),
        updatedAt: timestamp,
      }
      transaction.set(operationalReference, operationalData)
      transaction.set(doc(operationalReference, 'events', eventId), {
        eventId,
        entityType: 'PROFESSIONAL',
        entityId: userId,
        professionalId: userId,
        actorId: userId,
        actorRole: 'PROFESSIONAL',
        action,
        reasonCode: professionalReviewReasonCode(action),
        fromStatus: currentStatus,
        toStatus: reviewStatus,
        profileVersion,
        reviewedVersion: null,
        reason: null,
        createdAt: timestamp,
      })
    })
  },

  async updateAvailability(
    userId: string,
    availability: ProfessionalAvailability,
  ): Promise<void> {
    await updateDoc(
      doc(getFirebaseFirestore(), 'professionalProfiles', userId),
      {
        availability,
        updatedAt: serverTimestamp(),
      },
    )
  },
}
