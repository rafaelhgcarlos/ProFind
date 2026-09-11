const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string) {
  if (!email.trim()) return 'Informe seu e-mail.'
  if (!emailPattern.test(email.trim())) return 'Informe um endereço de e-mail válido.'
  return null
}

export function validateLogin(email: string, password: string) {
  return {
    email: validateEmail(email),
    password: password ? null : 'Informe sua senha.',
  }
}
