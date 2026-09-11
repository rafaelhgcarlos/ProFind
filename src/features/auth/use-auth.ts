import { useContext } from 'react'

import { AuthenticationContext } from './auth-context'

export function useAuth() {
  const context = useContext(AuthenticationContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthenticationProvider.')
  }

  return context
}
