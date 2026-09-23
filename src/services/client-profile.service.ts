import type { UserProfile } from '../features/onboarding/user-role'
import { clientProfileRepository } from '../repositories/client-profile.repository'
import { userRepository } from '../repositories/user.repository'
import type {
  ClientProfile,
  ClientProfileEditor,
  ClientProfileInput,
  ClientProfileReadiness,
  ClientProfileState,
} from '../types/client-profile'

export type ClientProfileErrorCode =
  | 'not-found'
  | 'not-authorized'
  | 'validation'
  | 'permission-denied'
  | 'network-error'
  | 'unknown'

export class ClientProfileError extends Error {
  constructor(
    public readonly code: ClientProfileErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ClientProfileError'
  }
}

export interface ClientProfileDependencies {
  findUser(userId: string): Promise<UserProfile | null>
  findClientProfile(userId: string): Promise<ClientProfile | null>
  saveClientProfile(input: {
    userId: string
    profile: ClientProfileInput
    exists: boolean
  }): Promise<void>
}

const defaultDependencies: ClientProfileDependencies = {
  findUser: (userId) => userRepository.findById(userId),
  findClientProfile: (userId) => clientProfileRepository.findByOwnerId(userId),
  saveClientProfile: (input) => clientProfileRepository.save(input),
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

function normalizeError(error: unknown) {
  if (error instanceof ClientProfileError) return error
  if (externalErrorCode(error) === 'permission-denied') {
    return new ClientProfileError(
      'permission-denied',
      'Sua sessão não tem permissão para alterar este perfil. Entre novamente e tente outra vez.',
      { cause: error },
    )
  }
  if (
    ['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(
      externalErrorCode(error) ?? '',
    )
  ) {
    return new ClientProfileError(
      'network-error',
      'Não foi possível acessar seu perfil. Verifique sua conexão e tente novamente.',
      { cause: error },
    )
  }
  return new ClientProfileError(
    'unknown',
    'Não foi possível atualizar seu perfil agora. Tente novamente em instantes.',
    { cause: error },
  )
}

export function normalizeClientPhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function isValidClientName(value: string) {
  const name = value.trim()
  return name.length >= 2 && name.length <= 120
}

export function deriveClientProfileReadiness(
  user: Pick<UserProfile, 'name'>,
  profile: ClientProfile | null,
): ClientProfileReadiness {
  const missingFields: ClientProfileReadiness['missingFields'] = []
  if (!isValidClientName(user.name)) missingFields.push('name')
  if (!profile) missingFields.push('clientProfile')
  return { isComplete: missingFields.length === 0, missingFields }
}

export async function loadClientProfileState(
  user: UserProfile,
  dependencies: ClientProfileDependencies = defaultDependencies,
): Promise<ClientProfileState> {
  if (!user.roles.includes('client')) {
    throw new ClientProfileError(
      'not-authorized',
      'O modo Cliente não está habilitado para esta conta.',
    )
  }
  try {
    const profile = await dependencies.findClientProfile(user.userId)
    return { profile, readiness: deriveClientProfileReadiness(user, profile) }
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function loadClientProfileEditor(
  userId: string,
  dependencies: ClientProfileDependencies = defaultDependencies,
): Promise<ClientProfileEditor> {
  try {
    const user = await dependencies.findUser(userId)
    if (!user) {
      throw new ClientProfileError(
        'not-found',
        'Seu perfil base não foi encontrado. Saia da conta e tente entrar novamente.',
      )
    }
    if (!user.roles.includes('client')) {
      throw new ClientProfileError(
        'not-authorized',
        'O modo Cliente não está habilitado para esta conta.',
      )
    }
    const profile = await dependencies.findClientProfile(userId)
    return {
      userId,
      name: user.name,
      email: user.email,
      phone: profile?.phone ?? '',
      profileImage: profile?.profileImage ?? null,
      exists: profile !== null,
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function saveClientProfile(
  editor: ClientProfileEditor,
  input: ClientProfileInput,
  dependencies: ClientProfileDependencies = defaultDependencies,
): Promise<ClientProfileEditor> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  const phone = normalizeClientPhone(input.phone)
  if (!isValidClientName(name)) {
    throw new ClientProfileError(
      'validation',
      'Informe um nome com pelo menos 2 e no máximo 120 caracteres.',
    )
  }
  if (phone && !/^\d{10,11}$/.test(phone)) {
    throw new ClientProfileError(
      'validation',
      'Informe um telefone com DDD e 10 ou 11 dígitos.',
    )
  }
  if (
    input.profileImage &&
    (input.profileImage.ownerId !== editor.userId ||
      input.profileImage.purpose !== 'CLIENT_AVATAR' ||
      input.profileImage.provider === 'MOCK' ||
      !input.profileImage.url.startsWith('https://') ||
      !input.profileImage.providerId.trim() ||
      !Number.isSafeInteger(input.profileImage.createdAt) ||
      input.profileImage.createdAt <= 0 ||
      !Number.isSafeInteger(input.profileImage.updatedAt) ||
      input.profileImage.updatedAt < input.profileImage.createdAt)
  ) {
    throw new ClientProfileError(
      'validation',
      'A foto não pertence a este perfil de cliente.',
    )
  }

  try {
    const user = await dependencies.findUser(editor.userId)
    if (!user?.roles.includes('client')) {
      throw new ClientProfileError(
        'not-authorized',
        'O modo Cliente não está habilitado para esta conta.',
      )
    }
    const normalized = { name, phone, profileImage: input.profileImage }
    await dependencies.saveClientProfile({
      userId: editor.userId,
      profile: normalized,
      exists: editor.exists,
    })
    return { ...editor, ...normalized, exists: true }
  } catch (error) {
    throw normalizeError(error)
  }
}

export function clientLandingRoute(readiness: ClientProfileReadiness) {
  return readiness.isComplete ? '/cliente' : '/cliente/perfil'
}
