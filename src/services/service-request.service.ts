import type { Firestore } from 'firebase/firestore'

import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase'
import {
  createServiceRequestRepository,
  type AcceptRequestInput,
  type CancelAssignmentInput,
  type OpportunityQuery,
  type RefuseRequestInput,
  type ServiceHistoryQuery,
  type TransactionCoordinator,
} from '../repositories/service-request.repository'
import { ServiceRequestError } from '../types/service-request'

interface ServiceRequestServiceDependencies {
  firestore: Firestore
  getActorId(): string | null
  now?: () => Date
  coordinator?: TransactionCoordinator
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
