import type { Firestore } from 'firebase/firestore'

import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase'
import {
  createServiceRequestRepository,
  type AcceptOpportunityInput,
  type AcceptRequestInput,
  type CancelAssignmentInput,
  type CancelClientRequestInput,
  type CompleteAssignmentInput,
  type CreateRequestInput,
  type DeclineOpportunityInput,
  type OpportunityFeedPageSnapshot,
  type OpportunityQuery,
  type OwnRequestDetailsSnapshot,
  type ProfessionalAppointmentDetailsSnapshot,
  type ProfessionalAppointmentsPageInput,
  type ProfessionalAppointmentsPageSnapshot,
  type RefuseRequestInput,
  type ServiceHistoryQuery,
  type StartAssignmentInput,
  type TransactionCoordinator,
  type UpdateRequestInput,
} from '../repositories/service-request.repository'
import { listAvailableCatalog } from './catalog.service'
import { getServiceRequestSchedulingWindow } from './service-period-policy'
import type { ServiceCatalog } from '../types/catalog'
import {
  ServiceRequestError,
  type OpportunityFeedCursor,
  type ServicePeriod,
} from '../types/service-request'
import { isIbgeMunicipalityCodeForState } from '../utils/ibge'

export interface ServiceRequestServiceDependencies {
  firestore: Firestore
  getActorId(): string | null
  now?: () => Date
  isOnline?: () => boolean
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

export interface ServiceRequestUpdateInput
  extends Omit<ServiceRequestCreationInput, 'contactName' | 'contactPhone'> {
  requestId: string
  expectedRound: number
}

export interface OpportunityFeedSubscriptionInput {
  pageSize?: number
  cursor?: OpportunityFeedCursor | null
  onAccessChange(eligible: boolean): void
  onPage(snapshot: OpportunityFeedPageSnapshot): void
  onError(error: ServiceRequestError): void
}

export interface ProfessionalAppointmentsSubscriptionInput
  extends ProfessionalAppointmentsPageInput {
  onPage(snapshot: ProfessionalAppointmentsPageSnapshot): void
  onError(error: ServiceRequestError): void
}

export interface ProfessionalAppointmentDetailsSubscriptionInput {
  requestId: string
  onDetails(snapshot: ProfessionalAppointmentDetailsSnapshot): void
  onUnavailable(error: ServiceRequestError): void
  onError(error: ServiceRequestError): void
}

export interface OwnRequestDetailsSubscriptionInput {
  requestId: string
  onDetails(snapshot: OwnRequestDetailsSnapshot): void
  onError(error: ServiceRequestError): void
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
  if (code === 'failed-precondition') {
    return new ServiceRequestError(
      'unavailable',
      'A consulta ainda não está disponível neste ambiente. Verifique a configuração dos índices do Firestore.',
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
  const mutationInFlight = new Map<string, Promise<unknown>>()

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

  async function safelyCancelOwnRequest(
    input: CancelClientRequestInput,
  ) {
    try {
      return await repository.cancelOwnRequest(input)
    } catch (error) {
      if (externalErrorCode(error) === 'permission-denied') {
        try {
          await repository.diagnoseClientCancellation(
            input.requestId,
            input.clientId,
            input.expectedRound,
            input.expectedAssignmentId,
          )
        } catch (diagnosisError) {
          if (diagnosisError instanceof ServiceRequestError) {
            throw diagnosisError
          }
        }
      }
      throw normalizeOperationError(error)
    }
  }

  async function safelyOpportunityAction<T>(
    professionalId: string,
    input: Omit<AcceptOpportunityInput, 'professionalId'>,
    operation: () => Promise<T>,
  ) {
    const online = dependencies.isOnline?.() ??
      (typeof navigator === 'undefined' || navigator.onLine !== false)
    if (!online) {
      throw new ServiceRequestError(
        'offline',
        'Conecte-se à internet para confirmar ou recusar uma oportunidade.',
      )
    }
    try {
      return await operation()
    } catch (error) {
      if (externalErrorCode(error) === 'permission-denied') {
        try {
          await repository.assertProfessionalOpportunityAccess(professionalId)
        } catch (accessError) {
          if (
            accessError instanceof ServiceRequestError &&
            accessError.code === 'professional-restricted'
          ) {
            throw accessError
          }
        }
        try {
          await repository.diagnoseOpportunityAction({
            ...input,
            professionalId,
          })
        } catch (diagnosisError) {
          if (diagnosisError instanceof ServiceRequestError) {
            throw diagnosisError
          }
        }
        throw new ServiceRequestError(
          'not-eligible',
          'Sua elegibilidade para esta oportunidade mudou. Atualize os dados antes de tentar novamente.',
          { cause: error },
        )
      }
      throw normalizeOperationError(error)
    }
  }

  function acceptOpportunity(
    input: Omit<AcceptOpportunityInput, 'professionalId'>,
  ) {
    const professionalId = actorId()
    return safelyOpportunityAction(professionalId, input, () =>
      repository.acceptOpportunity({ ...input, professionalId }),
    )
  }

  function declineOpportunity(
    input: Omit<DeclineOpportunityInput, 'professionalId'>,
  ) {
    const professionalId = actorId()
    return safelyOpportunityAction(professionalId, input, () =>
      repository.declineOpportunity({ ...input, professionalId }),
    )
  }

  return {
    getOwnRequest(requestId: string) {
      const clientId = actorId()
      return safely(() => repository.getOwnRequest(requestId, clientId))
    },

    getOwnRequestDetails(requestId: string) {
      const clientId = actorId()
      return safely(() => repository.getOwnRequestDetails(requestId, clientId))
    },

    subscribeOwnRequestDetails(input: OwnRequestDetailsSubscriptionInput) {
      const clientId = actorId()
      return repository.subscribeOwnRequestDetails(input.requestId, clientId, {
        onDetails: input.onDetails,
        onError: (error) => input.onError(normalizeOperationError(error)),
      })
    },

    getCurrentProfessionalAssignment(
      requestId: string,
      expectedAssignmentId: string,
    ) {
      const professionalId = actorId()
      return safely(() =>
        repository.getCurrentProfessionalAssignment(
          requestId,
          expectedAssignmentId,
          professionalId,
        ),
      )
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

    updateOwnRequest(input: ServiceRequestUpdateInput) {
      const clientId = actorId()
      const pending = mutationInFlight.get(input.operationKey)
      if (pending) return pending as ReturnType<typeof repository.updateOwnRequest>

      const operation = safely(async () => {
        const catalog = await (dependencies.listCatalog ?? listAvailableCatalog)()
        const normalized = normalizeCreationInput(
          {
            ...input,
            contactName: 'Cliente',
            contactPhone: '',
          },
          catalog,
          clientId,
          dependencies.now?.() ?? new Date(),
        )
        const update: UpdateRequestInput = {
          requestId: input.requestId,
          operationKey: normalized.operationKey,
          clientId,
          expectedRound: input.expectedRound,
          categoryId: normalized.categoryId,
          specialtyId: normalized.specialtyId,
          cityIbgeCode: normalized.cityIbgeCode,
          serviceDate: normalized.serviceDate,
          period: normalized.period,
          periodStartAt: normalized.periodStartAt,
          acceptUntil: normalized.acceptUntil,
          description: normalized.description,
          address: normalized.address,
        }
        return repository.updateOwnRequest(update)
      })
      mutationInFlight.set(input.operationKey, operation)
      void operation.finally(() => {
        if (mutationInFlight.get(input.operationKey) === operation) {
          mutationInFlight.delete(input.operationKey)
        }
      }).catch(() => undefined)
      return operation
    },

    cancelOwnRequest(
      input: Omit<CancelClientRequestInput, 'clientId'>,
    ) {
      const clientId = actorId()
      const pending = mutationInFlight.get(input.operationKey)
      if (pending) return pending as ReturnType<typeof repository.cancelOwnRequest>
      const operation = safelyCancelOwnRequest({ ...input, clientId })
      mutationInFlight.set(input.operationKey, operation)
      void operation.finally(() => {
        if (mutationInFlight.get(input.operationKey) === operation) {
          mutationInFlight.delete(input.operationKey)
        }
      }).catch(() => undefined)
      return operation
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
      const professionalId = actorId()
      return safely(() =>
        repository.listOpenOpportunities(input, professionalId),
      )
    },

    subscribeOpportunityFeed(input: OpportunityFeedSubscriptionInput) {
      const professionalId = actorId()
      let active = true
      let unsubscribe: (() => void) | undefined
      void (dependencies.listCatalog?.() ?? listAvailableCatalog())
        .then((catalog) => {
          if (!active) return
          unsubscribe = repository.subscribeOpportunityFeedPage(
            {
              catalog,
              pageSize: input.pageSize,
              cursor: input.cursor,
            },
            professionalId,
            {
              onAccessChange: input.onAccessChange,
              onPage: input.onPage,
              onError: (error) => input.onError(normalizeOperationError(error)),
            },
          )
        })
        .catch((error: unknown) => {
          if (active) input.onError(normalizeOperationError(error))
        })
      return () => {
        active = false
        unsubscribe?.()
      }
    },

    subscribeProfessionalAppointments(
      input: ProfessionalAppointmentsSubscriptionInput,
    ) {
      const professionalId = actorId()
      return repository.subscribeProfessionalAppointmentsPage(
        input,
        professionalId,
        {
          onPage: input.onPage,
          onError: (error) => input.onError(normalizeOperationError(error)),
        },
      )
    },

    subscribeProfessionalAppointmentDetails(
      input: ProfessionalAppointmentDetailsSubscriptionInput,
    ) {
      const professionalId = actorId()
      return repository.subscribeProfessionalAppointmentDetails(
        input.requestId,
        professionalId,
        {
          onDetails: input.onDetails,
          onUnavailable: input.onUnavailable,
          onError: (error) => input.onError(normalizeOperationError(error)),
        },
      )
    },

    acceptOpportunity,

    declineOpportunity,

    acceptRequest(input: Omit<AcceptRequestInput, 'professionalId'>) {
      return acceptOpportunity(input)
    },

    refuseRequest(input: Omit<RefuseRequestInput, 'professionalId'>) {
      return declineOpportunity(input)
    },

    startAssignment(input: Omit<StartAssignmentInput, 'professionalId'>) {
      const professionalId = actorId()
      const online = dependencies.isOnline?.() ??
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      if (!online) {
        return Promise.reject(
          new ServiceRequestError(
            'offline',
            'Conecte-se à internet para confirmar o início do atendimento.',
          ),
        )
      }
      const key = `start:${input.requestId}:${input.expectedAssignmentId}`
      const pending = mutationInFlight.get(key)
      if (pending) return pending as ReturnType<typeof repository.startAssignment>
      const operation = safely(() =>
        repository.startAssignment({ ...input, professionalId }),
      )
      mutationInFlight.set(key, operation)
      void operation.finally(() => {
        if (mutationInFlight.get(key) === operation) mutationInFlight.delete(key)
      }).catch(() => undefined)
      return operation
    },

    completeAssignment(input: Omit<CompleteAssignmentInput, 'professionalId'>) {
      const professionalId = actorId()
      const online = dependencies.isOnline?.() ??
        (typeof navigator === 'undefined' || navigator.onLine !== false)
      if (!online) {
        return Promise.reject(
          new ServiceRequestError(
            'offline',
            'Conecte-se à internet para informar a conclusão do atendimento.',
          ),
        )
      }
      const key = `complete:${input.requestId}:${input.expectedAssignmentId}`
      const pending = mutationInFlight.get(key)
      if (pending) return pending as ReturnType<typeof repository.completeAssignment>
      const completionInput = { ...input, professionalId }
      const operation = (async () => {
        try {
          return await safely(() => repository.completeAssignment(completionInput))
        } catch (error) {
          try {
            return await safely(() =>
              repository.reconcileCompletedAssignment(completionInput),
            )
          } catch {
            throw error
          }
        }
      })()
      mutationInFlight.set(key, operation)
      void operation.finally(() => {
        if (mutationInFlight.get(key) === operation) mutationInFlight.delete(key)
      }).catch(() => undefined)
      return operation
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
  getOwnRequestDetails(requestId: string) {
    return getDefaultService().getOwnRequestDetails(requestId)
  },
  subscribeOwnRequestDetails(input: OwnRequestDetailsSubscriptionInput) {
    return getDefaultService().subscribeOwnRequestDetails(input)
  },
  getCurrentProfessionalAssignment(
    requestId: string,
    expectedAssignmentId: string,
  ) {
    return getDefaultService().getCurrentProfessionalAssignment(
      requestId,
      expectedAssignmentId,
    )
  },
  createRequest(input: ServiceRequestCreationInput) {
    return getDefaultService().createRequest(input)
  },
  updateOwnRequest(input: ServiceRequestUpdateInput) {
    return getDefaultService().updateOwnRequest(input)
  },
  cancelOwnRequest(input: Omit<CancelClientRequestInput, 'clientId'>) {
    return getDefaultService().cancelOwnRequest(input)
  },
  listRequestHistory(
    input: Omit<ServiceHistoryQuery, 'actorId'> & { ownEventsOnly?: boolean },
  ) {
    return getDefaultService().listRequestHistory(input)
  },
  listOpenOpportunities(input: OpportunityQuery) {
    return getDefaultService().listOpenOpportunities(input)
  },
  subscribeOpportunityFeed(input: OpportunityFeedSubscriptionInput) {
    return getDefaultService().subscribeOpportunityFeed(input)
  },
  subscribeProfessionalAppointments(
    input: ProfessionalAppointmentsSubscriptionInput,
  ) {
    return getDefaultService().subscribeProfessionalAppointments(input)
  },
  subscribeProfessionalAppointmentDetails(
    input: ProfessionalAppointmentDetailsSubscriptionInput,
  ) {
    return getDefaultService().subscribeProfessionalAppointmentDetails(input)
  },
  acceptOpportunity(input: Omit<AcceptOpportunityInput, 'professionalId'>) {
    return getDefaultService().acceptOpportunity(input)
  },
  declineOpportunity(input: Omit<DeclineOpportunityInput, 'professionalId'>) {
    return getDefaultService().declineOpportunity(input)
  },
  acceptRequest(input: Omit<AcceptRequestInput, 'professionalId'>) {
    return getDefaultService().acceptRequest(input)
  },
  refuseRequest(input: Omit<RefuseRequestInput, 'professionalId'>) {
    return getDefaultService().refuseRequest(input)
  },
  startAssignment(input: Omit<StartAssignmentInput, 'professionalId'>) {
    return getDefaultService().startAssignment(input)
  },
  completeAssignment(input: Omit<CompleteAssignmentInput, 'professionalId'>) {
    return getDefaultService().completeAssignment(input)
  },
  cancelAssignment(input: Omit<CancelAssignmentInput, 'professionalId'>) {
    return getDefaultService().cancelAssignment(input)
  },
}
