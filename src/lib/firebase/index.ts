import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

import { getFirebaseApp } from './app'
import { getFirebaseAuth } from './auth'
import { getFirebaseFirestore } from './firestore'

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  firestore: Firestore
}

let firebaseServices: FirebaseServices | undefined

export function initializeFirebase(): FirebaseServices {
  firebaseServices ??= {
    app: getFirebaseApp(),
    auth: getFirebaseAuth(),
    firestore: getFirebaseFirestore(),
  }

  return firebaseServices
}

export { getFirebaseApp, getFirebaseAuth, getFirebaseFirestore }
