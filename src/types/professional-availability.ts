import type { ServicePeriod } from './service-request'

export interface ProfessionalAvailabilityPeriodState {
  period: ServicePeriod
  available: boolean
  reserved: boolean
}

export interface ProfessionalAvailabilityDay {
  serviceDate: string
  periods: ProfessionalAvailabilityPeriodState[]
}

export type ProfessionalAvailabilitySelection = Record<ServicePeriod, boolean>
