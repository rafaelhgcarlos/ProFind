import { useMemo, useState, type PropsWithChildren } from 'react'

import {
  RegistrationDraftContext,
  type RegistrationDraftContextValue,
} from './registration-draft-context'
import {
  initialRegistrationFormValues,
  type RegistrationFormValues,
} from './registration.validation'

export function RegistrationDraftProvider({ children }: PropsWithChildren) {
  const [values, setValues] = useState<RegistrationFormValues>(
    initialRegistrationFormValues,
  )

  const contextValue = useMemo<RegistrationDraftContextValue>(
    () => ({
      values,
      setValues,
      reset: () => setValues(initialRegistrationFormValues),
    }),
    [values],
  )

  return (
    <RegistrationDraftContext.Provider value={contextValue}>
      {children}
    </RegistrationDraftContext.Provider>
  )
}
