import { useContext } from 'react'

import { ProfileContext } from './profile-context'

export function useProfile() {
  const context = useContext(ProfileContext)

  if (!context) {
    throw new Error('useProfile deve ser usado dentro de ProfileProvider.')
  }

  return context
}
