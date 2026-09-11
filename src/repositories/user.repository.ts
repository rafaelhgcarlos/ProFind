import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import type { LegalAcceptanceVersions } from '../features/legal/legal-documents'

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
}
