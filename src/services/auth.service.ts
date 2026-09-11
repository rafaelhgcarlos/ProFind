import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reload,
  sendPasswordResetEmail,
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

  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(getFirebaseAuth(), email.trim())
  },

  reloadUser(user: User) {
    return reload(user)
  },

  getCurrentUser() {
    return getFirebaseAuth().currentUser
  },

  deleteAccount(user: User) {
    return deleteUser(user)
  },

  observeSession(
    observer: NextOrObserver<User>,
    onError?: (error: Error) => void,
  ) {
    return onAuthStateChanged(getFirebaseAuth(), observer, onError)
  },
}
