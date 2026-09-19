import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import type { ProfessionalProfileStatus as UserProfessionalProfileStatus } from '../features/onboarding/user-role'
import {
  isProfessionalAvailability,
  isProfessionalProfileStatus,
  isProfessionalServiceMode,
  type ProfessionalProfile,
  type ProfessionalProfileInput,
  type ProfessionalProfileStatus,
  type ProfessionalBaseLocation,
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

export const professionalProfileRepository = {
  async findByOwnerId(userId: string): Promise<ProfessionalProfile | null> {
    const snapshot = await getDoc(
      doc(getFirebaseFirestore(), 'professionalProfiles', userId),
    )

    if (!snapshot.exists()) return null

    const data = snapshot.data()

    return {
      userId,
      publicName: typeof data.publicName === 'string' ? data.publicName : '',
      headline: typeof data.headline === 'string' ? data.headline : '',
      bio: typeof data.bio === 'string' ? data.bio : '',
      categoryIds: stringArray(data.categoryIds),
      specialtyIds: stringArray(data.specialtyIds),
      experienceYears: nullableNumber(data.experienceYears),
      baseLocation: professionalBaseLocation(data.baseLocation),
      serviceMode: isProfessionalServiceMode(data.serviceMode)
        ? data.serviceMode
        : nullableNumber(data.serviceRadiusKm) !== null
          ? 'RADIUS'
          : 'CITY_ONLY',
      serviceRadiusKm: nullableNumber(data.serviceRadiusKm),
      selectedCities: professionalBaseLocations(data.selectedCities),
      availability: isProfessionalAvailability(data.availability)
        ? data.availability
        : 'AVAILABLE',
      status: isProfessionalProfileStatus(data.status) ? data.status : 'DRAFT',
      rating: optionalNumber(data.rating),
      reviewCount: optionalNumber(data.reviewCount),
      completedJobsCount: optionalNumber(data.completedJobsCount),
    }
  },

  async save({
    userId,
    profile,
    status,
    exists,
  }: SaveProfessionalProfileInput): Promise<void> {
    const firestore = getFirebaseFirestore()
    const profileReference = doc(firestore, 'professionalProfiles', userId)
    const userReference = doc(firestore, 'users', userId)
    const batch = writeBatch(firestore)
    const timestamp = serverTimestamp()

    batch.set(
      profileReference,
      {
        ownerId: userId,
        ...profile,
        status,
        ...(!exists ? { createdAt: timestamp } : {}),
        updatedAt: timestamp,
      },
      { merge: true },
    )
    batch.update(userReference, {
      professionalProfileStatus: userProfileStatusFor(status),
      updatedAt: timestamp,
    })

    await batch.commit()
  },
}
