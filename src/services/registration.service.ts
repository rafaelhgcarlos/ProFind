import { authService } from './auth.service'
import {
  isCurrentLegalAcceptance,
  type LegalAcceptanceVersions,
} from '../features/legal/legal-documents'
import {
  userRepository,
  type CreateBaseUserDocumentInput,
} from '../repositories/user.repository'

export interface RegistrationInput {
  name: string
  email: string
  password: string
  legalAcceptance?: LegalAcceptanceVersions
}

export interface RegistrationResult {
  userId: string
  email: string
}

export type RegistrationErrorCode =
  | 'email-already-in-use'
  | 'invalid-email'
  | 'weak-password'
  | 'network-error'
  | 'too-many-requests'
  | 'legal-acceptance-required'
  | 'profile-creation-failed'
  | 'partial-failure'
  | 'unknown'

export class RegistrationError extends Error {
  constructor(
    public readonly code: RegistrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'RegistrationError'
  }
}

interface CreatedIdentity {
  userId: string
  email: string | null
  rollback(): Promise<void>
}

export interface RegistrationDependencies {
  createIdentity(email: string, password: string): Promise<CreatedIdentity>
  createUserDocument(input: CreateBaseUserDocumentInput): Promise<void>
}

const defaultDependencies: RegistrationDependencies = {
  async createIdentity(email, password) {
    const credential = await authService.signUpWithEmail(email, password)

    return {
      userId: credential.user.uid,
      email: credential.user.email,
      rollback: () => authService.deleteAccount(credential.user),
    }
  },
  createUserDocument: (input) => userRepository.createBaseDocument(input),
}

function firebaseErrorCode(error: unknown) {
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

function normalizeIdentityError(error: unknown) {
  const code = firebaseErrorCode(error)

  switch (code) {
    case 'auth/email-already-in-use':
      return new RegistrationError(
        'email-already-in-use',
        'Este e-mail já está cadastrado. Entre na sua conta ou use a recuperação de senha para voltar a acessar.',
        { cause: error },
      )
    case 'auth/invalid-email':
      return new RegistrationError(
        'invalid-email',
        'Informe um endereço de e-mail válido.',
        { cause: error },
      )
    case 'auth/weak-password':
      return new RegistrationError(
        'weak-password',
        'Escolha uma senha com pelo menos 6 caracteres.',
        { cause: error },
      )
    case 'auth/network-request-failed':
      return new RegistrationError(
        'network-error',
        'Não foi possível acessar o serviço de cadastro. Verifique sua conexão e tente novamente.',
        { cause: error },
      )
    case 'auth/too-many-requests':
      return new RegistrationError(
        'too-many-requests',
        'Muitas tentativas foram realizadas. Aguarde alguns minutos antes de tentar novamente.',
        { cause: error },
      )
    default:
      return new RegistrationError(
        'unknown',
        'Não foi possível criar sua conta agora. Tente novamente em instantes.',
        { cause: error },
      )
  }
}

function profileCreationErrorMessage(error: unknown) {
  switch (firebaseErrorCode(error)) {
    case 'permission-denied':
    case 'firestore/permission-denied':
      return 'O serviço de perfis recusou a gravação. Nenhuma conta foi mantida. Tente novamente após a configuração de acesso ser corrigida.'
    case 'failed-precondition':
    case 'firestore/failed-precondition':
    case 'not-found':
    case 'firestore/not-found':
      return 'O serviço de perfis ainda não está disponível. Nenhuma conta foi mantida. Tente novamente após a configuração do serviço.'
    case 'unavailable':
    case 'firestore/unavailable':
    case 'deadline-exceeded':
    case 'firestore/deadline-exceeded':
      return 'Não foi possível acessar o serviço de perfis. Nenhuma conta foi mantida; verifique sua conexão e tente novamente.'
    default:
      return 'Não foi possível concluir o cadastro. Nenhuma conta foi mantida; tente novamente em instantes.'
  }
}

export async function registerAccount(
  input: RegistrationInput,
  dependencies: RegistrationDependencies = defaultDependencies,
): Promise<RegistrationResult> {
  if (!isCurrentLegalAcceptance(input.legalAcceptance)) {
    throw new RegistrationError(
      'legal-acceptance-required',
      'Aceite os Termos de Uso e a Política de Privacidade para continuar.',
    )
  }

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  let identity: CreatedIdentity

  try {
    identity = await dependencies.createIdentity(email, input.password)
  } catch (error) {
    throw normalizeIdentityError(error)
  }

  try {
    await dependencies.createUserDocument({
      userId: identity.userId,
      name,
      email: identity.email?.toLowerCase() ?? email,
      termsVersion: input.legalAcceptance.termsVersion,
      privacyPolicyVersion: input.legalAcceptance.privacyPolicyVersion,
    })
  } catch (profileError) {
    try {
      await identity.rollback()
    } catch (rollbackError) {
      throw new RegistrationError(
        'partial-failure',
        'A identidade foi criada, mas o perfil não pôde ser concluído nem removido automaticamente. Não crie outra conta com um e-mail diferente; tente recuperar o acesso com este mesmo e-mail.',
        { cause: new AggregateError([profileError, rollbackError]) },
      )
    }

    throw new RegistrationError(
      'profile-creation-failed',
      profileCreationErrorMessage(profileError),
      { cause: profileError },
    )
  }

  return {
    userId: identity.userId,
    email: identity.email?.toLowerCase() ?? email,
  }
}

export function getRegistrationErrorMessage(error: unknown) {
  return error instanceof RegistrationError
    ? error.message
    : 'Não foi possível criar sua conta agora. Tente novamente em instantes.'
}
