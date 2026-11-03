import { getFirebaseAuth } from '../lib/firebase'
import {
  getProfessionalAvailabilityRepository,
  type ProfessionalAvailabilityRepository,
} from '../repositories/professional-availability.repository'
import {
  assertAvailabilityDate,
} from './service-period-policy'
import {
  SERVICE_PERIODS,
  ServiceRequestError,
} from '../types/service-request'
import type { ProfessionalAvailabilitySelection } from '../types/professional-availability'

export interface ProfessionalAvailabilityServiceDependencies {
  getActorId(): string | null
  repository: ProfessionalAvailabilityRepository
  now?: () => Date
}

export function createProfessionalAvailabilityService(
  dependencies: ProfessionalAvailabilityServiceDependencies,
) {
  function professionalId() {
    const actorId = dependencies.getActorId()
    if (!actorId) {
      throw new ServiceRequestError(
        'unauthenticated',
        'Entre na sua conta para editar sua disponibilidade.',
      )
    }
    return actorId
  }

  function validateDate(serviceDate: string) {
    try {
      assertAvailabilityDate(
        serviceDate,
        dependencies.now?.() ?? new Date(),
      )
    } catch (error) {
      throw new ServiceRequestError(
        'validation',
        error instanceof Error ? error.message : 'Escolha uma data válida.',
        { cause: error },
      )
    }
  }

  return {
    loadDay(serviceDate: string) {
      validateDate(serviceDate)
      return dependencies.repository.loadDay(professionalId(), serviceDate)
    },

    async saveDay(
      serviceDate: string,
      selection: ProfessionalAvailabilitySelection,
    ) {
      validateDate(serviceDate)
      if (
        SERVICE_PERIODS.some(
          (period) => typeof selection[period] !== 'boolean',
        )
      ) {
        throw new ServiceRequestError(
          'validation',
          'Informe a disponibilidade de todos os períodos.',
        )
      }
      const actorId = professionalId()
      await dependencies.repository.saveDay(actorId, serviceDate, selection)
      return dependencies.repository.loadDay(actorId, serviceDate)
    },
  }
}

let defaultService:
  | ReturnType<typeof createProfessionalAvailabilityService>
  | undefined

function getDefaultService() {
  defaultService ??= createProfessionalAvailabilityService({
    getActorId: () => getFirebaseAuth().currentUser?.uid ?? null,
    repository: getProfessionalAvailabilityRepository(),
  })
  return defaultService
}

export const professionalAvailabilityService = {
  loadDay(serviceDate: string) {
    return getDefaultService().loadDay(serviceDate)
  },
  saveDay(
    serviceDate: string,
    selection: ProfessionalAvailabilitySelection,
  ) {
    return getDefaultService().saveDay(serviceDate, selection)
  },
}
