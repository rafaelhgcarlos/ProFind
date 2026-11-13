import type { Firestore } from 'firebase/firestore'

import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase'
import { createAdminServiceRequestRepository } from '../repositories/admin-service-request.repository'
import {
  AdminRequestError,
  type AdminRequestFilters,
} from '../types/admin-service-request'

interface AdminServiceRequestDependencies {
  firestore: Firestore
  getActorId(): string | null
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
  if (error instanceof AdminRequestError) return error
  const code = externalErrorCode(error)
  if (code === 'permission-denied') {
    return new AdminRequestError(
      'permission-denied',
      'Esta conta não está autorizada a consultar os pedidos administrativos.',
      { cause: error },
    )
  }
  if (code === 'failed-precondition') {
    return new AdminRequestError(
      'unavailable',
      'A consulta requer um índice do Firestore que ainda não está disponível.',
      { cause: error },
    )
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new AdminRequestError(
      'unavailable',
      'A consulta de pedidos está temporariamente indisponível. Tente novamente.',
      { cause: error },
    )
  }
  return new AdminRequestError(
    'unknown',
    'Não foi possível consultar os pedidos.',
    { cause: error },
  )
}

export function createAdminServiceRequestService(
  dependencies: AdminServiceRequestDependencies,
) {
  const repository = createAdminServiceRequestRepository(dependencies.firestore)

  function assertAuthenticated() {
    if (!dependencies.getActorId()) {
      throw new AdminRequestError('unauthenticated', 'Entre na sua conta para continuar.')
    }
  }

  async function safely<T>(operation: () => Promise<T>) {
    assertAuthenticated()
    try {
      return await operation()
    } catch (error) {
      throw normalizeError(error)
    }
  }

  return {
    listRequests(input?: AdminRequestFilters) {
      return safely(() => repository.listRequests(input))
    },
    getDetail(requestId: string) {
      const normalized = requestId.trim()
      if (!normalized) {
        return Promise.reject(
          new AdminRequestError('validation', 'Informe o identificador do pedido.'),
        )
      }
      return safely(() => repository.getDetail(normalized))
    },
  }
}

let defaultService: ReturnType<typeof createAdminServiceRequestService> | undefined

function getDefaultService() {
  defaultService ??= createAdminServiceRequestService({
    firestore: getFirebaseFirestore(),
    getActorId: () => getFirebaseAuth().currentUser?.uid ?? null,
  })
  return defaultService
}

export const adminServiceRequestService = {
  listRequests(input?: AdminRequestFilters) {
    return getDefaultService().listRequests(input)
  },
  getDetail(requestId: string) {
    return getDefaultService().getDetail(requestId)
  },
}
