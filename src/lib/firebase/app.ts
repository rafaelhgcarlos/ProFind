import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
} from 'firebase/app'

import { getFirebaseClientConfig } from '../../config/firebase-env'

let firebaseApp: FirebaseApp | undefined

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    firebaseApp = getApps().length
      ? getApp()
      : initializeApp(getFirebaseClientConfig())
  }

  return firebaseApp
}
