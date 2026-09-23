import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import type { LegalAcceptanceVersions } from '../features/legal/legal-documents'
import {
  isProfessionalProfileStatus,
  isUserRole,
  type UserProfile,
  type UserRole,
} from '../features/onboarding/user-role'

export interface CreateBaseUserDocumentInput extends LegalAcceptanceVersions {
  userId: string
  name: string
  email: string
}

export const userRepository = {
  createBaseDocument({
    userId,
    name,
    email,
    termsVersion,
    privacyPolicyVersion,
  }: CreateBaseUserDocumentInput) {
    const acceptedAt = serverTimestamp()

    return setDoc(doc(getFirebaseFirestore(), 'users', userId), {
      name,
      email,
      roles: [],
      activeMode: null,
      professionalProfileStatus: 'not-started',
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
      legalAcceptances: {
        termsOfUse: {
          version: termsVersion,
          acceptedAt,
        },
        privacyPolicy: {
          version: privacyPolicyVersion,
          acceptedAt,
        },
      },
    })
  },

  async findById(userId: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(
      doc(getFirebaseFirestore(), 'users', userId),
    )

    if (!snapshot.exists()) return null

    const data = snapshot.data()
    const roles = Array.isArray(data.roles)
      ? [...new Set(data.roles.filter(isUserRole))]
      : []
    const activeMode = isUserRole(data.activeMode) ? data.activeMode : null
    const professionalProfileStatus = isProfessionalProfileStatus(
      data.professionalProfileStatus,
    )
      ? data.professionalProfileStatus
      : 'not-started'
    return {
      userId,
      name: typeof data.name === 'string' ? data.name : '',
      email: typeof data.email === 'string' ? data.email : '',
      roles,
      activeMode,
      professionalProfileStatus,
    }
  },

  configureRoles(userId: string, roles: UserRole[], activeMode: UserRole) {
    return updateDoc(doc(getFirebaseFirestore(), 'users', userId), {
      roles,
      activeMode,
      updatedAt: serverTimestamp(),
    })
  },

  updateActiveMode(userId: string, activeMode: UserRole) {
    return updateDoc(doc(getFirebaseFirestore(), 'users', userId), {
      activeMode,
      updatedAt: serverTimestamp(),
    })
  },

  /**
   * Usado somente após um fluxo de habilitação autorizado. As Security Rules
   * exigem um grant criado por backend para expansões posteriores ao onboarding.
   */
  addGrantedRole(userId: string, roles: UserRole[]) {
    return updateDoc(doc(getFirebaseFirestore(), 'users', userId), {
      roles,
      updatedAt: serverTimestamp(),
    })
  },
}
