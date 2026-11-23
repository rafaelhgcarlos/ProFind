import { readFile } from 'node:fs/promises'

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  createProfessionalProfileRepository,
} from '../src/repositories/professional-profile.repository'
import { createProfessionalAvailabilityRepository } from '../src/repositories/professional-availability.repository'
import type { TransactionCoordinator } from '../src/repositories/service-request.repository'
import { createAdminServiceRequestService } from '../src/services/admin-service-request.service'
import { createProfessionalAvailabilityService } from '../src/services/professional-availability.service'
import { createProfessionalReviewService } from '../src/services/professional-review.service'
import {
  saveProfessionalProfile,
  type ProfessionalProfileDependencies,
} from '../src/services/professional-profile.service'
import { createServiceReportService } from '../src/services/service-report.service'
import { createServiceRequestService } from '../src/services/service-request.service'
import { roundDocumentId, serviceSlotId } from '../src/services/service-period-policy'
import type { ServiceCatalog } from '../src/types/catalog'
import type {
  ProfessionalProfile,
  ProfessionalProfileInput,
} from '../src/types/professional-profile'

const projectId = 'profind-mvp-multi-user-test'
const adminId = 'mvp-admin'
const clientId = 'mvp-client'
const professionalIds = ['mvp-professional-a', 'mvp-professional-b', 'mvp-professional-c'] as const
const incompatibleProfessionalId = 'mvp-professional-d'
const categoryId = 'maintenance'
const specialtyId = 'electrician'
const incompatibleCategoryId = 'residential'
const incompatibleSpecialtyId = 'gardener'
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

const catalog: ServiceCatalog = {
  categories: [
    { id: categoryId, name: 'Manutenção', active: true, order: 1 },
    {
      id: incompatibleCategoryId,
      name: 'Serviços residenciais',
      active: true,
      order: 2,
    },
  ],
  specialties: [
    {
      id: specialtyId,
      categoryId,
      name: 'Eletricista',
      active: true,
      order: 1,
    },
    {
      id: incompatibleSpecialtyId,
      categoryId: incompatibleCategoryId,
      name: 'Jardineiro',
      active: true,
      order: 1,
    },
  ],
}

function profileInput(
  professionalId: string,
  compatible: boolean,
  headline = 'Atendimento residencial demonstrativo',
): ProfessionalProfileInput {
  return {
    publicName: `Profissional ${professionalId.slice(-1).toUpperCase()}`,
    headline,
    bio: 'Perfil criado pela própria identidade no emulador.',
    categoryIds: [compatible ? categoryId : incompatibleCategoryId],
    specialtyIds: [compatible ? specialtyId : incompatibleSpecialtyId],
    experienceYears: 5,
    baseLocation: {
      city: 'Campinas',
      stateCode: 'SP',
      ibgeCode: cityIbgeCode,
    },
    serviceMode: 'CITY_ONLY',
    serviceRadiusKm: null,
    selectedCities: [],
    availability: 'AVAILABLE',
    phone: '11999998888',
    contactVisibility: 'PRIVATE',
    privateLocation: {
      postalCode: '13000000',
      neighborhood: 'Centro',
    },
    profileImage: null,
    portfolioImages: [],
  }
}

function profileDependencies(firestore: Firestore): ProfessionalProfileDependencies {
  return {
    ...createProfessionalProfileRepository(firestore),
    persistenceTimeoutMs: 5_000,
  }
}

function reviewFor(firestore: Firestore, actorId: string) {
  return createProfessionalReviewService({
    firestore,
    getActorId: () => actorId,
  })
}

function serviceFor(
  firestore: Firestore,
  actorId: string,
  coordinator?: TransactionCoordinator,
  now?: () => Date,
) {
  return createServiceRequestService({
    firestore,
    getActorId: () => actorId,
    coordinator,
    now,
    listCatalog: async () => catalog,
  })
}

function reportsFor(firestore: Firestore, actorId: string) {
  return createServiceReportService({
    firestore,
    getActorId: () => actorId,
    now: () => new Date(),
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

async function seedBaseIdentities() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await setDoc(doc(firestore, 'adminAccess', adminId), {
      active: true,
      schemaVersion: 1,
    })
    await setDoc(doc(firestore, 'users', adminId), {
      name: 'Admin MVP',
      email: 'admin@example.test',
      roles: ['client'],
      activeMode: 'client',
      professionalProfileStatus: 'not-started',
    })
    await setDoc(doc(firestore, 'users', clientId), {
      name: 'Cliente MVP',
      email: 'client@example.test',
      roles: ['client'],
      activeMode: 'client',
      professionalProfileStatus: 'not-started',
    })
    await setDoc(doc(firestore, 'clientProfiles', clientId), {
      ownerId: clientId,
      phone: '',
      profileImage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    for (const professionalId of [
      ...professionalIds,
      incompatibleProfessionalId,
    ]) {
      await setDoc(doc(firestore, 'users', professionalId), {
        name: professionalId,
        email: `${professionalId}@example.test`,
        roles: ['professional'],
        activeMode: 'professional',
        professionalProfileStatus: 'not-started',
      })
    }
    for (const category of catalog.categories) {
      await setDoc(doc(firestore, 'categories', category.id), category)
    }
    for (const specialty of catalog.specialties) {
      await setDoc(doc(firestore, 'specialties', specialty.id), specialty)
    }
  })
}

async function registerAndSubmitProfessional(
  professionalId: string,
  compatible: boolean,
) {
  const firestore = testEnvironment
    .authenticatedContext(professionalId)
    .firestore()
  const dependencies = profileDependencies(firestore)
  const input = profileInput(professionalId, compatible)
  const saved = await saveProfessionalProfile(
    professionalId,
    input,
    'PUBLISHED',
    catalog,
    null,
    dependencies,
  )
  const review = await reviewFor(firestore, professionalId)
    .findByProfessionalId(professionalId)
  expect(review).toMatchObject({
    reviewStatus: 'UNDER_REVIEW',
    active: false,
    profileVersion: 1,
    submittedVersion: 1,
    revision: 1,
  })
  return { dependencies, input, saved }
}

async function makeAvailable(professionalId: string) {
  const firestore = testEnvironment
    .authenticatedContext(professionalId)
    .firestore()
  const availability = createProfessionalAvailabilityService({
    getActorId: () => professionalId,
    repository: createProfessionalAvailabilityRepository(firestore),
  })
  await availability.saveDay(serviceDate, {
    MORNING: true,
    AFTERNOON: false,
    EVENING: false,
  })
}

async function trackingOnce(
  service: ReturnType<typeof serviceFor>,
  requestId: string,
  expectedStatus: string,
) {
  return new Promise<{
    status: string
    professionalId: string | null
  }>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined
    unsubscribe = service.subscribeOwnRequestTracking({
      requestId,
      onDetails(snapshot) {
        if (snapshot.details.request.status !== expectedStatus) return
        unsubscribe()
        resolve({
          status: snapshot.details.request.status,
          professionalId:
            snapshot.details.currentProfessional?.professionalId ?? null,
        })
      },
      onProfileError: reject,
      onError: reject,
    })
  })
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
})

afterEach(async () => {
  await testEnvironment.clearFirestore()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

describe('MVP multi-user flow in isolated emulators', () => {
  it('orchestrates self-registration, review, concurrent acceptance, replacement and completion', async () => {
    await seedBaseIdentities()

    const registrations = new Map<string, {
      dependencies: ProfessionalProfileDependencies
      input: ProfessionalProfileInput
      saved: ProfessionalProfile
    }>()
    for (const professionalId of [
      ...professionalIds,
      incompatibleProfessionalId,
    ]) {
      registrations.set(
        professionalId,
        await registerAndSubmitProfessional(
          professionalId,
          professionalId !== incompatibleProfessionalId,
        ),
      )
    }

    const adminFirestore = testEnvironment
      .authenticatedContext(adminId)
      .firestore()
    const adminReview = reviewFor(adminFirestore, adminId)
    await adminReview.decide({
      professionalId: professionalIds[0],
      expectedVersion: 1,
      expectedRevision: 1,
      decision: 'CHANGES_REQUESTED',
      feedback: 'Detalhe melhor a experiência no título do perfil.',
      internalNote: 'Ajuste solicitado pelo cenário automatizado.',
    })

    const firstRegistration = registrations.get(professionalIds[0])!
    const firstFirestore = testEnvironment
      .authenticatedContext(professionalIds[0])
      .firestore()
    const corrected = await saveProfessionalProfile(
      professionalIds[0],
      profileInput(
        professionalIds[0],
        true,
        'Eletricista residencial com experiência em manutenção',
      ),
      'PUBLISHED',
      catalog,
      firstRegistration.saved,
      firstRegistration.dependencies,
    )
    expect(corrected.headline).toMatch(/experiência/i)

    const correctedReview = await reviewFor(
      firstFirestore,
      professionalIds[0],
    ).findByProfessionalId(professionalIds[0])
    expect(correctedReview).toMatchObject({
      reviewStatus: 'UNDER_REVIEW',
      profileVersion: 2,
      submittedVersion: 2,
      revision: 3,
    })

    for (const professionalId of [
      ...professionalIds,
      incompatibleProfessionalId,
    ]) {
      const review = await adminReview.findByProfessionalId(professionalId)
      await adminReview.decide({
        professionalId,
        expectedVersion: review!.profileVersion,
        expectedRevision: review!.revision,
        decision: 'APPROVED',
        activateOnApproval: true,
        internalNote: 'Cadastro demonstrativo aprovado no emulador.',
      })
      await makeAvailable(professionalId)
    }

    const clientFirestore = testEnvironment
      .authenticatedContext(clientId)
      .firestore()
    const client = serviceFor(clientFirestore, clientId)
    const created = await client.createRequest({
      operationKey: 'mvp-request-operation-000001',
      specialtyId,
      description: 'Revisar tomadas e o quadro de energia da residência.',
      city: 'Campinas',
      stateCode: 'SP',
      cityIbgeCode,
      street: 'Rua Privada',
      number: '100',
      complement: '',
      neighborhood: 'Centro',
      postalCode: '13000000',
      serviceDate,
      period: 'MORNING',
      contactName: 'Cliente MVP',
      contactPhone: '',
    })
    const requestId = created.request.requestId

    for (const professionalId of professionalIds) {
      const professionalFirestore = testEnvironment
        .authenticatedContext(professionalId)
        .firestore()
      const opportunities = await serviceFor(
        professionalFirestore,
        professionalId,
      ).listOpenOpportunities({
        categoryId,
        specialtyId,
        cityIbgeCode,
        serviceDate,
        period: 'MORNING',
      })
      expect(opportunities.items.map((item) => item.requestId)).toContain(requestId)
      const details = await getDoc(
        doc(
          professionalFirestore,
          'serviceRequestOpportunityDetails',
          requestId,
        ),
      )
      expect(details.exists()).toBe(true)
      await assertFails(
        getDoc(doc(professionalFirestore, 'serviceRequestPrivate', requestId)),
      )
    }

    const incompatibleFirestore = testEnvironment
      .authenticatedContext(incompatibleProfessionalId)
      .firestore()
    await expect(
      serviceFor(incompatibleFirestore, incompatibleProfessionalId)
        .listOpenOpportunities({
          categoryId,
          specialtyId,
          cityIbgeCode,
          serviceDate,
          period: 'MORNING',
        }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
    await assertFails(
      getDoc(
        doc(
          incompatibleFirestore,
          'serviceRequestOpportunityDetails',
          requestId,
        ),
      ),
    )

    const third = serviceFor(
      testEnvironment.authenticatedContext(professionalIds[2]).firestore(),
      professionalIds[2],
    )
    await third.declineOpportunity({ requestId, expectedRound: 1 })

    const barrier = coordinatedBarrier(2)
    const contenders = professionalIds.slice(0, 2).map((professionalId) =>
      serviceFor(
        testEnvironment.authenticatedContext(professionalId).firestore(),
        professionalId,
        barrier,
      ),
    )
    const acceptanceResults = await Promise.allSettled(
      contenders.map((service) =>
        service.acceptOpportunity({ requestId, expectedRound: 1 }),
      ),
    )
    expect(
      acceptanceResults.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      acceptanceResults.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1)

    const assignedAfterRace = await getDoc(
      doc(clientFirestore, 'serviceRequests', requestId),
    )
    const firstWinner = String(assignedAfterRace.data()?.assignedProfessionalId)
    const firstAssignmentId = String(assignedAfterRace.data()?.currentAssignmentId)
    expect(professionalIds).toContain(firstWinner as (typeof professionalIds)[number])

    const winner = serviceFor(
      testEnvironment.authenticatedContext(firstWinner).firestore(),
      firstWinner,
    )
    await winner.cancelAssignment({
      requestId,
      expectedAssignmentId: firstAssignmentId,
      reason: 'Não conseguirei comparecer ao atendimento agendado.',
    })

    const reopened = await getDoc(doc(clientFirestore, 'serviceRequests', requestId))
    expect(reopened.data()).toMatchObject({
      status: 'OPEN',
      round: 2,
      currentRoundId: roundDocumentId(2),
      assignedProfessionalId: null,
      excludedProfessionalIds: [firstWinner],
    })
    expect(
      (
        await getDoc(
          doc(
            clientFirestore,
            'serviceRequests',
            requestId,
            'rounds',
            roundDocumentId(2),
          ),
        )
      ).data(),
    ).toMatchObject({ reason: 'PROFESSIONAL_CANCELLATION', status: 'OPEN' })
    expect(
      (
        await getDoc(
          doc(
            testEnvironment
              .authenticatedContext(firstWinner)
              .firestore(),
            'professionalReservations',
            firstWinner,
            'slots',
            slotId,
          ),
        )
      ).exists(),
    ).toBe(false)

    await expect(
      winner.acceptOpportunity({ requestId, expectedRound: 2 }),
    ).rejects.toMatchObject({ code: 'excluded-from-round' })

    const replacement = await third.acceptOpportunity({
      requestId,
      expectedRound: 2,
    })
    expect(await trackingOnce(client, requestId, 'ASSIGNED')).toEqual({
      status: 'ASSIGNED',
      professionalId: professionalIds[2],
    })
    await assertFails(
      getDoc(
        doc(
          testEnvironment.authenticatedContext(firstWinner).firestore(),
          'serviceRequestPrivate',
          requestId,
        ),
      ),
    )
    expect(
      (
        await getDoc(
          doc(
            testEnvironment.authenticatedContext(professionalIds[2]).firestore(),
            'serviceRequestPrivate',
            requestId,
          ),
        )
      ).exists(),
    ).toBe(true)

    const clientReports = reportsFor(clientFirestore, clientId)
    const openedReport = await clientReports.openReport({
      operationKey: 'mvp-report-operation-000001',
      requestId,
      reason: 'NO_SHOW',
      description: 'Relato demonstrativo de ausência para acompanhamento administrativo.',
    })
    const adminRequests = createAdminServiceRequestService({
      firestore: adminFirestore,
      getActorId: () => adminId,
    })
    const pending = await adminRequests.listRequests({
      pending: 'OPEN_REPORT',
      pageSize: 10,
    })
    expect(pending.items.map((item) => item.request.requestId)).toContain(requestId)
    const adminReports = reportsFor(adminFirestore, adminId)
    await adminReports.reviewReport({
      reportId: openedReport.report.reportId,
      operationKey: 'mvp-report-review-000001',
      expectedRevision: openedReport.report.revision,
      internalNote: 'Relato acompanhado no cenário isolado.',
    })
    await adminReports.resolveReport({
      reportId: openedReport.report.reportId,
      operationKey: 'mvp-report-resolve-0001',
      expectedRevision: 2,
      decision: 'NO_OPERATIONAL_CHANGE',
      justification: 'Registro mantido sem alterar automaticamente o atendimento.',
    })

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'serviceRequests', requestId), {
        periodStartAt: new Date(Date.now() - 60_000),
      })
    })
    const replacementProfessional = serviceFor(
      testEnvironment
        .authenticatedContext(professionalIds[2])
        .firestore(),
      professionalIds[2],
    )
    await replacementProfessional.startAssignment({
      requestId,
      expectedAssignmentId: replacement.assignmentId,
      expectedRound: 2,
    })
    expect(await trackingOnce(client, requestId, 'IN_PROGRESS')).toEqual({
      status: 'IN_PROGRESS',
      professionalId: professionalIds[2],
    })
    await replacementProfessional.completeAssignment({
      requestId,
      expectedAssignmentId: replacement.assignmentId,
      expectedRound: 2,
    })
    expect(await trackingOnce(client, requestId, 'COMPLETED')).toEqual({
      status: 'COMPLETED',
      professionalId: professionalIds[2],
    })

    const [
      requestSnapshot,
      firstAssignment,
      replacementAssignment,
      firstRound,
      replacementRound,
      events,
      reservation,
    ] =
      await Promise.all([
        getDoc(doc(clientFirestore, 'serviceRequests', requestId)),
        getDoc(
          doc(
            clientFirestore,
            'serviceRequests',
            requestId,
            'assignments',
            firstAssignmentId,
          ),
        ),
        getDoc(
          doc(
            clientFirestore,
            'serviceRequests',
            requestId,
            'assignments',
            replacement.assignmentId,
          ),
        ),
        getDoc(
          doc(
            clientFirestore,
            'serviceRequests',
            requestId,
            'rounds',
            roundDocumentId(1),
          ),
        ),
        getDoc(
          doc(
            clientFirestore,
            'serviceRequests',
            requestId,
            'rounds',
            roundDocumentId(2),
          ),
        ),
        getDocs(query(
          collection(clientFirestore, 'serviceRequests', requestId, 'events'),
          limit(50),
        )),
        getDoc(
          doc(
            testEnvironment.authenticatedContext(professionalIds[2]).firestore(),
            'professionalReservations',
            professionalIds[2],
            'slots',
            slotId,
          ),
        ),
      ])
    expect(requestSnapshot.data()).toMatchObject({
      status: 'COMPLETED',
      assignedProfessionalId: professionalIds[2],
      currentAssignmentId: replacement.assignmentId,
      round: 2,
    })
    expect(firstAssignment.data()).toMatchObject({ status: 'CANCELLED' })
    expect(replacementAssignment.data()).toMatchObject({ status: 'COMPLETED' })
    expect(firstRound.data()).toMatchObject({ status: 'CLOSED' })
    expect(replacementRound.data()).toMatchObject({ status: 'CLOSED' })
    expect(reservation.data()).toMatchObject({
      status: 'COMPLETED',
      requestId,
      assignmentId: replacement.assignmentId,
    })
    const eventTypes = events.docs.map((snapshot) => snapshot.data().type)
    expect(eventTypes.filter((type) => type === 'REQUEST_ASSIGNED')).toHaveLength(2)
    expect(
      eventTypes.filter((type) => type === 'PROFESSIONAL_CANCELLED_AND_REOPENED'),
    ).toHaveLength(1)
    expect(eventTypes.filter((type) => type === 'SERVICE_STARTED')).toHaveLength(1)
    expect(eventTypes.filter((type) => type === 'SERVICE_COMPLETED')).toHaveLength(1)

    const directWrite = doc(
      testEnvironment.authenticatedContext(incompatibleProfessionalId).firestore(),
      'serviceRequests',
      requestId,
    )
    await assertFails(
      updateDoc(directWrite, {
        assignedProfessionalId: incompatibleProfessionalId,
      }),
    )

    expect(
      [firstAssignment, replacementAssignment].filter(
        (snapshot) => snapshot.data()?.status !== 'CANCELLED',
      ),
    ).toHaveLength(1)
  }, 30_000)
})
