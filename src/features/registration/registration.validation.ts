export interface RegistrationFormValues {
  name: string
  email: string
  password: string
  passwordConfirmation: string
  legalAccepted: boolean
}

export const initialRegistrationFormValues: RegistrationFormValues = {
  name: '',
  email: '',
  password: '',
  passwordConfirmation: '',
  legalAccepted: false,
}

export type RegistrationField = keyof RegistrationFormValues
export type RegistrationValidationErrors = Partial<
  Record<RegistrationField, string>
>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistrationForm({
  name,
  email,
  password,
  passwordConfirmation,
  legalAccepted,
}: RegistrationFormValues): RegistrationValidationErrors {
  const errors: RegistrationValidationErrors = {}

  if (!name.trim()) {
    errors.name = 'Informe seu nome.'
  } else if (name.trim().length < 2) {
    errors.name = 'O nome deve ter pelo menos 2 caracteres.'
  }

  if (!email.trim()) {
    errors.email = 'Informe seu e-mail.'
  } else if (!emailPattern.test(email.trim())) {
    errors.email = 'Informe um endereço de e-mail válido.'
  }

  if (!password) {
    errors.password = 'Crie uma senha.'
  } else if (password.length < 6) {
    errors.password = 'A senha deve ter pelo menos 6 caracteres.'
  }

  if (!passwordConfirmation) {
    errors.passwordConfirmation = 'Confirme sua senha.'
  } else if (passwordConfirmation !== password) {
    errors.passwordConfirmation = 'As senhas precisam ser iguais.'
  }

  if (!legalAccepted) {
    errors.legalAccepted =
      'Aceite os Termos de Uso e a Política de Privacidade para continuar.'
  }

  return errors
}
