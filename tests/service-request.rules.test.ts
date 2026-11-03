import { readFile } from 'node:fs/promises'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type {
  OpportunityFeedPageSnapshot,
  TransactionCoordinator,
} from '../src/repositories/service-request.repository'
import { createProfessionalAvailabilityRepository } from '../src/repositories/professional-availability.repository'
import { createProfessionalAvailabilityService } from '../src/services/professional-availability.service'
import { createProfessionalReviewService } from '../src/services/professional-review.service'
import { createServiceRequestService } from '../src/services/service-request.service'
import {
  assignmentEventId,
  getServicePeriodWindow,
  roundDocumentId,
  serviceSlotId,
} from '../src/services/service-period-policy'
import {
  ServiceRequestError,
  type OpportunityFeedCursor,
} from '../src/types/service-request'

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
  now?: () => Date,
) {
  return createServiceRequestService({
    firestore,
    getActorId: () => actorId,
    coordinator,
    now,
    listCatalog: async () => ({
      categories: [{ id: categoryId, name: 'Manutenção', active: true, order: 1 }],
      specialties: [{ id: specialtyId, categoryId, name: 'Eletricista', active: true, order: 1 }],
    }),
  })
}

function feedFor(
  service: ReturnType<typeof serviceFor>,
  pageSize = 12,
  cursor: OpportunityFeedCursor | null = null,
) {
  const snapshots: OpportunityFeedPageSnapshot[] = []
  const waiters: Array<{
    predicate(snapshot: OpportunityFeedPageSnapshot): boolean
    resolve(snapshot: OpportunityFeedPageSnapshot): void
    reject(error: unknown): void
  }> = []
  let subscriptionError: unknown
  let eligible = false
  const unsubscribe = service.subscribeOpportunityFeed({
    pageSize,
    cursor,
    onAccessChange(value) {
      eligible = value
    },
    onPage(snapshot) {
      snapshots.push(snapshot)
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(snapshot)) continue
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve(snapshot)
      }
    },
    onError(error) {
      subscriptionError = error
      for (const waiter of waiters.splice(0)) waiter.reject(error)
    },
  })

  return {
    unsubscribe,
    isEligible: () => eligible,
    waitForPage(
      predicate: (snapshot: OpportunityFeedPageSnapshot) => boolean,
    ) {
      const existing = snapshots.find(predicate)
      if (existing) return Promise.resolve(existing)
      if (subscriptionError) return Promise.reject(subscriptionError)
      return new Promise<OpportunityFeedPageSnapshot>((resolve, reject) => {
        waiters.push({ predicate, resolve, reject })
      })
    },
  }
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
    headline: 'Profissional de manutenção residencial',
    bio: 'Atendimento demonstrativo.',
    categoryIds: [categoryId],
    specialtyIds: [specialtyId],
    experienceYears: 5,
    baseLocation: {
      city: 'Campinas',
      stateCode: 'SP',
      ibgeCode: cityIbgeCode,
    },
    serviceMode: 'CITY_ONLY',
    serviceRadiusKm: null,
    selectedCities: [],
    selectedCityIbgeCodes: [],
    availability: 'AVAILABLE',
    contactVisibility: 'PRIVATE',
    profileImage: null,
    portfolioImages: [],
    status: 'PUBLISHED',
  }
}

function operationalProfile(
  professionalId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    professionalId,
    reviewStatus: 'APPROVED',
    active: true,
    profileVersion: 1,
    submittedVersion: 1,
    approvedVersion: 1,
    revision: 1,
    lastEventId: 'review-1',
    professionalFeedback: null,
    approvedCategoryIds: [categoryId],
    approvedSpecialtyIds: [specialtyId],
    approvedBaseCityIbgeCode: cityIbgeCode,
    approvedSelectedCityIbgeCodes: [],
    eligibleCityIbgeCodes: [cityIbgeCode],
    updatedAt: new Date(),
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
    operationKey: requestId,
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
        name: userId === clientId ? 'Cliente Exemplo' : `Profissional ${userId}`,
        email: `${userId}@example.com`,
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
    await setDoc(doc(firestore, 'categories', categoryId), {
      name: 'Manutenção',
      active: true,
      order: 1,
    })
    await setDoc(doc(firestore, 'specialties', specialtyId), {
      categoryId,
      name: 'Eletricista',
      active: true,
      order: 1,
    })
    await setDoc(doc(firestore, 'clientProfiles', clientId), {
      ownerId: clientId,
      phone: '',
      profileImage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
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
        operationKey: requestId,
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
  function creationInput(operationKey = 'request-operation-key-000001') {
    return {
      operationKey,
      specialtyId,
      description: 'Preciso revisar duas tomadas que deixaram de funcionar.',
      city: 'Campinas',
      stateCode: 'SP',
      cityIbgeCode,
      street: 'Rua das Flores',
      number: '100',
      complement: '',
      neighborhood: 'Centro',
      postalCode: '13000000',
      serviceDate,
      period: 'MORNING' as const,
      contactName: 'Cliente Exemplo',
      contactPhone: '',
    }
  }

  it('cria resumo, dados privados, rodada e histórico atomicamente e recupera o pedido', async () => {
    await seedScenario([])
    const clientFirestore = testEnvironment.authenticatedContext(clientId).firestore()
    const service = serviceFor(clientFirestore, clientId)

    const result = await service.createRequest(creationInput())

    expect(result.idempotent).toBe(false)
    expect(result.request).toMatchObject({ status: 'OPEN', round: 1, clientId })
    await expect(service.getOwnRequest(result.request.requestId)).resolves.toMatchObject({
      requestId: result.request.requestId,
      status: 'OPEN',
    })
    let persisted: Record<string, Record<string, unknown> | undefined> = {}
    await inspect(async (firestore) => {
      persisted = {
        summary: (await getDoc(doc(firestore, 'serviceRequests', result.request.requestId))).data(),
        privateData: (await getDoc(doc(firestore, 'serviceRequestPrivate', result.request.requestId))).data(),
        round: (await getDoc(doc(firestore, 'serviceRequests', result.request.requestId, 'rounds', 'round-1'))).data(),
        event: (await getDoc(doc(firestore, 'serviceRequests', result.request.requestId, 'events', 'created'))).data(),
      }
    })
    expect(persisted.summary).not.toHaveProperty('address')
    expect(persisted.summary).not.toHaveProperty('contactPhone')
    expect(persisted.privateData?.address).toMatchObject({ street: 'Rua das Flores' })
    expect(persisted.round).toMatchObject({ status: 'OPEN', reason: 'INITIAL' })
    expect(persisted.event).toMatchObject({ type: 'REQUEST_CREATED', actorRole: 'CLIENT' })
    const opportunities = await serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    ).listOpenOpportunities({
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING',
    })
    expect(opportunities.items.map((request) => request.requestId)).toEqual([
      result.request.requestId,
    ])
  })

  it('torna clique duplo e retry idempotentes sem duplicar documentos', async () => {
    await seedScenario([])
    const service = serviceFor(
      testEnvironment.authenticatedContext(clientId).firestore(),
      clientId,
    )
    const input = creationInput('request-operation-key-000002')

    const results = await Promise.all([service.createRequest(input), service.createRequest(input)])
    expect(results.map((result) => result.idempotent)).toEqual([false, false])
    await expect(service.createRequest(input)).resolves.toMatchObject({ idempotent: true })
    let counts = { requests: 0, events: 0 }
    await inspect(async (firestore) => {
      counts = {
        requests: (await getDocs(collection(firestore, 'serviceRequests'))).size,
        events: (await getDocs(collection(firestore, 'serviceRequests', input.operationKey, 'events'))).size,
      }
    })
    expect(counts).toEqual({ requests: 1, events: 1 })
  })

  it('rejeita catálogo inativo, criação parcial e acesso cruzado aos dados privados', async () => {
    await seedScenario([])
    const clientFirestore = testEnvironment.authenticatedContext(clientId).firestore()
    const service = serviceFor(clientFirestore, clientId)
    await inspect((firestore) => updateDoc(doc(firestore, 'specialties', specialtyId), { active: false }))
    await expect(service.createRequest(creationInput('request-operation-key-000003'))).rejects.toMatchObject({ code: 'permission-denied' })

    await inspect((firestore) => updateDoc(doc(firestore, 'specialties', specialtyId), { active: true }))
    const batch = writeBatch(clientFirestore)
    batch.set(doc(clientFirestore, 'serviceRequests', 'request-operation-key-000004'), {
      ...requestSummary('request-operation-key-000004'),
      operationKey: 'request-operation-key-000004',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await assertFails(batch.commit())

    const created = await service.createRequest(creationInput('request-operation-key-000005'))
    const privateReference = doc(clientFirestore, 'serviceRequestPrivate', created.request.requestId)
    await assertSucceeds(getDoc(privateReference))
    await assertFails(
      getDoc(doc(testEnvironment.authenticatedContext(professionalA).firestore(), 'serviceRequestPrivate', created.request.requestId)),
    )
    await assertFails(
      getDoc(doc(testEnvironment.authenticatedContext('other-client').firestore(), 'serviceRequestPrivate', created.request.requestId)),
    )
  })

  it('exige somente a prontidão persistida do cliente, sem telefone ou avatar', async () => {
    await seedScenario([])
    const clientFirestore = testEnvironment.authenticatedContext(clientId).firestore()
    const service = serviceFor(clientFirestore, clientId)

    await expect(
      service.createRequest(creationInput('request-operation-key-000006')),
    ).resolves.toMatchObject({ request: { status: 'OPEN' } })

    await testEnvironment.clearFirestore()
    await seedScenario([])
    await inspect((firestore) =>
      deleteDoc(doc(firestore, 'clientProfiles', clientId)),
    )
    await expect(
      serviceFor(
        testEnvironment.authenticatedContext(clientId).firestore(),
        clientId,
      ).createRequest(creationInput('request-operation-key-000007')),
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('permite somente ao dono cancelar o pedido OPEN com rodada e histórico atômicos', async () => {
    await seedScenario([])
    const clientFirestore = testEnvironment.authenticatedContext(clientId).firestore()
    const service = serviceFor(clientFirestore, clientId)
    const created = await service.createRequest(
      creationInput('request-operation-key-000008'),
    )

    await expect(
      serviceFor(
        testEnvironment.authenticatedContext('other-client').firestore(),
        'other-client',
      ).cancelOwnRequest(created.request.requestId),
    ).rejects.toMatchObject({ code: 'permission-denied' })

    const cancelled = await service.cancelOwnRequest(created.request.requestId)
    expect(cancelled).toMatchObject({
      idempotent: false,
      request: { status: 'CANCELLED', clientId },
    })
    await expect(
      service.cancelOwnRequest(created.request.requestId),
    ).resolves.toMatchObject({ idempotent: true, request: { status: 'CANCELLED' } })

    let persisted: Record<string, Record<string, unknown> | undefined> = {}
    await inspect(async (firestore) => {
      persisted = {
        round: (await getDoc(doc(firestore, 'serviceRequests', created.request.requestId, 'rounds', 'round-1'))).data(),
        event: (await getDoc(doc(firestore, 'serviceRequests', created.request.requestId, 'events', 'cancelled-by-client'))).data(),
      }
    })
    expect(persisted.round).toMatchObject({ status: 'CLOSED', closedReason: 'CLIENT_CANCELLATION' })
    expect(persisted.event).toMatchObject({ type: 'REQUEST_CANCELLED', actorRole: 'CLIENT' })
    await expect(
      service.listRequestHistory({ requestId: created.request.requestId }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'REQUEST_CREATED', actorRole: 'CLIENT' }),
        expect.objectContaining({ type: 'REQUEST_CANCELLED', actorRole: 'CLIENT' }),
      ]),
    )
    await expect(
      serviceFor(
        testEnvironment.authenticatedContext(professionalA).firestore(),
        professionalA,
      ).listOpenOpportunities({
        categoryId,
        specialtyId,
        cityIbgeCode,
        serviceDate,
        period: 'MORNING',
      }),
    ).resolves.toMatchObject({ items: [] })
  })

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

    expect(opportunities.items).toHaveLength(1)
    expect(opportunities.items[0]).not.toHaveProperty('address')
    expect(opportunities.items[0]).not.toHaveProperty('contactPhone')
    expect(opportunities.items[0]).not.toHaveProperty('clientId')
    await assertFails(
      getDocs(collection(unapprovedFirestore, 'serviceRequests')),
    )
  })

  it('pagina a query real de oportunidades com cursor estável e limite obrigatório', async () => {
    await seedScenario(['request-1', 'request-2'])
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(professionalFirestore, professionalA)
    const firstPage = await professional.listOpenOpportunities({
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING',
      pageSize: 1,
    })

    expect(firstPage.items.map((item) => item.requestId)).toEqual(['request-1'])
    expect(firstPage.nextCursor).toMatchObject({ version: 1, requestId: 'request-1' })

    const secondPage = await professional.listOpenOpportunities({
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING',
      pageSize: 1,
      cursor: firstPage.nextCursor,
    })
    expect(secondPage.items.map((item) => item.requestId)).toEqual(['request-2'])

    await assertFails(
      getDocs(
        query(
          collection(professionalFirestore, 'serviceRequests'),
          where('status', '==', 'OPEN'),
          where('categoryId', '==', categoryId),
          where('specialtyId', '==', specialtyId),
          where('cityIbgeCode', '==', cityIbgeCode),
          where('serviceDate', '==', serviceDate),
          where('period', '==', 'MORNING'),
          where('acceptUntil', '>', new Date()),
          orderBy('acceptUntil', 'asc'),
          orderBy(documentId(), 'asc'),
        ),
      ),
    )
    await assertFails(
      getDocs(
        query(
          collection(professionalFirestore, 'serviceRequests'),
          limit(50),
        ),
      ),
    )
  })

  it('sincroniza o feed de A/B/C e remove a oportunidade após o primeiro aceite confirmado', async () => {
    await seedScenario()
    const professionals = [professionalA, professionalB, professionalC].map(
      (professionalId) =>
        serviceFor(
          testEnvironment.authenticatedContext(professionalId).firestore(),
          professionalId,
        ),
    )
    const feeds = professionals.map((service) => feedFor(service))

    try {
      const initialPages = await Promise.all(
        feeds.map((feed) =>
          feed.waitForPage((snapshot) =>
            snapshot.page.items.some((item) => item.requestId === 'request-1'),
          ),
        ),
      )
      expect(
        initialPages.every((snapshot) => snapshot.page.items.length === 1),
      ).toBe(true)
      expect(feeds.every((feed) => feed.isEligible())).toBe(true)

      await professionals[1].acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      })
      await Promise.all(
        feeds.map((feed) =>
          feed.waitForPage(
            (snapshot) =>
              !snapshot.page.items.some(
                (item) => item.requestId === 'request-1',
              ),
          ),
        ),
      )
      await expect(
        professionals[0].acceptOpportunity({
          requestId: 'request-1',
          expectedRound: 1,
        }),
      ).rejects.toMatchObject({ code: 'opportunity-taken' })
    } finally {
      feeds.forEach((feed) => feed.unsubscribe())
    }
  })

  it('mantém a recusa isolada ao profissional e à rodada no feed', async () => {
    await seedScenario()
    const firstService = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const secondService = serviceFor(
      testEnvironment.authenticatedContext(professionalB).firestore(),
      professionalB,
    )
    await firstService.declineOpportunity({
      requestId: 'request-1',
      expectedRound: 1,
    })

    const firstFeed = feedFor(firstService)
    const secondFeed = feedFor(secondService)
    try {
      const [firstPage, secondPage] = await Promise.all([
        firstFeed.waitForPage((snapshot) => snapshot.page.items.length === 0),
        secondFeed.waitForPage((snapshot) =>
          snapshot.page.items.some((item) => item.requestId === 'request-1'),
        ),
      ])
      expect(firstPage.page.items).toEqual([])
      expect(secondPage.page.items.map((item) => item.requestId)).toEqual([
        'request-1',
      ])
    } finally {
      firstFeed.unsubscribe()
      secondFeed.unsubscribe()
    }
  })

  it('limpa o feed em tempo real quando o profissional perde elegibilidade', async () => {
    await seedScenario()
    const service = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const feed = feedFor(service)
    try {
      await feed.waitForPage((snapshot) =>
        snapshot.page.items.some((item) => item.requestId === 'request-1'),
      )
      await inspect((firestore) =>
        updateDoc(
          doc(
            firestore,
            'professionalOperationalProfiles',
            professionalA,
          ),
          { reviewStatus: 'SUSPENDED', active: false },
        ),
      )
      await feed.waitForPage((snapshot) => snapshot.page.items.length === 0)
      expect(feed.isEligible()).toBe(false)
    } finally {
      feed.unsubscribe()
    }
  })

  it('pagina listeners reais com cursor versionado e sem duplicar oportunidades', async () => {
    const requestIds = Array.from(
      { length: 13 },
      (_, index) => `request-${String(index + 1).padStart(2, '0')}`,
    )
    await seedScenario(requestIds)
    const service = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    const firstFeed = feedFor(service, 5)
    let secondFeed: ReturnType<typeof feedFor> | null = null
    try {
      const firstPage = await firstFeed.waitForPage(
        (snapshot) => snapshot.page.items.length === 5,
      )
      expect(firstPage.page.nextCursor).not.toBeNull()
      secondFeed = feedFor(service, 5, firstPage.page.nextCursor)
      const secondPage = await secondFeed.waitForPage(
        (snapshot) => snapshot.page.items.length === 5,
      )
      const ids = [
        ...firstPage.page.items.map((item) => item.requestId),
        ...secondPage.page.items.map((item) => item.requestId),
      ]
      expect(new Set(ids).size).toBe(ids.length)
    } finally {
      firstFeed.unsubscribe()
      secondFeed?.unsubscribe()
    }
  })

  it('remove do retorno slots indisponíveis, reservados, recusados e pedidos vencidos', async () => {
    await seedScenario(['request-1', 'request-2'])
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(professionalFirestore, professionalA)
    const queryInput = {
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING' as const,
    }

    await updateDoc(
      doc(
        professionalFirestore,
        'professionalAvailability',
        professionalA,
        'slots',
        slotId,
      ),
      { available: false, updatedAt: serverTimestamp() },
    )
    await expect(professional.listOpenOpportunities(queryInput)).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    })

    await updateDoc(
      doc(
        professionalFirestore,
        'professionalAvailability',
        professionalA,
        'slots',
        slotId,
      ),
      { available: true, updatedAt: serverTimestamp() },
    )
    await professional.refuseRequest({ requestId: 'request-1', expectedRound: 1 })
    const afterRefusal = await professional.listOpenOpportunities(queryInput)
    expect(afterRefusal.items.map((item) => item.requestId)).toEqual(['request-2'])

    await inspect((firestore) =>
      setDoc(
        doc(
          firestore,
          'professionalReservations',
          professionalA,
          'slots',
          slotId,
        ),
        {
          reservationId: slotId,
          professionalId: professionalA,
          requestId: 'request-2',
          assignmentId: 'round-1',
          serviceDate,
          period: 'MORNING',
          round: 1,
          createdAt: new Date(),
        },
      ),
    )
    await expect(professional.listOpenOpportunities(queryInput)).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    })

    await inspect((firestore) =>
      deleteDoc(
        doc(
          firestore,
          'professionalReservations',
          professionalA,
          'slots',
          slotId,
        ),
      ),
    )

    const afterDeadline = serviceFor(
      professionalFirestore,
      professionalA,
      undefined,
      () => new Date(periodWindow.acceptUntil.getTime() + 1),
    )
    await expect(afterDeadline.listOpenOpportunities(queryInput)).resolves.toMatchObject({
      items: [],
    })
  })

  it('inclui pedido já aberto após ativação posterior, sem redistribuição por escrita', async () => {
    await seedScenario()
    await inspect((firestore) =>
      updateDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalC),
        { active: false },
      ),
    )
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalC).firestore(),
      professionalC,
    )
    const queryInput = {
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING' as const,
    }

    await expect(professional.listOpenOpportunities(queryInput)).rejects.toMatchObject({
      code: 'not-eligible',
    })
    await inspect((firestore) =>
      updateDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalC),
        { active: true },
      ),
    )
    await expect(professional.listOpenOpportunities(queryInput)).resolves.toMatchObject({
      items: [expect.objectContaining({ requestId: 'request-1' })],
    })
  })

  it('bloqueia o feed após restrição e preserva o compromisso já atribuído', async () => {
    await seedScenario()
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(professionalFirestore, professionalA)
    await professional.acceptRequest({ requestId: 'request-1', expectedRound: 1 })
    await inspect((firestore) =>
      updateDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalA),
        { reviewStatus: 'SUSPENDED', active: false },
      ),
    )

    await expect(
      professional.listOpenOpportunities({
        categoryId,
        specialtyId,
        cityIbgeCode,
        serviceDate,
        period: 'MORNING',
      }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
    await assertSucceeds(
      getDoc(doc(professionalFirestore, 'serviceRequests', 'request-1')),
    )
    await assertSucceeds(
      getDoc(doc(professionalFirestore, 'serviceRequestPrivate', 'request-1')),
    )
  })

  it('nega query e leitura direta de oportunidades fora do matching', async () => {
    await seedScenario()
    await inspect(async (firestore) => {
      await updateDoc(doc(firestore, 'professionalProfiles', professionalC), {
        categoryIds: ['cleaning'],
        specialtyIds: ['house-cleaning'],
      })
      await updateDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalC),
        {
          approvedCategoryIds: ['cleaning'],
          approvedSpecialtyIds: ['house-cleaning'],
        },
      )
    })
    const mismatchedFirestore = testEnvironment
      .authenticatedContext(professionalC)
      .firestore()
    const mismatched = serviceFor(mismatchedFirestore, professionalC)

    await expect(
      mismatched.listOpenOpportunities({
        categoryId,
        specialtyId,
        cityIbgeCode,
        serviceDate,
        period: 'MORNING',
      }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
    await assertFails(
      getDoc(doc(mismatchedFirestore, 'serviceRequests', 'request-1')),
    )
  })

  it.each([
    ['em análise', { reviewStatus: 'UNDER_REVIEW' }],
    ['rejeitado', { reviewStatus: 'REJECTED' }],
    ['suspenso', { reviewStatus: 'SUSPENDED', active: false }],
    ['inativo', { active: false }],
    ['com versão divergente', { profileVersion: 2, approvedVersion: 1 }],
  ])('nega a query operacional para profissional %s', async (_label, changes) => {
    await seedScenario()
    await inspect((firestore) =>
      updateDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalA),
        changes,
      ),
    )
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )

    await expect(
      professional.listOpenOpportunities({
        categoryId,
        specialtyId,
        cityIbgeCode,
        serviceDate,
        period: 'MORNING',
      }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
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
      first.acceptOpportunity({ requestId: 'request-1', expectedRound: 1 }),
      second.acceptOpportunity({ requestId: 'request-1', expectedRound: 1 }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'opportunity-taken' },
    })
    await inspect(async (firestore) => {
      const request = await getDoc(doc(firestore, 'serviceRequests', 'request-1'))
      const assignments = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'assignments'),
      )
      const events = await getDocs(
        collection(firestore, 'serviceRequests', 'request-1', 'events'),
      )
      const reservations = await Promise.all(
        [professionalA, professionalB].map((professionalId) =>
          getDoc(
            doc(
              firestore,
              'professionalReservations',
              professionalId,
              'slots',
              slotId,
            ),
          ),
        ),
      )
      expect(request.data()?.status).toBe('ASSIGNED')
      expect([professionalA, professionalB]).toContain(
        request.data()?.assignedProfessionalId,
      )
      expect(assignments.size).toBe(1)
      expect(events.size).toBe(1)
      expect(reservations.filter((snapshot) => snapshot.exists())).toHaveLength(1)
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
      first.acceptOpportunity({ requestId: 'request-1', expectedRound: 1 }),
      second.acceptOpportunity({ requestId: 'request-2', expectedRound: 1 }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'slot-conflict' },
    })
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
      const assignments = await Promise.all(
        ['request-1', 'request-2'].map((requestId) =>
          getDocs(
            collection(
              firestore,
              'serviceRequests',
              requestId,
              'assignments',
            ),
          ),
        ),
      )
      const events = await Promise.all(
        ['request-1', 'request-2'].map((requestId) =>
          getDocs(
            collection(
              firestore,
              'serviceRequests',
              requestId,
              'events',
            ),
          ),
        ),
      )
      expect(reservations.size).toBe(1)
      expect(
        requests.filter((snapshot) => snapshot.data()?.status === 'ASSIGNED'),
      ).toHaveLength(1)
      expect(assignments.reduce((total, snapshot) => total + snapshot.size, 0)).toBe(1)
      expect(events.reduce((total, snapshot) => total + snapshot.size, 0)).toBe(1)
    })
  })

  it('serializa aceite e cancelamento OPEN do cliente com exatamente um commit válido', async () => {
    await seedScenario()
    const barrier = coordinatedBarrier(2)
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      barrier,
    )
    const client = serviceFor(
      testEnvironment.authenticatedContext(clientId).firestore(),
      clientId,
      barrier,
    )

    const results = await Promise.allSettled([
      professional.acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      }),
      client.cancelOwnRequest('request-1'),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { code: 'not-open' },
    })
    await inspect(async (firestore) => {
      const [request, round, assignments, events, reservation] =
        await Promise.all([
          getDoc(doc(firestore, 'serviceRequests', 'request-1')),
          getDoc(
            doc(
              firestore,
              'serviceRequests',
              'request-1',
              'rounds',
              'round-1',
            ),
          ),
          getDocs(
            collection(
              firestore,
              'serviceRequests',
              'request-1',
              'assignments',
            ),
          ),
          getDocs(
            collection(
              firestore,
              'serviceRequests',
              'request-1',
              'events',
            ),
          ),
          getDoc(
            doc(
              firestore,
              'professionalReservations',
              professionalA,
              'slots',
              slotId,
            ),
          ),
        ])

      expect(round.data()).toMatchObject({ status: 'CLOSED' })
      expect(events.size).toBe(1)
      if (request.data()?.status === 'ASSIGNED') {
        expect(request.data()?.assignedProfessionalId).toBe(professionalA)
        expect(round.data()?.closedReason).toBe('ASSIGNED')
        expect(assignments.size).toBe(1)
        expect(reservation.exists()).toBe(true)
        expect(events.docs[0].data().type).toBe('REQUEST_ASSIGNED')
      } else {
        expect(request.data()?.status).toBe('CANCELLED')
        expect(round.data()?.closedReason).toBe('CLIENT_CANCELLATION')
        expect(assignments.size).toBe(0)
        expect(reservation.exists()).toBe(false)
        expect(events.docs[0].data().type).toBe('REQUEST_CANCELLED')
      }
    })
  })

  it('só confirma sucesso depois que a transação conclui o commit', async () => {
    await seedScenario()
    let reportRead: (() => void) | undefined
    let releaseCommit: (() => void) | undefined
    const readCompleted = new Promise<void>((resolve) => {
      reportRead = resolve
    })
    const commitRelease = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    const coordinator: TransactionCoordinator = {
      async afterRead(operation) {
        if (operation !== 'accept') return
        reportRead?.()
        await commitRelease
      },
    }
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      coordinator,
    )
    let settled = false
    const acceptance = professional.acceptOpportunity({
      requestId: 'request-1',
      expectedRound: 1,
    })
    void acceptance.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )

    await readCompleted
    await Promise.resolve()
    expect(settled).toBe(false)
    releaseCommit?.()
    await expect(acceptance).resolves.toMatchObject({
      requestId: 'request-1',
      idempotent: false,
    })
    await inspect(async (firestore) => {
      expect(
        (await getDoc(doc(firestore, 'serviceRequests', 'request-1'))).data(),
      ).toMatchObject({
        status: 'ASSIGNED',
        assignedProfessionalId: professionalA,
      })
    })
  })

  it('falha offline sem enfileirar aceite nem anunciar confirmação', async () => {
    await seedScenario()
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = createServiceRequestService({
      firestore: professionalFirestore,
      getActorId: () => professionalA,
      isOnline: () => false,
    })

    await expect(
      professional.acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      }),
    ).rejects.toMatchObject({ code: 'offline' })

    await inspect(async (firestore) => {
      const [request, assignments, events, reservation] = await Promise.all([
        getDoc(doc(firestore, 'serviceRequests', 'request-1')),
        getDocs(
          collection(
            firestore,
            'serviceRequests',
            'request-1',
            'assignments',
          ),
        ),
        getDocs(
          collection(
            firestore,
            'serviceRequests',
            'request-1',
            'events',
          ),
        ),
        getDoc(
          doc(
            firestore,
            'professionalReservations',
            professionalA,
            'slots',
            slotId,
          ),
        ),
      ])
      expect(request.data()?.status).toBe('OPEN')
      expect(assignments.size).toBe(0)
      expect(events.size).toBe(0)
      expect(reservation.exists()).toBe(false)
    })
  })

  it('isola disponibilidade por UID e impede remover um slot reservado', async () => {
    await seedScenario()
    const firstFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const secondFirestore = testEnvironment
      .authenticatedContext(professionalB)
      .firestore()
    const availabilityPath = [
      'professionalAvailability',
      professionalA,
      'slots',
      slotId,
    ] as const

    await assertFails(
      updateDoc(doc(secondFirestore, ...availabilityPath), {
        available: false,
        updatedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(
      updateDoc(doc(firstFirestore, ...availabilityPath), {
        available: true,
        updatedAt: serverTimestamp(),
      }),
    )
    const professional = serviceFor(firstFirestore, professionalA)
    await professional.acceptRequest({ requestId: 'request-1', expectedRound: 1 })
    await assertFails(deleteDoc(doc(firstFirestore, ...availabilityPath)))
  })

  it('edita períodos sem remover reserva nem alterar a aprovação profissional', async () => {
    await seedScenario()
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(professionalFirestore, professionalA)
    await professional.acceptRequest({ requestId: 'request-1', expectedRound: 1 })

    const availability = createProfessionalAvailabilityService({
      getActorId: () => professionalA,
      repository: createProfessionalAvailabilityRepository(professionalFirestore),
    })
    const before = await getDoc(
      doc(
        professionalFirestore,
        'professionalOperationalProfiles',
        professionalA,
      ),
    )
    const loaded = await availability.loadDay(serviceDate)
    expect(
      loaded.periods.find((period) => period.period === 'MORNING'),
    ).toMatchObject({ available: true, reserved: true })

    await availability.saveDay(serviceDate, {
      MORNING: false,
      AFTERNOON: true,
      EVENING: false,
    })

    const [reservation, operational, morningSlot] = await Promise.all([
      getDoc(
        doc(
          professionalFirestore,
          'professionalReservations',
          professionalA,
          'slots',
          slotId,
        ),
      ),
      getDoc(
        doc(
          professionalFirestore,
          'professionalOperationalProfiles',
          professionalA,
        ),
      ),
      getDoc(
        doc(
          professionalFirestore,
          'professionalAvailability',
          professionalA,
          'slots',
          slotId,
        ),
      ),
    ])
    expect(reservation.exists()).toBe(true)
    expect(morningSlot.data()?.available).toBe(false)
    expect(operational.data()).toEqual(before.data())
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

    const refusal = await first.declineOpportunity({
      requestId: 'request-1',
      expectedRound: 1,
    })
    const refusalRetry = await first.declineOpportunity({
      requestId: 'request-1',
      expectedRound: 1,
    })
    expect(refusal.idempotent).toBe(false)
    expect(refusalRetry.idempotent).toBe(true)
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
    const queryInput = {
      categoryId,
      specialtyId,
      cityIbgeCode,
      serviceDate,
      period: 'MORNING' as const,
    }
    await expect(second.listOpenOpportunities(queryInput)).resolves.toMatchObject({
      items: [],
    })
    await expect(first.listOpenOpportunities(queryInput)).resolves.toMatchObject({
      items: [expect.objectContaining({ requestId: 'request-1', round: 2 })],
    })
    await expect(
      second.acceptRequest({ requestId: 'request-1', expectedRound: 2 }),
    ).rejects.toMatchObject({ code: 'excluded-from-round' })
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
      'professional-restricted',
    ],
    [
      'perfil rejeitado',
      { expectedRound: 1 },
      { operational: { reviewStatus: 'REJECTED' } },
      'professional-restricted',
    ],
    [
      'perfil suspenso',
      { expectedRound: 1 },
      { operational: { reviewStatus: 'SUSPENDED', active: false } },
      'professional-restricted',
    ],
    [
      'perfil inativo',
      { expectedRound: 1 },
      { operational: { active: false } },
      'professional-restricted',
    ],
    [
      'versão desatualizada',
      { expectedRound: 1 },
      { operational: { profileVersion: 2, approvedVersion: 1 } },
      'professional-restricted',
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

  it('nega aceite sem perfil próprio e para serviço incompatível', async () => {
    await seedScenario()
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    await inspect((firestore) =>
      deleteDoc(doc(firestore, 'professionalProfiles', professionalA)),
    )
    await expect(
      professional.acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      }),
    ).rejects.toMatchObject({ code: 'professional-restricted' })

    await testEnvironment.clearFirestore()
    await seedScenario()
    await inspect(async (firestore) => {
      await updateDoc(doc(firestore, 'professionalProfiles', professionalA), {
        categoryIds: ['cleaning'],
        specialtyIds: ['house-cleaning'],
      })
      await updateDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalA),
        {
          approvedCategoryIds: ['cleaning'],
          approvedSpecialtyIds: ['house-cleaning'],
        },
      )
    })
    await expect(
      serviceFor(
        testEnvironment.authenticatedContext(professionalA).firestore(),
        professionalA,
      ).acceptOpportunity({ requestId: 'request-1', expectedRound: 1 }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
  })

  it('impede conta com ambos os papéis de aceitar o próprio pedido', async () => {
    await seedScenario()
    await inspect(async (firestore) => {
      await updateDoc(doc(firestore, 'users', professionalA), {
        roles: ['client', 'professional'],
      })
      await updateDoc(doc(firestore, 'serviceRequests', 'request-1'), {
        clientId: professionalA,
      })
    })
    const dualRole = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )

    await expect(
      dualRole.acceptOpportunity({ requestId: 'request-1', expectedRound: 1 }),
    ).rejects.toMatchObject({ code: 'not-eligible' })
    await inspect(async (firestore) => {
      expect(
        (
          await getDocs(
            collection(
              firestore,
              'serviceRequests',
              'request-1',
              'assignments',
            ),
          )
        ).size,
      ).toBe(0)
    })
  })

  it('distingue indisponibilidade, exclusão da rodada e reserva ocupada', async () => {
    await seedScenario()
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
    )
    await inspect((firestore) =>
      updateDoc(
        doc(
          firestore,
          'professionalAvailability',
          professionalA,
          'slots',
          slotId,
        ),
        { available: false },
      ),
    )
    await expect(
      professional.acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      }),
    ).rejects.toMatchObject({ code: 'not-eligible' })

    await inspect(async (firestore) => {
      await updateDoc(
        doc(
          firestore,
          'professionalAvailability',
          professionalA,
          'slots',
          slotId,
        ),
        { available: true },
      )
      await updateDoc(doc(firestore, 'serviceRequests', 'request-1'), {
        excludedProfessionalIds: [professionalA],
      })
    })
    await expect(
      professional.acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      }),
    ).rejects.toMatchObject({ code: 'excluded-from-round' })

    await inspect(async (firestore) => {
      await updateDoc(doc(firestore, 'serviceRequests', 'request-1'), {
        excludedProfessionalIds: [],
      })
      await setDoc(
        doc(
          firestore,
          'professionalReservations',
          professionalA,
          'slots',
          slotId,
        ),
        {
          reservationId: slotId,
          professionalId: professionalA,
          requestId: 'another-request',
          assignmentId: 'round-1',
          serviceDate,
          period: 'MORNING',
          round: 1,
          createdAt: new Date(),
        },
      )
    })
    await expect(
      professional.acceptOpportunity({
        requestId: 'request-1',
        expectedRound: 1,
      }),
    ).rejects.toMatchObject({ code: 'slot-conflict' })
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
    const forgedAcceptance = writeBatch(first)
    forgedAcceptance.set(
      doc(requestReference, 'assignments', 'round-1'),
      {
        assignmentId: 'round-1',
        requestId: 'request-1',
        clientId,
        professionalId: professionalA,
        round: 1,
        status: 'ACTIVE',
        serviceDate,
        period: 'MORNING',
        reservationId: slotId,
        acceptedEventId: assignmentEventId(1),
        acceptedAt: serverTimestamp(),
        endedAt: null,
        endReason: null,
      },
    )
    forgedAcceptance.set(
      doc(
        first,
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
    )
    forgedAcceptance.set(
      doc(requestReference, 'events', assignmentEventId(1)),
      {
        eventId: assignmentEventId(1),
        entityType: 'SERVICE_REQUEST',
        entityId: 'request-1',
        requestId: 'request-1',
        type: 'REQUEST_ASSIGNED',
        reasonCode: 'PROFESSIONAL_ACCEPTANCE',
        actorId: professionalA,
        actorRole: 'PROFESSIONAL',
        round: 1,
        assignmentId: 'round-1',
        fromStatus: 'OPEN',
        toStatus: 'ASSIGNED',
        createdAt: serverTimestamp(),
      },
    )
    await assertFails(forgedAcceptance.commit())
    await assertFails(
      getDoc(doc(first, 'serviceRequestPrivate', 'request-1')),
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

  it('mantém eventos operacionais imutáveis e rejeita ator ou papel forjado', async () => {
    await seedScenario()
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(professionalFirestore, professionalA)
    await professional.acceptRequest({ requestId: 'request-1', expectedRound: 1 })
    const eventReference = doc(
      professionalFirestore,
      'serviceRequests',
      'request-1',
      'events',
      assignmentEventId(1),
    )

    await assertFails(
      updateDoc(eventReference, {
        actorId: professionalB,
        actorRole: 'ADMIN',
      }),
    )
    await assertFails(deleteDoc(eventReference))
    await assertFails(
      setDoc(
        doc(
          professionalFirestore,
          'serviceRequests',
          'request-1',
          'events',
          'forged-event',
        ),
        {
          eventId: 'forged-event',
          entityType: 'SERVICE_REQUEST',
          entityId: 'request-1',
          requestId: 'request-1',
          type: 'REQUEST_ASSIGNED',
          reasonCode: 'PROFESSIONAL_ACCEPTANCE',
          actorId: professionalB,
          actorRole: 'ADMIN',
          round: 1,
          assignmentId: 'round-1',
          fromStatus: 'OPEN',
          toStatus: 'ASSIGNED',
          createdAt: serverTimestamp(),
        },
      ),
    )
  })

  it('consulta cronologia limitada por relacionamento sem expor eventos de terceiros', async () => {
    await seedScenario()
    const firstFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const secondFirestore = testEnvironment
      .authenticatedContext(professionalB)
      .firestore()
    const clientFirestore = testEnvironment.authenticatedContext(clientId).firestore()
    const adminFirestore = testEnvironment.authenticatedContext(adminId).firestore()
    const unrelatedFirestore = testEnvironment
      .authenticatedContext(professionalC)
      .firestore()
    const first = serviceFor(firstFirestore, professionalA)
    const second = serviceFor(secondFirestore, professionalB)

    await first.refuseRequest({ requestId: 'request-1', expectedRound: 1 })
    const accepted = await second.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    await second.cancelAssignment({
      requestId: 'request-1',
      expectedAssignmentId: accepted.assignmentId,
    })
    await first.acceptRequest({ requestId: 'request-1', expectedRound: 2 })

    const [clientHistory, adminHistory, firstHistory, secondHistory] =
      await Promise.all([
        serviceFor(clientFirestore, clientId).listRequestHistory({
          requestId: 'request-1',
        }),
        serviceFor(adminFirestore, adminId).listRequestHistory({
          requestId: 'request-1',
        }),
        first.listRequestHistory({
          requestId: 'request-1',
          ownEventsOnly: true,
        }),
        second.listRequestHistory({
          requestId: 'request-1',
          ownEventsOnly: true,
        }),
      ])

    expect(clientHistory).toHaveLength(4)
    expect(adminHistory).toHaveLength(4)
    expect(firstHistory).toHaveLength(2)
    expect(secondHistory).toHaveLength(2)
    expect(firstHistory.every((event) => event.actorId === professionalA)).toBe(true)
    expect(secondHistory.every((event) => event.actorId === professionalB)).toBe(true)
    expect(adminHistory.every((event) => (
      event.entityType === 'SERVICE_REQUEST' &&
      event.entityId === 'request-1' &&
      event.requestId === 'request-1' &&
      event.createdAt instanceof Date
    ))).toBe(true)
    expect(adminHistory.map((event) => event.reasonCode)).toEqual(
      expect.arrayContaining([
        'PROFESSIONAL_ACCEPTANCE',
        'PROFESSIONAL_REFUSAL',
        'PROFESSIONAL_CANCELLATION',
      ]),
    )

    await expect(
      first.listRequestHistory({ requestId: 'request-1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(
      serviceFor(unrelatedFirestore, professionalC).listRequestHistory({
        requestId: 'request-1',
        ownEventsOnly: true,
      }),
    ).resolves.toEqual([])
    await assertFails(
      getDocs(
        query(
          collection(
            unrelatedFirestore,
            'serviceRequests',
            'request-1',
            'events',
          ),
          where('actorId', '==', professionalA),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
      ),
    )
    await assertFails(
      getDocs(
        query(
          collection(
            adminFirestore,
            'serviceRequests',
            'request-1',
            'events',
          ),
          orderBy('createdAt', 'desc'),
          limit(51),
        ),
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

    await expect(
      first.acceptOpportunity({ requestId: 'request-1', expectedRound: 1 }),
    ).rejects.toMatchObject({ code: 'round-changed' })
    await expect(
      first.declineOpportunity({ requestId: 'request-1', expectedRound: 1 }),
    ).rejects.toMatchObject({ code: 'round-changed' })

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

  it('preserva um atendimento confirmado antes da desativação e bloqueia novos aceites', async () => {
    await seedScenario(['request-1', 'request-2'])
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(professionalFirestore, professionalA)
    const admin = createProfessionalReviewService({
      firestore: testEnvironment.authenticatedContext(adminId).firestore(),
      getActorId: () => adminId,
    })

    const accepted = await professional.acceptRequest({
      requestId: 'request-1',
      expectedRound: 1,
    })
    await admin.setActive({
      professionalId: professionalA,
      expectedVersion: 1,
      expectedRevision: 1,
      active: false,
      reason: 'Desativação administrativa demonstrativa.',
    })

    await expect(
      professional.acceptRequest({ requestId: 'request-2', expectedRound: 1 }),
    ).rejects.toMatchObject({ code: 'professional-restricted' })
    await inspect(async (firestore) => {
      const [request, assignment, reservation] = await Promise.all([
        getDoc(doc(firestore, 'serviceRequests', 'request-1')),
        getDoc(
          doc(
            firestore,
            'serviceRequests',
            'request-1',
            'assignments',
            accepted.assignmentId,
          ),
        ),
        getDoc(
          doc(
            firestore,
            'professionalReservations',
            professionalA,
            'slots',
            slotId,
          ),
        ),
      ])
      expect(request.data()).toMatchObject({
        status: 'ASSIGNED',
        assignedProfessionalId: professionalA,
      })
      expect(assignment.exists()).toBe(true)
      expect(reservation.exists()).toBe(true)
    })
  })

  it('serializa desativação e aceite concorrentes sem quebrar as invariantes', async () => {
    await seedScenario()
    let arrivals = 0
    let released = false
    let release: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const barrier = {
      async afterRead() {
        if (released) return
        arrivals += 1
        if (arrivals >= 2) {
          released = true
          release?.()
        }
        await waiting
      },
    }
    const professional = serviceFor(
      testEnvironment.authenticatedContext(professionalA).firestore(),
      professionalA,
      barrier,
    )
    const admin = createProfessionalReviewService({
      firestore: testEnvironment.authenticatedContext(adminId).firestore(),
      getActorId: () => adminId,
      coordinator: barrier,
    })

    const [acceptance, restriction] = await Promise.allSettled([
      professional.acceptRequest({ requestId: 'request-1', expectedRound: 1 }),
      admin.setActive({
        professionalId: professionalA,
        expectedVersion: 1,
        expectedRevision: 1,
        active: false,
        reason: 'Restrição concorrente ao aceite.',
      }),
    ])
    expect(restriction.status).toBe('fulfilled')
    await inspect(async (firestore) => {
      const [operational, request, assignments] = await Promise.all([
        getDoc(
          doc(firestore, 'professionalOperationalProfiles', professionalA),
        ),
        getDoc(doc(firestore, 'serviceRequests', 'request-1')),
        getDocs(
          collection(
            firestore,
            'serviceRequests',
            'request-1',
            'assignments',
          ),
        ),
      ])
      expect(operational.data()?.active).toBe(false)
      if (acceptance.status === 'fulfilled') {
        expect(request.data()?.status).toBe('ASSIGNED')
        expect(assignments.size).toBe(1)
      } else {
        expect(request.data()?.status).toBe('OPEN')
        expect(assignments.size).toBe(0)
      }
    })
  })

  it('serializa edição relevante e aceite concorrentes sem cancelar atendimento confirmado', async () => {
    await seedScenario()
    let arrivals = 0
    let released = false
    let release: (() => void) | undefined
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const barrier = {
      async afterRead() {
        if (released) return
        arrivals += 1
        if (arrivals >= 2) {
          released = true
          release?.()
        }
        await waiting
      },
    }
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalA)
      .firestore()
    const professional = serviceFor(
      professionalFirestore,
      professionalA,
      barrier,
    )
    const edit = runTransaction(professionalFirestore, async (transaction) => {
      const profileReference = doc(
        professionalFirestore,
        'professionalProfiles',
        professionalA,
      )
      const operationalReference = doc(
        professionalFirestore,
        'professionalOperationalProfiles',
        professionalA,
      )
      const [profileSnapshot, operationalSnapshot] = await Promise.all([
        transaction.get(profileReference),
        transaction.get(operationalReference),
      ])
      await barrier.afterRead()
      if (!profileSnapshot.exists() || !operationalSnapshot.exists()) {
        throw new Error('Fixture profissional ausente.')
      }
      transaction.update(profileReference, {
        headline: 'Perfil atualizado durante o aceite',
        updatedAt: serverTimestamp(),
      })
      transaction.update(operationalReference, {
        reviewStatus: 'UNDER_REVIEW',
        profileVersion: 2,
        submittedVersion: 2,
        revision: 2,
        lastEventId: 'review-2',
        professionalFeedback: null,
        updatedAt: serverTimestamp(),
      })
      transaction.set(
        doc(operationalReference, 'events', 'review-2'),
        {
          eventId: 'review-2',
          entityType: 'PROFESSIONAL',
          entityId: professionalA,
          professionalId: professionalA,
          actorId: professionalA,
          actorRole: 'PROFESSIONAL',
          action: 'REANALYSIS_REQUIRED',
          reasonCode: 'PROFILE_DATA_CHANGED',
          fromStatus: 'APPROVED',
          toStatus: 'UNDER_REVIEW',
          profileVersion: 2,
          reviewedVersion: null,
          reason: null,
          createdAt: serverTimestamp(),
        },
      )
    })
    const results = await Promise.allSettled([
      professional.acceptRequest({ requestId: 'request-1', expectedRound: 1 }),
      edit,
    ])
    expect(results[1].status).toBe('fulfilled')

    await inspect(async (firestore) => {
      const [operationalSnapshot, request, assignments] = await Promise.all([
        getDoc(
          doc(firestore, 'professionalOperationalProfiles', professionalA),
        ),
        getDoc(doc(firestore, 'serviceRequests', 'request-1')),
        getDocs(
          collection(
            firestore,
            'serviceRequests',
            'request-1',
            'assignments',
          ),
        ),
      ])
      expect(operationalSnapshot.data()).toMatchObject({
        reviewStatus: 'UNDER_REVIEW',
        profileVersion: 2,
        approvedVersion: 1,
      })
      if (results[0].status === 'fulfilled') {
        expect(request.data()?.status).toBe('ASSIGNED')
        expect(assignments.size).toBe(1)
      } else {
        expect(request.data()?.status).toBe('OPEN')
        expect(assignments.size).toBe(0)
      }
    })
  })
})
