import {
  initialModeForChoice,
  hasCompletedOnboarding,
  isUserRole,
  rolesForChoice,
  type OnboardingChoice,
  type UserProfile,
  type UserRole,
  USER_ROLES,
} from '../features/onboarding/user-role'
import { userRepository } from '../repositories/user.repository'

export type OnboardingErrorCode =
  | 'profile-not-found'
  | 'invalid-choice'
  | 'invalid-mode'
  | 'role-enable-not-authorized'
  | 'permission-denied'
  | 'network-error'
  | 'unknown'

export class OnboardingError extends Error {
  constructor(
    public readonly code: OnboardingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'OnboardingError'
  }
}

export interface OnboardingDependencies {
  findUser(userId: string): Promise<UserProfile | null>
  configureRoles(
    userId: string,
    roles: UserRole[],
    activeMode: UserRole,
  ): Promise<void>
  updateActiveMode(userId: string, activeMode: UserRole): Promise<void>
  addGrantedRole(userId: string, roles: UserRole[]): Promise<void>
}

const defaultDependencies: OnboardingDependencies = {
  findUser: (userId) => userRepository.findById(userId),
  configureRoles: (userId, roles, activeMode) =>
    userRepository.configureRoles(userId, roles, activeMode),
  updateActiveMode: (userId, activeMode) =>
    userRepository.updateActiveMode(userId, activeMode),
  addGrantedRole: (userId, roles) =>
    userRepository.addGrantedRole(userId, roles),
}

function externalErrorCode(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.replace('firestore/', '')
  }

  return null
}

function normalizeOnboardingError(error: unknown) {
  if (error instanceof OnboardingError) return error

  switch (externalErrorCode(error)) {
    case 'permission-denied':
      return new OnboardingError(
        'permission-denied',
        'Sua sessão não tem permissão para alterar este perfil. Entre novamente e tente outra vez.',
        { cause: error },
      )
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return new OnboardingError(
        'network-error',
        'Não foi possível acessar seu perfil. Verifique sua conexão e tente novamente.',
        { cause: error },
      )
    default:
      return new OnboardingError(
        'unknown',
        'Não foi possível atualizar seu perfil agora. Tente novamente em instantes.',
        { cause: error },
      )
  }
}

function isOnboardingChoice(value: unknown): value is OnboardingChoice {
  return value === 'both' || isUserRole(value)
}

export async function loadUserProfile(
  userId: string,
  dependencies: OnboardingDependencies = defaultDependencies,
) {
  try {
    const profile = await dependencies.findUser(userId)

    if (!profile) {
      throw new OnboardingError(
        'profile-not-found',
        'Seu perfil base não foi encontrado. Saia da conta e tente entrar novamente.',
      )
    }

    return profile
  } catch (error) {
    throw normalizeOnboardingError(error)
  }
}

export async function completeOnboarding(
  userId: string,
  choice: OnboardingChoice,
  dependencies: OnboardingDependencies = defaultDependencies,
): Promise<UserProfile> {
  if (!isOnboardingChoice(choice)) {
    throw new OnboardingError(
      'invalid-choice',
      'Escolha uma das opções disponíveis para continuar.',
    )
  }

  const profile = await loadUserProfile(userId, dependencies)

  if (profile.roles.length > 0) {
    throw new OnboardingError(
      'invalid-choice',
      'Os papéis desta conta já foram configurados.',
    )
  }

  const roles = rolesForChoice(choice)
  const activeMode = initialModeForChoice(choice)

  try {
    await dependencies.configureRoles(userId, roles, activeMode)
  } catch (error) {
    throw normalizeOnboardingError(error)
  }

  return { ...profile, roles, activeMode }
}

export async function switchActiveMode(
  profile: UserProfile,
  nextMode: UserRole,
  dependencies: OnboardingDependencies = defaultDependencies,
): Promise<UserProfile> {
  if (!isUserRole(nextMode) || !profile.roles.includes(nextMode)) {
    throw new OnboardingError(
      'invalid-mode',
      'Este modo não está habilitado para sua conta.',
    )
  }

  if (profile.activeMode === nextMode) return profile

  try {
    await dependencies.updateActiveMode(profile.userId, nextMode)
  } catch (error) {
    throw normalizeOnboardingError(error)
  }

  return { ...profile, activeMode: nextMode }
}

/**
 * Ponto de extensão para um futuro fluxo explícito de habilitação. A validação
 * de produto acontece antes desta chamada e um backend confiável cria o grant
 * exigido pelas Security Rules. Habilitar o papel profissional não altera o
 * estado do perfil profissional nem o torna publicável.
 */
export async function enableAdditionalRole(
  profile: UserProfile,
  role: UserRole,
  dependencies: OnboardingDependencies = defaultDependencies,
): Promise<UserProfile> {
  if (!hasCompletedOnboarding(profile) || !isUserRole(role)) {
    throw new OnboardingError(
      'invalid-choice',
      'Conclua a configuração inicial antes de habilitar outro papel.',
    )
  }

  if (profile.roles.includes(role)) return profile

  const roles = USER_ROLES.filter(
    (candidate) => profile.roles.includes(candidate) || candidate === role,
  )

  try {
    await dependencies.addGrantedRole(profile.userId, roles)
  } catch (error) {
    if (externalErrorCode(error) === 'permission-denied') {
      throw new OnboardingError(
        'role-enable-not-authorized',
        'Este papel ainda não foi autorizado pelo fluxo de habilitação.',
        { cause: error },
      )
    }
    throw normalizeOnboardingError(error)
  }

  return { ...profile, roles }
}
