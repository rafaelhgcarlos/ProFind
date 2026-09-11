export type AuthenticationErrorCode =
  | 'invalid-credentials'
  | 'account-disabled'
  | 'too-many-requests'
  | 'network-error'
  | 'session-expired'
  | 'unknown'

export class AuthenticationError extends Error {
  constructor(
    public readonly code: AuthenticationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AuthenticationError'
  }
}

export function getFirebaseAuthErrorCode(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code
  }

  return null
}

export function normalizeAuthenticationError(error: unknown) {
  const code = getFirebaseAuthErrorCode(error)

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return new AuthenticationError(
        'invalid-credentials',
        'E-mail ou senha inválidos.',
        { cause: error },
      )
    case 'auth/user-disabled':
      return new AuthenticationError(
        'account-disabled',
        'Esta conta está desativada e não pode acessar o ProFind.',
        { cause: error },
      )
    case 'auth/too-many-requests':
      return new AuthenticationError(
        'too-many-requests',
        'Muitas tentativas foram realizadas. Aguarde alguns minutos e tente novamente.',
        { cause: error },
      )
    case 'auth/network-request-failed':
      return new AuthenticationError(
        'network-error',
        'Não foi possível acessar o serviço de autenticação. Verifique sua conexão e tente novamente.',
        { cause: error },
      )
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
      return new AuthenticationError(
        'session-expired',
        'Sua sessão expirou. Entre novamente para continuar.',
        { cause: error },
      )
    default:
      return new AuthenticationError(
        'unknown',
        'Não foi possível concluir a autenticação agora. Tente novamente em instantes.',
        { cause: error },
      )
  }
}

export function isInvalidSessionError(error: unknown) {
  const code = getFirebaseAuthErrorCode(error)
  return (
    code === 'auth/user-disabled' ||
    code === 'auth/user-token-expired' ||
    code === 'auth/invalid-user-token'
  )
}
