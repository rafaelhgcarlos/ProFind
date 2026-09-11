import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth'
import { describe, expect, it, vi } from 'vitest'

import { authService } from './auth.service'

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  onAuthStateChanged: vi.fn().mockReturnValue(vi.fn()),
  onIdTokenChanged: vi.fn(),
  reload: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseAuth: vi.fn().mockReturnValue({ currentUser: null }),
}))

describe('authService.observeSession', () => {
  it('observa mudança de identidade sem criar ciclo com reload', () => {
    const observer = vi.fn()
    const onError = vi.fn()

    authService.observeSession(observer, onError)

    expect(onAuthStateChanged).toHaveBeenCalledWith(
      expect.anything(),
      observer,
      onError,
    )
    expect(onIdTokenChanged).not.toHaveBeenCalled()
  })
})
