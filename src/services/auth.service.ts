import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type NextOrObserver,
  type User,
} from 'firebase/auth'

import { getFirebaseAuth } from '../lib/firebase'

export const authService = {
  signUpWithEmail(email: string, password: string) {
    return createUserWithEmailAndPassword(
      getFirebaseAuth(),
      email.trim(),
      password,
    )
  },

  signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(
      getFirebaseAuth(),
      email.trim(),
      password,
    )
  },

  signOut() {
    return signOut(getFirebaseAuth())
  },

  deleteAccount(user: User) {
    return deleteUser(user)
  },

  observeSession(observer: NextOrObserver<User>) {
    return onAuthStateChanged(getFirebaseAuth(), observer)
  },
}
