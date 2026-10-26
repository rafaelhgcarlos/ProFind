import { readFile } from 'node:fs/promises'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { TransactionCoordinator } from '../src/repositories/service-request.repository'
import { createServiceRequestService } from '../src/services/service-request.service'
import {
  getServicePeriodWindow,
  roundDocumentId,
  serviceSlotId,
} from '../src/services/service-period-policy'
import { ServiceRequestError } from '../src/types/service-request'

const projectId = 'profind-service-request-rules-test'
const clientId = 'client-owner'
const professionalA = 'professional-a'
const professionalB = 'professional-b'
const professionalC = 'professional-c'
const adminId = 'admin-operator'
const categoryId = 'maintenance'
const specialtyId = 'electrician'
const cityIbgeCode = '3509502'

let testEnvironment: RulesTestEnvironment

function saoPauloDate(daysAhead: number) {
  const target = new Date(Date.now() + daysAhead * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const serviceDate = saoPauloDate(10)
const slotId = serviceSlotId(serviceDate, 'MORNING')
const periodWindow = getServicePeriodWindow(serviceDate, 'MORNING')

function serviceFor(
  firestore: Firestore,
  actorId: string,
  coordinator?: TransactionCoordinator,
) {
  return createServiceRequestService({
    firestore,
    getActorId: () => actorId,
    coordinator,
  })
}

function coordinatedBarrier(parties: number): TransactionCoordinator {
  let arrivals = 0
  let released = false
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })

  return {
    async afterRead() {
      if (released) return
      arrivals += 1
      if (arrivals >= parties) {
        released = true
        release?.()
      }
      await waiting
    },
  }
}

function professionalProfile(professionalId: string) {
  return {
    ownerId: professionalId,
    publicName: `Profissional ${professionalId}`,
    categoryIds: [categoryId],
    specialtyIds: [specialtyId],
    baseLocation: {
      city: 'Campinas',
      stateCode: 'SP',
      ibgeCode: cityIbgeCode,
    },
    selectedCityIbgeCodes: [],
    availability: 'AVAILABLE',
    status: 'PUBLISHED',
  }
}

function operationalProfile(
  professionalId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    professionalId,
    reviewStatus: 'APPROVED',
    active: true,
    profileVersion: 1,
    approvedVersion: 1,
    approvedCategoryIds: [categoryId],
    approvedSpecialtyIds: [specialtyId],
    approvedBaseCityIbgeCode: cityIbgeCode,
    approvedSelectedCityIbgeCodes: [],
    eligibleCityIbgeCodes: [cityIbgeCode],
    ...overrides,
  }
}

function requestSummary(
  requestId: string,
  overrides: Record<string, unknown> = {},
) {
  const timestamp = new Date()
  return {
    requestId,
    clientId,
    categoryId,
    specialtyId,
    cityIbgeCode,
    serviceDate,
    period: 'MORNING',
    periodStartAt: periodWindow.startsAt,
    acceptUntil: periodWindow.acceptUntil,
    status: 'OPEN',
    round: 1,
    currentRoundId: roundDocumentId(1),
    assignedProfessionalId: null,
    currentAssignmentId: null,
    reopenReason: null,
    excludedProfessionalIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function initialRound(requestId: string) {
  const timestamp = new Date()
  return {
    roundId: roundDocumentId(1),
    requestId,
    round: 1,
    status: 'OPEN',
    reason: 'INITIAL',
    excludedProfessionalIds: [],
    previousAssignmentId: null,
    openedAt: timestamp,
    closedAt: null,
    closedReason: null,
    updatedAt: timestamp,
  }
}

async function seedScenario(requestIds = ['request-1']) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    for (const [userId, roles] of [
      [clientId, ['client']],
      [professionalA, ['professional']],
      [professionalB, ['professional']],
      [professionalC, ['professional']],
    ] as const) {
      await setDoc(doc(firestore, 'users', userId), {
        roles,
        activeMode: roles[0],
        professionalProfileStatus:
          roles[0] === 'professional' ? 'complete' : 'not-started',
      })
    }
    await setDoc(doc(firestore, 'adminAccess', adminId), {
      active: true,
      schemaVersion: 1,
    })

    for (const professionalId of [professionalA, professionalB, professionalC]) {
      await setDoc(
        doc(firestore, 'professionalProfiles', professionalId),
        professionalProfile(professionalId),
      )
      await setDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalId),
        operationalProfile(professionalId),
      )
      await setDoc(
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
          period: 'MORNING',
          available: true,
          updatedAt: new Date(),
        },
      )
    }

    for (const requestId of requestIds) {
      await setDoc(
        doc(firestore, 'serviceRequests', requestId),
        requestSummary(requestId),
      )
      await setDoc(
        doc(
          firestore,
          'serviceRequests',
          requestId,
          'rounds',
          roundDocumentId(1),
        ),
        initialRound(requestId),
      )
      await setDoc(doc(firestore, 'serviceRequestPrivate', requestId), {
        requestId,
        clientId,
        contactName: 'Cliente Exemplo',
        contactPhone: '11999998888',
        notes: 'Interfone 10',
        address: {
          street: 'Rua Privada',
          number: '100',
          neighborhood: 'Centro',
          city: 'Campinas',
          stateCode: 'SP',
          postalCode: '13000000',
          ibgeCode: cityIbgeCode,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })
}

async function inspect<T>(callback: (firestore: Firestore) => Promise<T>) {
  return testEnvironment.withSecurityRulesDisabled((context) =>
    callback(context.firestore()),
  )
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile('firestore.rules', 'utf8'),
    },
  })
})

afterEach(async () => {
  await testEnvironment.clearFirestore()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

describe('service request transactional proof', () => {
  it('permite a query proposta somente para profissional aprovado e mantém o resumo sem dados privados', async () => {
    await seedScenario()
    const approved = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const unapprovedFirestore = testEnvironment
      .authenticatedContext('ordinary-user')
      .firestore()

    const opportunities = await approved.listOpenOpportunities({
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING',
    })

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]).not.toHaveProperty('address')
    expect(opportunities[0]).not.toHaveProperty('contactPhone')
    await assertFails(
      getDocs(collection(unapprovedFirestore, 'serviceRequests')),
    )
  })

  it('coordena dois profissionais concorrentes e confirma somente um vencedor', async () => {
    await seedScenario()
    const barrier = coordinatedBarrier(2)
    const first = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      barrier,
    )
    const second = serviceFor(
      testEnvironment.authenticatedContext(professionalB).firestore(),
      professionalB,
      barrier,
    )

    const results = await Promise.allSettled([
      first.acceptRequest({ requestId: 'request-1', expectedRound: 1 }),
      second.acceptRequest({ requestId: 'request-1', expectedRound: 1 }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    await inspect(async (firestore) => {
      const request = await getDoc(doc(firestore, 'serviceRequests', 'request-1'))
      const assignments = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'assignments'),
      )
      const events = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'events'),
      )
      expect(request.data()?.status).toBe('ASSIGNED')
      expect([professionalA, professionalB]).toContain(
        request.data()?.assignedProfessionalId,
      )
      expect(assignments.size).toBe(1)
      expect(events.size).toBe(1)
    })
  })

  it('coordena dois pedidos no mesmo período e cria apenas uma reserva profissional', async () => {
    await seedScenario(['request-1', 'request-2'])
    const barrier = coordinatedBarrier(2)
    const first = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      barrier,
    )
    const second = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      barrier,
    )

    const results = await Promise.allSettled([
      first.acceptRequest({ requestId: 'request-1', expectedRound: 1 }),
      second.acceptRequest({ requestId: 'request-2', expectedRound: 1 }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    await inspect(async (firestore) => {
      const reservations = await getDocs(
        collection(
          firestore,
          'professionalReservations',
          professionalA,
          'slots',
        ),
      )
      const requests = await Promise.all([
        getDoc(doc(firestore, 'serviceRequests', 'request-1')),
        getDoc(doc(firestore, 'serviceRequests', 'request-2')),
      ])
      expect(reservations.size).toBe(1)
      expect(
        requests.filter((snapshot) => snapshot.data()?.status === 'ASSIGNED'),
      ).toHaveLength(1)
    })
  })

  it('mantém a recusa na rodada, libera a reserva ao cancelar e permite a substituição', async () => {
    await seedScenario()
    const first = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const second = serviceFor(
      testEnvironment.authenticatedContext(professionalB).firestore(),
      professionalB,
    )

    await first.refuseRequest({ requestId: 'request-1', expectedRound: 1 })
    await expect(
      first.acceptRequest({ requestId: 'request-1', expectedRound: 1 }),
    ).rejects.toMatchObject({ code: 'already-refused' })
    const accepted = await second.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    const reopened = await second.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: accepted.assignmentId,
    })

    expect(reopened.reopenedRound).toBe(2)
    await expect(
      second.acceptRequest({ requestId: 'request-1', expectedRound: 2 }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
    const replacement = await first.acceptRequest({
      requestId: 'request-1',
      expectedRound: 2,
    })
    expect(replacement.round).toBe(2)

    await inspect(async (firestore) => {
      const oldRefusal = await getDoc(
        doc(
          firestore,
          'serviceRequests',
          'request-1',
          'rounds',
          'round-1',
          'refusals',
          professionalA,
        ),
      )
      const oldReservation = await getDoc(
        doc(
          firestore,
          'professionalReservations',
          professionalB,
          'slots',
          slotId,
        ),
      )
      const replacementReservation = await getDoc(
        doc(
          firestore,
          'professionalReservations',
          professionalA,
          'slots',
          slotId,
        ),
      )
      expect(oldRefusal.exists()).toBe(true)
      expect(oldReservation.exists()).toBe(false)
      expect(replacementReservation.exists()).toBe(true)
    })
  })

  it('torna aceite e cancelamento idempotentes sem duplicar histórico', async () => {
    await seedScenario()
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const firstAccept = await professional.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    const retryAccept = await professional.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    expect(retryAccept.idempotent).toBe(true)

    const firstCancel = await professional.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: firstAccept.assignmentId,
    })
    const retryCancel = await professional.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: firstAccept.assignmentId,
    })
    expect(firstCancel.idempotent).toBe(false)
    expect(retryCancel.idempotent).toBe(true)

    await inspect(async (firestore) => {
      const assignments = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'assignments'),
      )
      const events = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'events'),
      )
      const rounds = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'rounds'),
      )
      expect(assignments.size).toBe(1)
      expect(events.size).toBe(2)
      expect(rounds.size).toBe(2)
    })
  })

  it.each([
    ['rodada antiga', { expectedRound: 2 }, {}, 'round-changed'],
    [
      'pedido vencido',
      { expectedRound: 1 },
      { acceptUntil: new Date(Date.now() - 60_000) },
      'request-expired',
    ],
    [
      'perfil não aprovado',
      { expectedRound: 1 },
      { operational: { reviewStatus: 'UNDER_REVIEW' } },
      'permission-denied',
    ],
    [
      'perfil inativo',
      { expectedRound: 1 },
      { operational: { active: false } },
      'permission-denied',
    ],
    [
      'versão desatualizada',
      { expectedRound: 1 },
      { operational: { profileVersion: 2, approvedVersion: 1 } },
      'permission-denied',
    ],
  ])('nega aceite para %s', async (_label, input, changes, expectedCode) => {
    await seedScenario()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore()
      if ('acceptUntil' in changes) {
        await updateDoc(doc(firestore, 'serviceRequests', 'request-1'), {
          acceptUntil: changes.acceptUntil,
        })
      }
      if ('operational' in changes) {
        await updateDoc(
          doc(firestore, 'professionalOperationalProfiles', professionalA),
          changes.operational,
        )
      }
    })
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )

    await expect(
      professional.acceptRequest({ requestId: 'request-1', ...input }),
    ).rejects.toMatchObject({ code: expectedCode })
  })

  it('rejeita writes diretos sem reserva/evento e com proprietário forjado', async () => {
    await seedScenario()
    const first = testEnvironment.authenticatedContext(professionalA).firestore()
    const second = testEnvironment.authenticatedContext(professionalB).firestore()
    const requestReference = doc(first, 'serviceRequests', 'request-1')
    const batch = writeBatch(first)
    batch.update(requestReference, {
      status: 'ASSIGNED',
      assignedProfessionalId: professionalA,
      currentAssignmentId: 'round-1',
      updatedAt: serverTimestamp(),
    })
    batch.set(doc(requestReference, 'assignments', 'round-1'), {
      assignmentId: 'round-1',
      requestId: 'request-1',
      professionalId: professionalA,
    })

    await assertFails(batch.commit())
    await assertFails(
      updateDoc(requestReference, {
        round: 2,
        currentRoundId: 'round-2',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      setDoc(
        doc(
          second,
          'professionalReservations',
          professionalA,
          'slots',
          slotId,
        ),
        {
          reservationId: slotId,
          professionalId: professionalA,
          requestId: 'request-1',
          assignmentId: 'round-1',
          serviceDate,
          period: 'MORNING',
          round: 1,
          createdAt: serverTimestamp(),
        },
      ),
    )
  })

  it('revoga os dados privados do antigo responsável após substituição', async () => {
    await seedScenario()
    const firstFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const secondFirestore = testEnvironment
      .authenticatedContext(professionalB)
      .firestore()
    const first = serviceFor(firstFirestore, professionalA)
    const second = serviceFor(secondFirestore, professionalB)
    const clientFirestore = testEnvironment.authenticatedContext(clientId).firestore()
    const adminFirestore = testEnvironment.authenticatedContext(adminId).firestore()
    const privateReferenceForFirst = doc(
      firstFirestore,
      'serviceRequestPrivate',
      'request-1',
    )

    await assertFails(getDoc(privateReferenceForFirst))
    await assertSucceeds(
      getDoc(doc(clientFirestore, 'serviceRequestPrivate', 'request-1')),
    )
    await assertSucceeds(
      getDoc(doc(adminFirestore, 'serviceRequestPrivate', 'request-1')),
    )
    const assignment = await first.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    await assertSucceeds(getDoc(privateReferenceForFirst))
    await first.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: assignment.assignmentId,
    })
    await assertFails(getDoc(privateReferenceForFirst))
    await second.acceptRequest({ requestId: 'request-1', expectedRound: 2 })
    await assertSucceeds(
      getDoc(doc(secondFirestore, 'serviceRequestPrivate', 'request-1')),
    )
    await assertFails(getDoc(privateReferenceForFirst))
  })

  it('mantém invariantes quando cancelamento e novo aceite partem juntos', async () => {
    await seedScenario()
    let reportCancellationRead: (() => void) | undefined
    let releaseCancellation: (() => void) | undefined
    const cancellationRead = new Promise<void>((resolve) => {
      reportCancellationRead = resolve
    })
    const cancellationRelease = new Promise<void>((resolve) => {
      releaseCancellation = resolve
    })
    const cancellationCoordinator: TransactionCoordinator = {
      async afterRead(operation) {
        if (operation !== 'cancel') return
        reportCancellationRead?.()
        await cancellationRelease
      },
    }
    const first = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      cancellationCoordinator,
    )
    const second = serviceFor(
      testEnvironment.authenticatedContext(professionalB).firestore(),
      professionalB,
    )
    const assignment = await first.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    const cancellation = first.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: assignment.assignmentId,
    })
    await cancellationRead
    const overlappingAccept = second.acceptRequest({
      requestId: 'request-1',
      expectedRound: 2,
    })

    await expect(overlappingAccept).rejects.toMatchObject({ code: 'round-changed' })
    releaseCancellation?.()
    await expect(cancellation).resolves.toMatchObject({ reopenedRound: 2 })

    const replacement = await second.acceptRequest({
      requestId: 'request-1',
      expectedRound: 2,
    })
    expect(replacement.round).toBe(2)
    await inspect(async (firestore) => {
      const request = await getDoc(doc(firestore, 'serviceRequests', 'request-1'))
      expect(request.data()?.status).toBe('ASSIGNED')
      expect(request.data()?.assignedProfessionalId).toBe(professionalB)
      expect(request.data()?.round).toBe(2)
    })
  })

  it('não permite que um retry de cancelamento afete atribuição posterior', async () => {
    await seedScenario()
    const first = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const second = serviceFor(
      testEnvironment.authenticatedContext(professionalB).firestore(),
      professionalB,
    )
    const oldAssignment = await first.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    await first.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: oldAssignment.assignmentId,
    })
    await second.acceptRequest({ requestId: 'request-1', expectedRound: 2 })

    const retry = await first.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: oldAssignment.assignmentId,
    })
    expect(retry.idempotent).toBe(true)
    await inspect(async (firestore) => {
      const request = await getDoc(doc(firestore, 'serviceRequests', 'request-1'))
      expect(request.data()?.status).toBe('ASSIGNED')
      expect(request.data()?.assignedProfessionalId).toBe(professionalB)
      expect(request.data()?.round).toBe(2)
    })
  })

  it('exige intervenção para período iniciado e não reabre pedido concluído', async () => {
    await seedScenario()
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const assignment = await professional.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'serviceRequests', 'request-1'), {
        status: 'COMPLETED',
      })
    })

    await expect(
      professional.cancelAssignment({
        requestId: 'request-1',
        expectedAssignmentId: assignment.assignmentId,
      }),
    ).rejects.toBeInstanceOf(ServiceRequestError)
    await expect(
      professional.cancelAssignment({
        requestId: 'request-1',
        expectedAssignmentId: assignment.assignmentId,
      }),
    ).rejects.toMatchObject({ code: 'intervention-required' })
  })

  it('exige intervenção quando o período da atribuição já começou', async () => {
    await seedScenario()
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const assignment = await professional.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'serviceRequests', 'request-1'), {
        periodStartAt: new Date(Date.now() - 60_000),
      })
    })

    await expect(
      professional.cancelAssignment({
        requestId: 'request-1',
        expectedAssignmentId: assignment.assignmentId,
      }),
    ).rejects.toMatchObject({ code: 'intervention-required' })
  })
})
