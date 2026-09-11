import { useContext } from 'react'

import { RegistrationDraftContext } from './registration-draft-context'

export function useRegistrationDraft() {
  const context = useContext(RegistrationDraftContext)

  if (!context) {
    throw new Error(
      'useRegistrationDraft deve ser usado dentro de RegistrationDraftProvider.',
    )
  }

  return context
}
