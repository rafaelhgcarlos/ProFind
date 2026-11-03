import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'
import { serviceSlotId } from '../services/service-period-policy'
import {
  SERVICE_PERIODS,
  type ServicePeriod,
} from '../types/service-request'
import type {
  ProfessionalAvailabilityDay,
  ProfessionalAvailabilitySelection,
} from '../types/professional-availability'

export interface ProfessionalAvailabilityRepository {
  loadDay(
    professionalId: string,
    serviceDate: string,
  ): Promise<ProfessionalAvailabilityDay>
  saveDay(
    professionalId: string,
    serviceDate: string,
    selection: ProfessionalAvailabilitySelection,
  ): Promise<void>
}

export function createProfessionalAvailabilityRepository(
  firestore: Firestore,
): ProfessionalAvailabilityRepository {
  return {
    async loadDay(professionalId, serviceDate) {
      const snapshots = await Promise.all(
        SERVICE_PERIODS.flatMap((period) => {
          const slotId = serviceSlotId(serviceDate, period)
          return [
            getDoc(
              doc(
                firestore,
                'professionalAvailability',
                professionalId,
                'slots',
                slotId,
              ),
            ),
            getDoc(
              doc(
                firestore,
                'professionalReservations',
                professionalId,
                'slots',
                slotId,
              ),
            ),
          ]
        }),
      )

      return {
        serviceDate,
        periods: SERVICE_PERIODS.map((period, index) => ({
          period,
          available: snapshots[index * 2].data()?.available === true,
          reserved: snapshots[index * 2 + 1].exists(),
        })),
      }
    },

    async saveDay(professionalId, serviceDate, selection) {
      const batch = writeBatch(firestore)
      for (const period of SERVICE_PERIODS) {
        const slotId = serviceSlotId(serviceDate, period)
        batch.set(
          doc(
            firestore,
            'professionalAvailability',
            professionalId,
            'slots',
            slotId,
          ),
          {
            professionalId,
            serviceDate,
            period,
            available: selection[period],
            updatedAt: serverTimestamp(),
          },
        )
      }
      await batch.commit()
    },
  }
}

let defaultRepository: ProfessionalAvailabilityRepository | undefined

export function getProfessionalAvailabilityRepository() {
  defaultRepository ??= createProfessionalAvailabilityRepository(
    getFirebaseFirestore(),
  )
  return defaultRepository
}

export function availabilitySelectionFromDay(
  day: ProfessionalAvailabilityDay,
): ProfessionalAvailabilitySelection {
  return Object.fromEntries(
    day.periods.map((period) => [period.period, period.available]),
  ) as Record<ServicePeriod, boolean>
}
