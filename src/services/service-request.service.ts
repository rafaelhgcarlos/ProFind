import type { Firestore } from 'firebase/firestore'

import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase'
import {
  createServiceRequestRepository,
  type AcceptRequestInput,
  type CancelAssignmentInput,
  type CreateRequestInput,
  type OpportunityQuery,
  type RefuseRequestInput,
  type ServiceHistoryQuery,
  type TransactionCoordinator,
} from '../repositories/service-request.repository'
import { listAvailableCatalog } from './catalog.service'
import { getServiceRequestSchedulingWindow } from './service-period-policy'
import type { ServiceCatalog } from '../types/catalog'
import { ServiceRequestError, type ServicePeriod } from '../types/service-request'
import { isIbgeMunicipalityCodeForState } from '../utils/ibge'

export interface ServiceRequestServiceDependencies {
  firestore: Firestore
  getActorId(): string | null
  now?: () => Date
  coordinator?: TransactionCoordinator
  listCatalog?: () => Promise<ServiceCatalog>
}

export interface ServiceRequestCreationInput {
  operationKey: string
  specialtyId: string
  description: string
  city: string
  stateCode: string
  cityIbgeCode: string
  street: string
  number: string
  complement: string
  neighborhood: string
  postalCode: string
  serviceDate: string
  period: ServicePeriod
  contactName: string
  contactPhone: string
}

const operationKeyPattern = /^[a-zA-Z0-9_-]{20,80}$/

function validationError(message: string): never {
  throw new ServiceRequestError('validation', message)
}

function normalizeCreationInput(
  input: ServiceRequestCreationInput,
  catalog: ServiceCatalog,
  clientId: string,
  now: Date,
): CreateRequestInput {
  const specialty = catalog.specialties.find(
    (candidate) => candidate.id === input.specialtyId,
  )
  const category = specialty
    ? catalog.categories.find((candidate) => candidate.id === specialty.categoryId)
    : null
  if (!specialty || !category) validationError('Escolha uma especialidade disponível.')
  if (!operationKeyPattern.test(input.operationKey)) {
    validationError('Não foi possível identificar este envio. Recarregue a página.')
  }

  const description = input.description.trim().replace(/\s+/g, ' ')
  const contactName = input.contactName.trim().replace(/\s+/g, ' ')
  const contactPhone = input.contactPhone.replace(/\D/g, '')
  const city = input.city.trim().replace(/\s+/g, ' ')
  const stateCode = input.stateCode.trim().toUpperCase()
  const cityIbgeCode = input.cityIbgeCode.trim()
  const street = input.street.trim().replace(/\s+/g, ' ')
  const number = input.number.trim()
  const complement = input.complement.trim().replace(/\s+/g, ' ')
  const neighborhood = input.neighborhood.trim().replace(/\s+/g, ' ')
  const postalCode = input.postalCode.replace(/\D/g, '')

  if (description.length < 10 || description.length > 1000) {
    validationError('Descreva o serviço em 10 a 1.000 caracteres.')
  }
  if (contactName.length < 2 || contactName.length > 120) {
    throw new ServiceRequestError(
      'profile-incomplete',
      'Complete seu nome no perfil antes de solicitar um serviço.',
    )
  }
  if (contactPhone && !/^\d{10,11}$/.test(contactPhone)) {
    validationError('O telefone salvo no perfil está inválido.')
  }
  if (!city || !isIbgeMunicipalityCodeForState(stateCode, cityIbgeCode)) {
    validationError('Escolha um município válido.')
  }
  if (!street || !number || !neighborhood || !/^\d{8}$/.test(postalCode)) {
    validationError('Preencha o endereço e informe um CEP com 8 dígitos.')
  }
  if (
    street.length > 160 ||
    number.length > 30 ||
    neighborhood.length > 120 ||
    complement.length > 120
  ) {
    validationError('Revise o endereço: um ou mais campos excedem o limite.')
  }

  let scheduling
  try {
    scheduling = getServiceRequestSchedulingWindow(
      input.serviceDate,
      input.period,
      now,
    )
  } catch (error) {
    validationError(error instanceof Error ? error.message : 'Escolha outra data.')
  }

  return {
    operationKey: input.operationKey,
    clientId,
    categoryId: category.id,
    specialtyId: specialty.id,
    cityIbgeCode,
    serviceDate: input.serviceDate,
    period: input.period,
    periodStartAt: scheduling.startsAt,
    acceptUntil: scheduling.acceptUntil,
    contactName,
    contactPhone,
    description,
    address: {
      street,
      number,
      complement,
      neighborhood,
      city,
      stateCode,
      postalCode,
      ibgeCode: cityIbgeCode,
    },
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

function normalizeOperationError(error: unknown) {
  if (error instanceof ServiceRequestError) return error
  const code = externalErrorCode(error)
  if (code === 'permission-denied') {
    return new ServiceRequestError(
      'permission-denied',
      'A operação não atende às regras de autorização e consistência.',
      { cause: error },
    )
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new ServiceRequestError(
      'unavailable',
      'O serviço está temporariamente indisponível. Tente novamente.',
      { cause: error },
    )
  }
  return new ServiceRequestError(
    'unknown',
    'Não foi possível concluir a operação.',
    { cause: error },
  )
}

export function createServiceRequestService(
  dependencies: ServiceRequestServiceDependencies,
) {
  const repository = createServiceRequestRepository(dependencies)
  const creationInFlight = new Map<
    string,
    ReturnType<typeof repository.createRequest>
  >()

  function actorId() {
    const value = dependencies.getActorId()
    if (!value) {
      throw new ServiceRequestError(
        'unauthenticated',
        'Entre na sua conta para continuar.',
      )
    }
    return value
  }

  async function safely<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      throw normalizeOperationError(error)
    }
  }

  return {
    getOwnRequest(requestId: string) {
      const clientId = actorId()
      return safely(() => repository.getOwnRequest(requestId, clientId))
    },

    createRequest(input: ServiceRequestCreationInput) {
      const clientId = actorId()
      const pending = creationInFlight.get(input.operationKey)
      if (pending) return pending

      const operation = safely(async () => {
        const catalog = await (dependencies.listCatalog ?? listAvailableCatalog)()
        const normalized = normalizeCreationInput(
          input,
          catalog,
          clientId,
          dependencies.now?.() ?? new Date(),
        )
        return repository.createRequest(normalized)
      })
      creationInFlight.set(input.operationKey, operation)
      void operation.finally(() => {
        if (creationInFlight.get(input.operationKey) === operation) {
          creationInFlight.delete(input.operationKey)
        }
      }).catch(() => undefined)
      return operation
    },

    cancelOwnRequest(requestId: string) {
      const clientId = actorId()
      return safely(() => repository.cancelOwnRequest(requestId, clientId))
    },

    listRequestHistory(input: Omit<ServiceHistoryQuery, 'actorId'> & { ownEventsOnly?: boolean }) {
      const authenticatedActorId = actorId()
      return safely(() =>
        repository.listRequestHistory({
          requestId: input.requestId,
          pageSize: input.pageSize,
          ...(input.ownEventsOnly ? { actorId: authenticatedActorId } : {}),
        }),
      )
    },

    listOpenOpportunities(input: OpportunityQuery) {
      actorId()
      return safely(() => repository.listOpenOpportunities(input))
    },

    acceptRequest(input: Omit<AcceptRequestInput, 'professionalId'>) {
      const professionalId = actorId()
      return safely(() => repository.acceptRequest({ ...input, professionalId }))
    },

    refuseRequest(input: Omit<RefuseRequestInput, 'professionalId'>) {
      const professionalId = actorId()
      return safely(() => repository.refuseRequest({ ...input, professionalId }))
    },

    cancelAssignment(
      input: Omit<CancelAssignmentInput, 'professionalId'>,
    ) {
      const professionalId = actorId()
      return safely(() =>
        repository.cancelAssignment({ ...input, professionalId }),
      )
    },
  }
}

let defaultService: ReturnType<typeof createServiceRequestService> | undefined

function getDefaultService() {
  defaultService ??= createServiceRequestService({
    firestore: getFirebaseFirestore(),
    getActorId: () => getFirebaseAuth().currentUser?.uid ?? null,
  })
  return defaultService
}

export const serviceRequestService = {
  getOwnRequest(requestId: string) {
    return getDefaultService().getOwnRequest(requestId)
  },
  createRequest(input: ServiceRequestCreationInput) {
    return getDefaultService().createRequest(input)
  },
  cancelOwnRequest(requestId: string) {
    return getDefaultService().cancelOwnRequest(requestId)
  },
  listRequestHistory(
    input: Omit<ServiceHistoryQuery, 'actorId'> & { ownEventsOnly?: boolean },
  ) {
    return getDefaultService().listRequestHistory(input)
  },
  listOpenOpportunities(input: OpportunityQuery) {
    return getDefaultService().listOpenOpportunities(input)
  },
  acceptRequest(input: Omit<AcceptRequestInput, 'professionalId'>) {
    return getDefaultService().acceptRequest(input)
  },
  refuseRequest(input: Omit<RefuseRequestInput, 'professionalId'>) {
    return getDefaultService().refuseRequest(input)
  },
  cancelAssignment(input: Omit<CancelAssignmentInput, 'professionalId'>) {
    return getDefaultService().cancelAssignment(input)
  },
}
