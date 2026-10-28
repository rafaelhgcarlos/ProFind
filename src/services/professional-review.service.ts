import type { Firestore } from 'firebase/firestore'

import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase'
import {
  createProfessionalReviewRepository,
  type AssistProfessionalProfileInput,
  type DecideReviewInput,
  type ProfessionalReviewQueueInput,
  type ReviewTransactionCoordinator,
  type SetProfessionalActiveInput,
  type SubmitReviewInput,
  type SuspendReviewInput,
} from '../repositories/professional-review.repository'
import { ProfessionalReviewError } from '../types/professional-review'

interface ProfessionalReviewServiceDependencies {
  firestore: Firestore
  getActorId(): string | null
  coordinator?: ReviewTransactionCoordinator
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
  if (error instanceof ProfessionalReviewError) return error
  const code = externalErrorCode(error)
  if (code === 'permission-denied') {
    return new ProfessionalReviewError(
      'permission-denied',
      'A operação não atende às regras de autorização e consistência.',
      { cause: error },
    )
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new ProfessionalReviewError(
      'unavailable',
      'A análise está temporariamente indisponível. Tente novamente.',
      { cause: error },
    )
  }
  return new ProfessionalReviewError(
    'unknown',
    'Não foi possível concluir a operação de análise.',
    { cause: error },
  )
}

export function createProfessionalReviewService(
  dependencies: ProfessionalReviewServiceDependencies,
) {
  const repository = createProfessionalReviewRepository(dependencies)

  function actorId() {
    const value = dependencies.getActorId()
    if (!value) {
      throw new ProfessionalReviewError(
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
      throw normalizeError(error)
    }
  }

  return {
    findByProfessionalId(professionalId: string) {
      actorId()
      return safely(() => repository.findByProfessionalId(professionalId))
    },
    listHistory(professionalId: string, pageSize?: number) {
      actorId()
      return safely(() => repository.listHistory(professionalId, pageSize))
    },
    listQueue(input?: ProfessionalReviewQueueInput) {
      actorId()
      return safely(() => repository.listQueue(input))
    },
    findAdminDetail(professionalId: string) {
      actorId()
      return safely(() => repository.findAdminDetail(professionalId))
    },
    submitForReview(input: Omit<SubmitReviewInput, 'actorId'>) {
      return safely(() => repository.submitForReview({ ...input, actorId: actorId() }))
    },
    decide(input: Omit<DecideReviewInput, 'actorId'>) {
      return safely(() => repository.decide({ ...input, actorId: actorId() }))
    },
    suspend(input: Omit<SuspendReviewInput, 'actorId'>) {
      return safely(() => repository.suspend({ ...input, actorId: actorId() }))
    },
    setActive(input: Omit<SetProfessionalActiveInput, 'actorId'>) {
      return safely(() => repository.setActive({ ...input, actorId: actorId() }))
    },
    assistProfile(input: Omit<AssistProfessionalProfileInput, 'actorId'>) {
      return safely(() => repository.assistProfile({ ...input, actorId: actorId() }))
    },
  }
}

let defaultService: ReturnType<typeof createProfessionalReviewService> | undefined

function getDefaultService() {
  defaultService ??= createProfessionalReviewService({
    firestore: getFirebaseFirestore(),
    getActorId: () => getFirebaseAuth().currentUser?.uid ?? null,
  })
  return defaultService
}

export const professionalReviewService = {
  findByProfessionalId(professionalId: string) {
    return getDefaultService().findByProfessionalId(professionalId)
  },
  listHistory(professionalId: string, pageSize?: number) {
    return getDefaultService().listHistory(professionalId, pageSize)
  },
  listQueue(input?: ProfessionalReviewQueueInput) {
    return getDefaultService().listQueue(input)
  },
  findAdminDetail(professionalId: string) {
    return getDefaultService().findAdminDetail(professionalId)
  },
  submitForReview(input: Omit<SubmitReviewInput, 'actorId'>) {
    return getDefaultService().submitForReview(input)
  },
  decide(input: Omit<DecideReviewInput, 'actorId'>) {
    return getDefaultService().decide(input)
  },
  suspend(input: Omit<SuspendReviewInput, 'actorId'>) {
    return getDefaultService().suspend(input)
  },
  setActive(input: Omit<SetProfessionalActiveInput, 'actorId'>) {
    return getDefaultService().setActive(input)
  },
  assistProfile(input: Omit<AssistProfessionalProfileInput, 'actorId'>) {
    return getDefaultService().assistProfile(input)
  },
}
