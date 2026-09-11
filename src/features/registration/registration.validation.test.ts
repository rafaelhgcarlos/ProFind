import { describe, expect, it } from 'vitest'

import {
  validateRegistrationForm,
  type RegistrationFormValues,
} from './registration.validation'

const validValues: RegistrationFormValues = {
  name: 'Marina Souza',
  email: 'marina@example.com',
  password: 'senha-segura',
  passwordConfirmation: 'senha-segura',
  legalAccepted: true,
}

describe('validateRegistrationForm', () => {
  it('aceita os campos obrigatórios válidos', () => {
    expect(validateRegistrationForm(validValues)).toEqual({})
  })

  it('valida nome, e-mail, senha, confirmação e aceite legal', () => {
    expect(
      validateRegistrationForm({
        name: ' ',
        email: 'email-invalido',
        password: '123',
        passwordConfirmation: '456',
        legalAccepted: false,
      }),
    ).toEqual({
      name: 'Informe seu nome.',
      email: 'Informe um endereço de e-mail válido.',
      password: 'A senha deve ter pelo menos 6 caracteres.',
      passwordConfirmation: 'As senhas precisam ser iguais.',
      legalAccepted:
        'Aceite os Termos de Uso e a Política de Privacidade para continuar.',
    })
  })
})
