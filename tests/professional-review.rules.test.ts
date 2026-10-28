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
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { ReviewTransactionCoordinator } from '../src/repositories/professional-review.repository'
import { createProfessionalReviewService } from '../src/services/professional-review.service'

const projectId = 'profind-review-rules-test'
const professionalId = 'review-professional'
const adminId = 'review-admin'
const commonUserId = 'review-common'
const cityIbgeCode = '3509502'

let testEnvironment: RulesTestEnvironment

const profile = {
  ownerId: professionalId,
  publicName: 'Marina Souza',
  headline: 'Eletricista residencial',
  bio: 'Instalações e reparos residenciais.',
  categoryIds: ['construction'],
  specialtyIds: ['electrician'],
  experienceYears: 8,
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
  profileImage: {
    provider: 'IMAGEKIT',
    ownerId: professionalId,
    purpose: 'PROFESSIONAL_AVATAR',
    url: 'https://images.example/profile.webp',
    providerId: 'profile-1',
    createdAt: 1_795_000_000_000,
    updatedAt: 1_795_000_000_000,
    order: 0,
    altText: 'Profissional em atendimento',
  },
  portfolioImages: [],
  status: 'PUBLISHED',
  createdAt: new Date('2026-10-20T12:00:00Z'),
  updatedAt: new Date('2026-10-20T12:00:00Z'),
}

function operational(
  reviewStatus = 'UNDER_REVIEW',
  overrides: Record<string, unknown> = {},
) {
  const approved = reviewStatus === 'APPROVED' || reviewStatus === 'SUSPENDED'
  return {
    schemaVersion: 1,
    professionalId,
    reviewStatus,
    active: reviewStatus === 'APPROVED',
    profileVersion: 1,
    submittedVersion: reviewStatus === 'UNDER_REVIEW' ? 1 : null,
    approvedVersion: approved ? 1 : null,
    revision: 1,
    lastEventId: 'review-1',
    professionalFeedback: null,
    approvedCategoryIds: approved ? profile.categoryIds : [],
    approvedSpecialtyIds: approved ? profile.specialtyIds : [],
    approvedBaseCityIbgeCode: approved ? cityIbgeCode : '',
    approvedSelectedCityIbgeCodes: [],
    eligibleCityIbgeCodes: approved ? [cityIbgeCode] : [],
    updatedAt: new Date('2026-10-20T12:00:00Z'),
    ...overrides,
  }
}

async function seedReview(
  reviewStatus = 'UNDER_REVIEW',
  overrides: {
    profile?: Record<string, unknown>
    operational?: Record<string, unknown>
  } = {},
) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await setDoc(doc(firestore, 'adminAccess', adminId), {
      active: true,
      schemaVersion: 1,
    })
    await setDoc(doc(firestore, 'users', professionalId), {
      roles: ['client', 'professional'],
      activeMode: 'professional',
      professionalProfileStatus: 'complete',
    })
    await setDoc(doc(firestore, 'users', commonUserId), {
      roles: ['client'],
      activeMode: 'client',
      professionalProfileStatus: 'not-started',
    })
    await setDoc(doc(firestore, 'professionalProfiles', professionalId), {
      ...profile,
      ...overrides.profile,
    })
    await setDoc(
      doc(firestore, 'professionalOperationalProfiles', professionalId),
      operational(reviewStatus, overrides.operational),
    )
  })
}

function reviewService(
  firestore: Firestore,
  actorId: string,
  coordinator?: ReviewTransactionCoordinator,
) {
  return createProfessionalReviewService({
    firestore,
    getActorId: () => actorId,
    coordinator,
  })
}

function coordinatedBarrier(parties: number): ReviewTransactionCoordinator {
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

async function editReviewedProfile(
  firestore: Firestore,
  changes: Record<string, unknown>,
  coordinator?: ReviewTransactionCoordinator,
) {
  return runTransaction(firestore, async (transaction) => {
    const profileReference = doc(
      firestore,
      'professionalProfiles',
      professionalId,
    )
    const operationalReference = doc(
      firestore,
      'professionalOperationalProfiles',
      professionalId,
    )
    const [profileSnapshot, operationalSnapshot] = await Promise.all([
      transaction.get(profileReference),
      transaction.get(operationalReference),
    ])
    await coordinator?.afterRead('submit')
    const current = operationalSnapshot.data()
    if (!profileSnapshot.exists() || !current) throw new Error('fixture ausente')
    const profileVersion = Number(current.profileVersion) + 1
    const revision = Number(current.revision ?? 0) + 1
    const eventId = `review-${revision}`
    const fromStatus = String(current.reviewStatus)
    const toStatus = ['REJECTED', 'SUSPENDED'].includes(fromStatus)
      ? fromStatus
      : 'UNDER_REVIEW'
    const action =
      fromStatus === 'APPROVED' || fromStatus === 'UNDER_REVIEW'
        ? 'REANALYSIS_REQUIRED'
        : 'PROFILE_UPDATED'
    transaction.update(profileReference, {
      ...changes,
      updatedAt: serverTimestamp(),
    })
    transaction.update(operationalReference, {
      reviewStatus: toStatus,
      profileVersion,
      submittedVersion: toStatus === 'UNDER_REVIEW' ? profileVersion : null,
      revision,
      lastEventId: eventId,
      professionalFeedback: toStatus === 'UNDER_REVIEW' ? null : current.professionalFeedback,
      updatedAt: serverTimestamp(),
    })
    transaction.set(doc(operationalReference, 'events', eventId), {
      eventId,
      entityType: 'PROFESSIONAL',
      entityId: professionalId,
      professionalId,
      actorId: professionalId,
      actorRole: 'PROFESSIONAL',
      action,
      reasonCode: 'PROFILE_DATA_CHANGED',
      fromStatus,
      toStatus,
      profileVersion,
      reviewedVersion: null,
      reason: null,
      createdAt: serverTimestamp(),
    })
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
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
})

afterEach(async () => {
  await testEnvironment.clearFirestore()
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

describe('professional review domain and Security Rules', () => {
  it('accepts a complete submission and rejects an incomplete draft', async () => {
    await seedReview('DRAFT', {
      profile: { status: 'DRAFT', publicName: '' },
      operational: { submittedVersion: null },
    })
    const professional = reviewService(
      testEnvironment.authenticatedContext(professionalId).firestore(),
      professionalId,
    )
    await expect(
      professional.submitForReview({
        professionalId,
        expectedVersion: 1,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'invalid-profile' })

    await inspect((firestore) =>
      updateDoc(doc(firestore, 'professionalProfiles', professionalId), profile),
    )
    const submissionInput = {
      professionalId,
      expectedVersion: 1,
      expectedRevision: 1,
    }
    await expect(
      professional.submitForReview(submissionInput),
    ).resolves.toMatchObject({
      reviewStatus: 'UNDER_REVIEW',
      idempotent: false,
    })
    await expect(
      professional.submitForReview(submissionInput),
    ).resolves.toMatchObject({
      reviewStatus: 'UNDER_REVIEW',
      idempotent: true,
    })
    await inspect(async (firestore) => {
      const events = await getDocs(
        collection(
          firestore,
          'professionalOperationalProfiles',
          professionalId,
          'events',
        ),
      )
      expect(events.size).toBe(1)
    })
  })

  it('resubmits requested changes and lets an admin approve only the current version', async () => {
    await seedReview('CHANGES_REQUESTED', {
      operational: {
        profileVersion: 2,
        professionalFeedback: 'Detalhe melhor sua experiência.',
      },
    })
    const professional = reviewService(
      testEnvironment.authenticatedContext(professionalId).firestore(),
      professionalId,
    )
    const admin = reviewService(
      testEnvironment.authenticatedContext(adminId).firestore(),
      adminId,
    )
    await professional.submitForReview({
      professionalId,
      expectedVersion: 2,
      expectedRevision: 1,
    })
    await expect(
      admin.decide({
        professionalId,
        expectedVersion: 1,
        expectedRevision: 2,
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'stale-version' })
    const approved = await admin.decide({
      professionalId,
      expectedVersion: 2,
      expectedRevision: 2,
      decision: 'APPROVED',
      internalNote: 'Cadastro demonstrativo coerente.',
    })
    expect(approved).toMatchObject({
      reviewStatus: 'APPROVED',
      profileVersion: 2,
      revision: 3,
    })
    await expect(
      admin.setActive({
        professionalId,
        expectedVersion: 2,
        expectedRevision: 3,
        active: true,
        reason: 'Cadastro aprovado e liberado para novas oportunidades.',
      }),
    ).resolves.toMatchObject({ active: true, revision: 4 })
  })

  it('denies self-approval, self-activation and removal of suspension', async () => {
    await seedReview('SUSPENDED', {
      operational: { active: false, professionalFeedback: 'Suspensão administrativa.' },
    })
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    const reference = doc(
      professional,
      'professionalOperationalProfiles',
      professionalId,
    )
    await assertFails(updateDoc(reference, { reviewStatus: 'APPROVED' }))
    await assertFails(updateDoc(reference, { active: true }))
    await assertFails(updateDoc(reference, { approvedVersion: 1 }))
    await assertFails(updateDoc(reference, { reviewerId: professionalId }))
    await assertFails(
      updateDoc(reference, {
        reviewStatus: 'CHANGES_REQUESTED',
        active: false,
      }),
    )

    await seedReview('REJECTED', {
      operational: {
        active: false,
        professionalFeedback: 'Rejeição administrativa.',
      },
    })
    await assertFails(
      updateDoc(reference, {
        reviewStatus: 'UNDER_REVIEW',
        submittedVersion: 1,
      }),
    )
  })

  it('suspends without deleting the profile and does not let activation bypass review', async () => {
    await seedReview('APPROVED')
    const admin = reviewService(
      testEnvironment.authenticatedContext(adminId).firestore(),
      adminId,
    )
    const suspended = await admin.suspend({
      professionalId,
      expectedVersion: 1,
      expectedRevision: 1,
      reason: 'Suspensão administrativa demonstrativa.',
      internalNote: 'Reavaliar antes de permitir novos aceites.',
    })
    expect(suspended).toMatchObject({
      reviewStatus: 'SUSPENDED',
      active: false,
      revision: 2,
    })
    const professionalFirestore = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    await editReviewedProfile(professionalFirestore, {
      bio: 'Correção feita sem remover a suspensão.',
    })
    await expect(
      admin.setActive({
        professionalId,
        expectedVersion: 2,
        expectedRevision: 3,
        active: true,
        reason: 'Tentativa de reativação sem nova análise.',
      }),
    ).rejects.toMatchObject({ code: 'invalid-transition' })
    await assertSucceeds(
      getDoc(
        doc(
          professionalFirestore,
          'professionalProfiles',
          professionalId,
        ),
      ),
    )
    await inspect(async (firestore) => {
      const snapshot = await getDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalId),
      )
      expect(snapshot.data()).toMatchObject({
        reviewStatus: 'SUSPENDED',
        profileVersion: 2,
        active: false,
      })
    })
  })

  it('invalidates approval atomically on relevant or image changes and rejects omission of versioning', async () => {
    await seedReview('APPROVED')
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    await assertFails(
      updateDoc(doc(professional, 'professionalProfiles', professionalId), {
        bio: 'Tentativa sem incrementar a versão.',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(
      editReviewedProfile(professional, {
        profileImage: {
          ...profile.profileImage,
          url: 'https://images.example/profile-v2.webp',
          providerId: 'profile-2',
          updatedAt: 1_796_000_000_000,
        },
      }),
    )
    await inspect(async (firestore) => {
      const snapshot = await getDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalId),
      )
      expect(snapshot.data()).toMatchObject({
        reviewStatus: 'UNDER_REVIEW',
        profileVersion: 2,
        approvedVersion: 1,
        active: true,
      })
    })
  })

  it('allows portfolio changes while under review only with the next version and audit event', async () => {
    await seedReview('UNDER_REVIEW')
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()

    await assertSucceeds(
      editReviewedProfile(professional, {
        portfolioImages: [
          {
            provider: 'IMAGEKIT',
            ownerId: professionalId,
            purpose: 'PROFESSIONAL_PORTFOLIO',
            url: 'https://images.example/portfolio-under-review.webp',
            providerId: 'portfolio-under-review',
            createdAt: 1_796_000_000_000,
            updatedAt: 1_796_000_000_000,
            order: 0,
            altText: 'Trabalho enviado durante a análise',
          },
        ],
      }),
    )

    await inspect(async (firestore) => {
      const operationalSnapshot = await getDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalId),
      )
      const eventSnapshot = await getDoc(
        doc(
          firestore,
          'professionalOperationalProfiles',
          professionalId,
          'events',
          'review-2',
        ),
      )
      expect(operationalSnapshot.data()).toMatchObject({
        reviewStatus: 'UNDER_REVIEW',
        profileVersion: 2,
        submittedVersion: 2,
        revision: 2,
        lastEventId: 'review-2',
      })
      expect(eventSnapshot.data()).toMatchObject({
        action: 'REANALYSIS_REQUIRED',
        fromStatus: 'UNDER_REVIEW',
        toStatus: 'UNDER_REVIEW',
        profileVersion: 2,
      })
    })
  })

  it('keeps version, approval and reservations when only availability changes', async () => {
    await seedReview('APPROVED')
    await inspect(async (firestore) => {
      await setDoc(
        doc(
          firestore,
          'professionalReservations',
          professionalId,
          'slots',
          '2026-11-10_MORNING',
        ),
        { requestId: 'existing-request' },
      )
    })
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    await assertSucceeds(
      updateDoc(doc(professional, 'professionalProfiles', professionalId), {
        availability: 'LIMITED',
        updatedAt: serverTimestamp(),
      }),
    )
    await inspect(async (firestore) => {
      const [op, reservation] = await Promise.all([
        getDoc(doc(firestore, 'professionalOperationalProfiles', professionalId)),
        getDoc(
          doc(
            firestore,
            'professionalReservations',
            professionalId,
            'slots',
            '2026-11-10_MORNING',
          ),
        ),
      ])
      expect(op.data()).toMatchObject({
        reviewStatus: 'APPROVED',
        profileVersion: 1,
        approvedVersion: 1,
      })
      expect(reservation.exists()).toBe(true)
    })
  })

  it('keeps internal notes admin-only and makes retries idempotent', async () => {
    await seedReview()
    const adminFirestore = testEnvironment.authenticatedContext(adminId).firestore()
    const admin = reviewService(adminFirestore, adminId)
    const input = {
      professionalId,
      expectedVersion: 1,
      expectedRevision: 1,
      decision: 'CHANGES_REQUESTED' as const,
      feedback: 'Inclua mais detalhes na descrição pública.',
      internalNote: 'Não expor esta observação ao profissional.',
    }
    const first = await admin.decide(input)
    const retry = await admin.decide(input)
    expect(first.idempotent).toBe(false)
    expect(retry.idempotent).toBe(true)

    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    await assertSucceeds(
      getDoc(
        doc(
          professional,
          'professionalOperationalProfiles',
          professionalId,
          'events',
          first.eventId,
        ),
      ),
    )
    const publicEventReference = doc(
      adminFirestore,
      'professionalOperationalProfiles',
      professionalId,
      'events',
      first.eventId,
    )
    const internalEventReference = doc(
      adminFirestore,
      'professionalReviewInternal',
      professionalId,
      'events',
      first.eventId,
    )
    await assertFails(
      updateDoc(publicEventReference, { actorId: professionalId }),
    )
    await assertFails(deleteDoc(publicEventReference))
    await assertFails(
      updateDoc(internalEventReference, { note: 'Nota reescrita.' }),
    )
    await assertFails(deleteDoc(internalEventReference))
    await assertFails(
      getDoc(
        doc(
          professional,
          'professionalReviewInternal',
          professionalId,
          'events',
          first.eventId,
        ),
      ),
    )
    await assertSucceeds(
      getDoc(
        doc(
          adminFirestore,
          'professionalReviewInternal',
          professionalId,
          'events',
          first.eventId,
        ),
      ),
    )
    await inspect(async (firestore) => {
      const events = await getDocs(
        collection(
          firestore,
          'professionalOperationalProfiles',
          professionalId,
          'events',
        ),
      )
      expect(events.size).toBe(1)
    })
  })

  it('does not change professional approval when the client avatar changes', async () => {
    await seedReview('APPROVED')
    await inspect(async (firestore) => {
      await setDoc(doc(firestore, 'clientProfiles', professionalId), {
        ownerId: professionalId,
        phone: '',
        profileImage: null,
        createdAt: new Date('2026-10-20T12:00:00Z'),
        updatedAt: new Date('2026-10-20T12:00:00Z'),
      })
    })
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    await assertSucceeds(
      updateDoc(doc(professional, 'clientProfiles', professionalId), {
        profileImage: {
          provider: 'IMAGEKIT',
          ownerId: professionalId,
          purpose: 'CLIENT_AVATAR',
          url: 'https://images.example/client.webp',
          providerId: 'client-1',
          createdAt: 1_795_000_000_000,
          updatedAt: 1_795_000_000_000,
        },
        updatedAt: serverTimestamp(),
      }),
    )
    await inspect(async (firestore) => {
      const snapshot = await getDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalId),
      )
      expect(snapshot.data()).toMatchObject({
        reviewStatus: 'APPROVED',
        profileVersion: 1,
        approvedVersion: 1,
      })
    })
  })

  it('coordinates a real race between admin approval and professional editing', async () => {
    await seedReview()
    const barrier = coordinatedBarrier(2)
    const admin = reviewService(
      testEnvironment.authenticatedContext(adminId).firestore(),
      adminId,
      barrier,
    )
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()

    const results = await Promise.allSettled([
      admin.decide({
        professionalId,
        expectedVersion: 1,
        expectedRevision: 1,
        decision: 'APPROVED',
      }),
      editReviewedProfile(
        professional,
        { bio: 'Descrição editada durante a decisão.' },
        barrier,
      ),
    ])
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
    await inspect(async (firestore) => {
      const snapshot = await getDoc(
        doc(firestore, 'professionalOperationalProfiles', professionalId),
      )
      const data = snapshot.data()
      expect([1, 2]).toContain(data?.profileVersion)
      expect(
        data?.reviewStatus !== 'APPROVED' ||
          data?.approvedVersion === data?.profileVersion,
      ).toBe(true)
    })
  })

  it('rejects administrative operations from a common account', async () => {
    await seedReview()
    const common = reviewService(
      testEnvironment.authenticatedContext(commonUserId).firestore(),
      commonUserId,
    )
    await expect(
      common.decide({
        professionalId,
        expectedVersion: 1,
        expectedRevision: 1,
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('rejects orphan review events, forged actor roles and delayed internal notes', async () => {
    await seedReview()
    const professional = testEnvironment
      .authenticatedContext(professionalId)
      .firestore()
    const admin = testEnvironment.authenticatedContext(adminId).firestore()
    const orphanEvent = {
      eventId: 'review-1',
      entityType: 'PROFESSIONAL',
      entityId: professionalId,
      professionalId,
      actorId: professionalId,
      actorRole: 'PROFESSIONAL',
      action: 'PROFILE_SUBMITTED',
      reasonCode: 'PROFESSIONAL_SUBMISSION',
      fromStatus: 'DRAFT',
      toStatus: 'UNDER_REVIEW',
      profileVersion: 1,
      reviewedVersion: null,
      reason: null,
      createdAt: serverTimestamp(),
    }

    await assertFails(
      setDoc(
        doc(
          professional,
          'professionalOperationalProfiles',
          professionalId,
          'events',
          'review-1',
        ),
        orphanEvent,
      ),
    )
    await assertFails(
      setDoc(
        doc(
          professional,
          'professionalOperationalProfiles',
          professionalId,
          'events',
          'review-1',
        ),
        { ...orphanEvent, actorRole: 'ADMIN' },
      ),
    )
    await assertFails(
      setDoc(
        doc(
          admin,
          'professionalReviewInternal',
          professionalId,
          'events',
          'review-1',
        ),
        {
          eventId: 'review-1',
          professionalId,
          actorId: adminId,
          action: 'APPROVED',
          reviewedVersion: 1,
          note: 'Nota criada fora da decisão.',
          createdAt: serverTimestamp(),
        },
      ),
    )
  })

  it('lists the limited review chronology without exposing internal notes', async () => {
    await seedReview('DRAFT', {
      operational: {
        active: false,
        submittedVersion: null,
        approvedVersion: null,
        approvedCategoryIds: [],
        approvedSpecialtyIds: [],
        approvedBaseCityIbgeCode: '',
        approvedSelectedCityIbgeCodes: [],
        eligibleCityIbgeCodes: [],
      },
    })
    const professional = reviewService(
      testEnvironment.authenticatedContext(professionalId).firestore(),
      professionalId,
    )
    const admin = reviewService(
      testEnvironment.authenticatedContext(adminId).firestore(),
      adminId,
    )
    const common = reviewService(
      testEnvironment.authenticatedContext(commonUserId).firestore(),
      commonUserId,
    )

    await professional.submitForReview({
      professionalId,
      expectedVersion: 1,
      expectedRevision: 1,
    })
    await admin.decide({
      professionalId,
      expectedVersion: 1,
      expectedRevision: 2,
      decision: 'APPROVED',
      internalNote: 'Critérios demonstrativos atendidos.',
    })
    await admin.setActive({
      professionalId,
      expectedVersion: 1,
      expectedRevision: 3,
      active: true,
      reason: 'Ativação operacional autorizada pela administração.',
      internalNote: 'Contato interno sem exposição ao profissional.',
    })

    const [ownerHistory, adminHistory] = await Promise.all([
      professional.listHistory(professionalId, 50),
      admin.listHistory(professionalId, 50),
    ])
    expect(ownerHistory).toHaveLength(3)
    expect(adminHistory).toEqual(ownerHistory)
    expect(ownerHistory.map((event) => event.action)).toEqual([
      'ACTIVATED',
      'APPROVED',
      'PROFILE_SUBMITTED',
    ])
    expect(ownerHistory.every((event) => (
      event.entityType === 'PROFESSIONAL' &&
      event.entityId === professionalId &&
      event.professionalId === professionalId &&
      event.createdAt instanceof Date &&
      !('note' in event)
    ))).toBe(true)
    await expect(common.listHistory(professionalId, 50)).rejects.toMatchObject({
      code: 'permission-denied',
    })

    const adminFirestore = testEnvironment.authenticatedContext(adminId).firestore()
    await assertFails(
      getDocs(
        query(
          collection(
            adminFirestore,
            'professionalOperationalProfiles',
            professionalId,
            'events',
          ),
          orderBy('createdAt', 'desc'),
          limit(51),
        ),
      ),
    )
    await assertFails(
      getDocs(
        query(
          collection(
            testEnvironment.authenticatedContext(professionalId).firestore(),
            'professionalReviewInternal',
            professionalId,
            'events',
          ),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
      ),
    )
  })
})
