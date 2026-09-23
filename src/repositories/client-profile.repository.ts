import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import type { ClientProfile, ClientProfileInput } from '../types/client-profile'
import type { ImageProviderId, ImageReference } from '../types/image'

function storedProvider(value: unknown): ImageProviderId | null {
  if (value === undefined) return 'LEGACY'
  return value === 'IMAGEKIT' || value === 'BACKEND' ? value : null
}

function clientAvatarReference(
  value: unknown,
  ownerId: string,
): ImageReference | null {
  if (typeof value !== 'object' || value === null) return null
  const image = value as Record<string, unknown>
  const provider = storedProvider(image.provider)
  if (
    !provider ||
    image.ownerId !== ownerId ||
    image.purpose !== 'CLIENT_AVATAR' ||
    typeof image.url !== 'string' ||
    !image.url.startsWith('https://') ||
    typeof image.providerId !== 'string' ||
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
    purpose: 'CLIENT_AVATAR',
    url: image.url,
    providerId: image.providerId,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  }
}

function persistedImageReference(image: ImageReference | null) {
  if (!image || image.provider !== 'LEGACY') return image
  return {
    ownerId: image.ownerId,
    purpose: image.purpose,
    url: image.url,
    providerId: image.providerId,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  }
}

export interface SaveClientProfileInput {
  userId: string
  profile: ClientProfileInput
  exists: boolean
}

export const clientProfileRepository = {
  async findByOwnerId(userId: string): Promise<ClientProfile | null> {
    const snapshot = await getDoc(
      doc(getFirebaseFirestore(), 'clientProfiles', userId),
    )
    if (!snapshot.exists()) return null

    const data = snapshot.data()
    return {
      userId,
      phone: typeof data.phone === 'string' ? data.phone : '',
      profileImage: clientAvatarReference(data.profileImage, userId),
    }
  },

  async save({ userId, profile, exists }: SaveClientProfileInput) {
    const firestore = getFirebaseFirestore()
    const batch = writeBatch(firestore)
    const timestamp = serverTimestamp()
    const profileReference = doc(firestore, 'clientProfiles', userId)
    const userReference = doc(firestore, 'users', userId)
    const profileData = {
      ownerId: userId,
      phone: profile.phone,
      profileImage: persistedImageReference(profile.profileImage),
      updatedAt: timestamp,
    }

    if (exists) {
      batch.update(profileReference, profileData)
    } else {
      batch.set(profileReference, { ...profileData, createdAt: timestamp })
    }
    batch.update(userReference, {
      name: profile.name,
      updatedAt: timestamp,
    })
    await batch.commit()
  },
}
