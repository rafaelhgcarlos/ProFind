import { getAuth, type Auth } from 'firebase/auth'

import { getFirebaseApp } from './app'

let firebaseAuth: Auth | undefined

export function getFirebaseAuth(): Auth {
  firebaseAuth ??= getAuth(getFirebaseApp())
  return firebaseAuth
}
