import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
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
    exists,
  }: SaveProfessionalProfileInput): Promise<void> {
    const firestore = getFirebaseFirestore()
    const profileReference = doc(firestore, 'professionalProfiles', userId)
    const privateProfileReference = doc(
      firestore,
      'professionalPrivateProfiles',
      userId,
    )
    const userReference = doc(firestore, 'users', userId)
    const batch = writeBatch(firestore)
    const timestamp = serverTimestamp()

    const {
      phone,
      privateLocation,
      ...publicProfile
    } = profile
    const profileData = {
      ownerId: userId,
      ...publicProfile,
      selectedCityIbgeCodes: profile.selectedCities.map(
        (location) => location.ibgeCode,
      ),
      status,
      updatedAt: timestamp,
    }

    if (exists) {
      batch.update(profileReference, {
        ...profileData,
        phone:
          profile.contactVisibility === 'PUBLIC' ? phone : deleteField(),
      })
    } else {
      batch.set(profileReference, {
        ...profileData,
        ...(profile.contactVisibility === 'PUBLIC' ? { phone } : {}),
        createdAt: timestamp,
      })
    }
    batch.set(privateProfileReference, {
      ownerId: userId,
      phone,
      privateLocation,
      updatedAt: timestamp,
    })
    batch.update(userReference, {
      professionalProfileStatus: userProfileStatusFor(status),
      updatedAt: timestamp,
    })

    await batch.commit()
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
