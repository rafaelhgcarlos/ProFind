import { professionalProfileRepository } from '../repositories/professional-profile.repository'
import type { ServiceCatalog } from '../types/catalog'
import type {
  BrazilianStateCode,
  ProfessionalBaseLocation,
  ProfessionalProfile,
  ProfessionalProfileInput,
  ProfessionalProfileStatus,
} from '../types/professional-profile'
import {
  BRAZILIAN_STATE_CODES,
  isProfessionalAvailability,
  isProfessionalContactVisibility,
  isProfessionalServiceMode,
  PROFESSIONAL_SERVICE_RADIUS_OPTIONS,
} from '../types/professional-profile'
import type { ProfessionalProfileStatus as UserProfessionalProfileStatus } from '../features/onboarding/user-role'

export type EditableProfessionalProfileStatus = Exclude<
  ProfessionalProfileStatus,
  'SUSPENDED'
>

export type ProfessionalProfileField = keyof ProfessionalProfileInput | 'form'
export type ProfessionalProfileFieldErrors = Partial<
  Record<ProfessionalProfileField, string>
>

export type ProfessionalProfileErrorCode =
  | 'invalid-profile'
  | 'suspended'
  | 'permission-denied'
  | 'network-error'
  | 'unknown'

export class ProfessionalProfileError extends Error {
  constructor(
    public readonly code: ProfessionalProfileErrorCode,
    message: string,
    public readonly fieldErrors: ProfessionalProfileFieldErrors = {},
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ProfessionalProfileError'
  }
}

export interface ProfessionalProfileDependencies {
  findByOwnerId(userId: string): Promise<ProfessionalProfile | null>
  save(input: {
    userId: string
    profile: ProfessionalProfileInput
    status: EditableProfessionalProfileStatus
    exists: boolean
  }): Promise<void>
  updateAvailability(
    userId: string,
    availability: ProfessionalProfileInput['availability'],
  ): Promise<void>
  persistenceTimeoutMs?: number
}

const defaultDependencies: ProfessionalProfileDependencies =
  professionalProfileRepository

const DEFAULT_PERSISTENCE_TIMEOUT_MS = 10_000

async function withPersistenceTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new ProfessionalProfileError(
              'network-error',
              'A gravação demorou mais que o esperado. Verifique sua conexão e tente novamente.',
            ),
          )
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
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

function normalizePersistenceError(error: unknown) {
  if (error instanceof ProfessionalProfileError) return error

  switch (externalErrorCode(error)) {
    case 'permission-denied':
      return new ProfessionalProfileError(
        'permission-denied',
        'Sua sessão não tem permissão para alterar este perfil.',
        {},
        { cause: error },
      )
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return new ProfessionalProfileError(
        'network-error',
        'Não foi possível acessar seu perfil. Verifique sua conexão e tente novamente.',
        {},
        { cause: error },
      )
    default:
      return new ProfessionalProfileError(
        'unknown',
        'Não foi possível salvar seu perfil agora. Tente novamente em instantes.',
        {},
        { cause: error },
      )
  }
}

function unique(values: string[]) {
  return [...new Set(values)]
}

const ibgeStatePrefixes: Record<BrazilianStateCode, string> = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
}

function isBrazilianStateCode(value: string): value is BrazilianStateCode {
  return BRAZILIAN_STATE_CODES.includes(value as BrazilianStateCode)
}

function normalizeLocation(
  location: ProfessionalBaseLocation,
): ProfessionalBaseLocation {
  return {
    city: location.city.trim(),
    stateCode: location.stateCode.trim().toUpperCase(),
    ibgeCode: location.ibgeCode.trim(),
  }
}

function uniqueLocations(locations: ProfessionalBaseLocation[]) {
  const uniqueByIbgeCode = new Map<string, ProfessionalBaseLocation>()
  for (const location of locations) {
    const normalized = normalizeLocation(location)
    if (!uniqueByIbgeCode.has(normalized.ibgeCode)) {
      uniqueByIbgeCode.set(normalized.ibgeCode, normalized)
    }
  }
  return [...uniqueByIbgeCode.values()]
}

function structuredLocationError(location: ProfessionalBaseLocation) {
  if (location.city.length > 120) {
    return 'Use no máximo 120 caracteres para a cidade.'
  }
  if (location.stateCode && !isBrazilianStateCode(location.stateCode)) {
    return 'Selecione uma UF válida.'
  }
  if (location.ibgeCode && !/^\d{7}$/.test(location.ibgeCode)) {
    return 'Selecione um município válido do IBGE.'
  }
  if (
    location.ibgeCode &&
    isBrazilianStateCode(location.stateCode) &&
    !location.ibgeCode.startsWith(ibgeStatePrefixes[location.stateCode])
  ) {
    return 'O município selecionado não pertence à UF informada.'
  }
  return null
}

export function normalizeProfessionalProfileInput(
  input: ProfessionalProfileInput,
): ProfessionalProfileInput {
  return {
    publicName: input.publicName.trim(),
    headline: input.headline.trim(),
    ...(input.bio === undefined ? {} : { bio: input.bio.trim() }),
    categoryIds: unique(input.categoryIds),
    specialtyIds: unique(input.specialtyIds),
    experienceYears: input.experienceYears,
    baseLocation: normalizeLocation(input.baseLocation),
    serviceMode: input.serviceMode,
    serviceRadiusKm:
      input.serviceMode === 'RADIUS' ? input.serviceRadiusKm : null,
    selectedCities:
      input.serviceMode === 'SELECTED_CITIES'
        ? uniqueLocations(input.selectedCities)
        : [],
    availability: input.availability,
    phone: input.phone.replace(/\D/g, ''),
    contactVisibility: input.contactVisibility,
    privateLocation: {
      postalCode: input.privateLocation.postalCode.replace(/\D/g, ''),
      ...(input.privateLocation.neighborhood?.trim()
        ? { neighborhood: input.privateLocation.neighborhood.trim() }
        : {}),
    },
  }
}

export function validateProfessionalProfile(
  input: ProfessionalProfileInput,
  status: EditableProfessionalProfileStatus,
  catalog: ServiceCatalog,
): ProfessionalProfileFieldErrors {
  const errors: ProfessionalProfileFieldErrors = {}
  const categoryIds = new Set(catalog.categories.map((category) => category.id))
  const specialties = new Map(
    catalog.specialties.map((specialty) => [specialty.id, specialty]),
  )

  if (input.publicName && input.publicName.length < 2) {
    errors.publicName = 'Informe ao menos 2 caracteres.'
  } else if (input.publicName.length > 120) {
    errors.publicName = 'Use no máximo 120 caracteres.'
  }
  if (input.headline.length > 120) {
    errors.headline = 'Use no máximo 120 caracteres.'
  }
  if ((input.bio?.length ?? 0) > 1200) {
    errors.bio = 'Use no máximo 1.200 caracteres.'
  }
  const baseLocationError = structuredLocationError(input.baseLocation)
  if (baseLocationError) errors.baseLocation = baseLocationError
  if (
    input.experienceYears !== null &&
    (!Number.isSafeInteger(input.experienceYears) ||
      input.experienceYears < 0 ||
      input.experienceYears > 80)
  ) {
    errors.experienceYears = 'Informe um valor inteiro entre 0 e 80.'
  }
  if (
    input.serviceMode !== null &&
    !isProfessionalServiceMode(input.serviceMode)
  ) {
    errors.serviceMode = 'A modalidade informada não está disponível.'
  } else if (
    input.serviceMode === 'RADIUS' &&
    input.serviceRadiusKm !== null &&
    !PROFESSIONAL_SERVICE_RADIUS_OPTIONS.includes(
      input.serviceRadiusKm as (typeof PROFESSIONAL_SERVICE_RADIUS_OPTIONS)[number],
    )
  ) {
    errors.serviceRadiusKm = 'Selecione uma das opções de raio disponíveis.'
  }
  if (input.selectedCities.length > 10) {
    errors.selectedCities = 'Selecione no máximo 10 municípios.'
  } else if (
    input.selectedCities.some((location) => structuredLocationError(location))
  ) {
    errors.selectedCities = 'Revise os municípios selecionados.'
  } else if (
    new Set(input.selectedCities.map((location) => location.ibgeCode)).size !==
    input.selectedCities.length
  ) {
    errors.selectedCities = 'Não adicione o mesmo município mais de uma vez.'
  }
  if (!isProfessionalAvailability(input.availability)) {
    errors.availability = 'Selecione sua disponibilidade.'
  }
  if (input.phone && !/^\d{10,11}$/.test(input.phone)) {
    errors.phone = 'Informe um telefone com DDD e 10 ou 11 dígitos.'
  } else if (input.contactVisibility === 'PUBLIC' && !input.phone) {
    errors.phone = 'Informe um telefone antes de torná-lo público.'
  }
  if (!isProfessionalContactVisibility(input.contactVisibility)) {
    errors.contactVisibility = 'Selecione quem pode ver seu telefone.'
  }
  if (
    input.privateLocation.postalCode &&
    !/^\d{8}$/.test(input.privateLocation.postalCode)
  ) {
    errors.privateLocation = 'Informe um CEP válido com oito dígitos.'
  } else if ((input.privateLocation.neighborhood?.length ?? 0) > 120) {
    errors.privateLocation = 'Use no máximo 120 caracteres para o bairro.'
  }
  if (input.categoryIds.length > 5) {
    errors.categoryIds = 'Selecione no máximo 5 categorias.'
  } else if (input.categoryIds.some((id) => !categoryIds.has(id))) {
    errors.categoryIds = 'Revise as categorias indisponíveis.'
  }
  if (input.specialtyIds.length > 10) {
    errors.specialtyIds = 'Selecione no máximo 10 especialidades.'
  } else if (
    input.specialtyIds.some((id) => {
      const specialty = specialties.get(id)
      return !specialty || !input.categoryIds.includes(specialty.categoryId)
    })
  ) {
    errors.specialtyIds =
      'Selecione apenas especialidades ativas das categorias escolhidas.'
  }

  if (status !== 'DRAFT') {
    if (input.publicName.length < 2) {
      errors.publicName = 'O nome público é obrigatório para publicar.'
    }
    if (
      !input.baseLocation.city ||
      !isBrazilianStateCode(input.baseLocation.stateCode) ||
      !/^\d{7}$/.test(input.baseLocation.ibgeCode)
    ) {
      errors.baseLocation =
        'Informe cidade, UF e código IBGE válidos para publicar.'
    }
    if (input.categoryIds.length === 0) {
      errors.categoryIds = 'Selecione ao menos uma categoria para publicar.'
    }
    if (input.specialtyIds.length === 0) {
      errors.specialtyIds = 'Selecione ao menos uma especialidade para publicar.'
    }
    if (!/^\d{10,11}$/.test(input.phone) && !errors.phone) {
      errors.phone = 'Informe um telefone com DDD para publicar.'
    }
    if (!isProfessionalServiceMode(input.serviceMode)) {
      errors.serviceMode = 'Selecione como você atende para publicar.'
    }
    if (input.serviceMode === 'RADIUS' && input.serviceRadiusKm === null) {
      errors.serviceRadiusKm = 'Selecione o raio de atendimento para publicar.'
    }
    if (
      input.serviceMode === 'SELECTED_CITIES' &&
      input.selectedCities.length === 0
    ) {
      errors.selectedCities =
        'Adicione ao menos um município para publicar nesta modalidade.'
    }
  }

  return errors
}

export async function updateProfessionalAvailability(
  userId: string,
  availability: ProfessionalProfileInput['availability'],
  currentProfile: ProfessionalProfile | null,
  dependencies: ProfessionalProfileDependencies = defaultDependencies,
): Promise<ProfessionalProfile> {
  if (!currentProfile) {
    throw new ProfessionalProfileError(
      'invalid-profile',
      'Salve o perfil antes de atualizar a disponibilidade separadamente.',
      { availability: 'Salve o perfil antes de atualizar a disponibilidade.' },
    )
  }
  if (currentProfile.status === 'SUSPENDED') {
    throw new ProfessionalProfileError(
      'suspended',
      'Este perfil está suspenso e não pode ser alterado.',
    )
  }
  if (!isProfessionalAvailability(availability)) {
    throw new ProfessionalProfileError(
      'invalid-profile',
      'Selecione uma disponibilidade válida.',
      { availability: 'Selecione sua disponibilidade.' },
    )
  }

  try {
    await withPersistenceTimeout(
      dependencies.updateAvailability(userId, availability),
      dependencies.persistenceTimeoutMs ?? DEFAULT_PERSISTENCE_TIMEOUT_MS,
    )
  } catch (error) {
    throw normalizePersistenceError(error)
  }

  return { ...currentProfile, availability }
}

export async function loadProfessionalProfile(
  userId: string,
  dependencies: ProfessionalProfileDependencies = defaultDependencies,
) {
  try {
    return await dependencies.findByOwnerId(userId)
  } catch (error) {
    throw normalizePersistenceError(error)
  }
}

export async function saveProfessionalProfile(
  userId: string,
  input: ProfessionalProfileInput,
  status: EditableProfessionalProfileStatus,
  catalog: ServiceCatalog,
  currentProfile: ProfessionalProfile | null,
  dependencies: ProfessionalProfileDependencies = defaultDependencies,
): Promise<ProfessionalProfile> {
  if (currentProfile?.status === 'SUSPENDED') {
    throw new ProfessionalProfileError(
      'suspended',
      'Este perfil está suspenso e não pode ser alterado.',
    )
  }
  if (
    status === 'PAUSED' &&
    currentProfile?.status !== 'PUBLISHED' &&
    currentProfile?.status !== 'PAUSED'
  ) {
    throw new ProfessionalProfileError(
      'invalid-profile',
      'Somente um perfil publicado pode ser pausado.',
    )
  }

  const normalized = normalizeProfessionalProfileInput(input)
  const fieldErrors = validateProfessionalProfile(normalized, status, catalog)

  if (Object.keys(fieldErrors).length > 0) {
    throw new ProfessionalProfileError(
      'invalid-profile',
      status === 'DRAFT'
        ? 'Revise os campos indicados antes de salvar o rascunho.'
        : 'Complete os campos obrigatórios antes de publicar o perfil.',
      fieldErrors,
    )
  }

  try {
    await withPersistenceTimeout(
      dependencies.save({
        userId,
        profile: normalized,
        status,
        exists: currentProfile !== null,
      }),
      dependencies.persistenceTimeoutMs ?? DEFAULT_PERSISTENCE_TIMEOUT_MS,
    )
  } catch (error) {
    throw normalizePersistenceError(error)
  }

  return {
    ...currentProfile,
    ...normalized,
    userId,
    status,
  }
}

export function userProfileStatusForProfessionalProfile(
  status: EditableProfessionalProfileStatus,
): UserProfessionalProfileStatus {
  return status === 'DRAFT' ? 'incomplete' : 'complete'
}
