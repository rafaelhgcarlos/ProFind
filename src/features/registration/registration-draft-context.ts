import { createContext, type Dispatch, type SetStateAction } from 'react'

import type { RegistrationFormValues } from './registration.validation'

export interface RegistrationDraftContextValue {
  values: RegistrationFormValues
  setValues: Dispatch<SetStateAction<RegistrationFormValues>>
  reset(): void
}

export const RegistrationDraftContext =
  createContext<RegistrationDraftContextValue | null>(null)
