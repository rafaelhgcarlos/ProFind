import { readFile } from 'node:fs/promises'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const projectId = 'profind-rules-test'
const ownerId = 'professional-owner'
const otherUserId = 'another-user'

let testEnvironment: RulesTestEnvironment

const publicProfile = {
  ownerId,
  publicName: 'Marina Souza',
  headline: 'Eletricista residencial',
  bio: 'Instalações e reparos residenciais.',
  categoryIds: ['construction'],
  specialtyIds: ['electrician'],
  experienceYears: 8,
  baseLocation: {
    city: 'Campinas',
    stateCode: 'SP',
    ibgeCode: '3509502',
  },
  serviceMode: 'RADIUS',
  serviceRadiusKm: 30,
  selectedCities: [],
  selectedCityIbgeCodes: [],
  availability: 'AVAILABLE',
  contactVisibility: 'PRIVATE',
  status: 'PUBLISHED',
  createdAt: new Date('2026-09-22T12:00:00Z'),
  updatedAt: new Date('2026-09-22T12:00:00Z'),
}

const privateProfile = {
  ownerId,
  phone: '11999998888',
  privateLocation: {
    postalCode: '13083852',
    neighborhood: 'Cidade Universitária',
  },
  updatedAt: new Date('2026-09-22T12:00:00Z'),
}

async function seedProfiles() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await setDoc(doc(firestore, 'users', ownerId), {
      roles: ['professional'],
      activeMode: 'professional',
      professionalProfileStatus: 'complete',
    })
    await setDoc(doc(firestore, 'users', otherUserId), {
      roles: ['client'],
      activeMode: 'client',
      professionalProfileStatus: 'not-started',
    })
    await setDoc(doc(firestore, 'professionalProfiles', ownerId), publicProfile)
    await setDoc(
      doc(firestore, 'professionalPrivateProfiles', ownerId),
      privateProfile,
    )
  })
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

describe('Firestore privacy rules for professional profiles', () => {
  it('returns only authorized approximate data to a visitor', async () => {
    await seedProfiles()
    const firestore = testEnvironment.unauthenticatedContext().firestore()

    const snapshot = await assertSucceeds(
      getDoc(doc(firestore, 'professionalProfiles', ownerId)),
    )

    expect(snapshot.data()).toMatchObject({
      baseLocation: {
        city: 'Campinas',
        stateCode: 'SP',
        ibgeCode: '3509502',
      },
      serviceMode: 'RADIUS',
      serviceRadiusKm: 30,
    })
    expect(snapshot.data()).not.toHaveProperty('phone')
    expect(snapshot.data()).not.toHaveProperty('privateLocation')
    expect(snapshot.data()).not.toHaveProperty('postalCode')
    expect(snapshot.data()).not.toHaveProperty('neighborhood')
  })

  it('blocks private reads for visitors and authenticated non-owners', async () => {
    await seedProfiles()
    const visitor = testEnvironment.unauthenticatedContext().firestore()
    const otherUser = testEnvironment
      .authenticatedContext(otherUserId)
      .firestore()
    const privatePath = 'professionalPrivateProfiles'

    await assertFails(getDoc(doc(visitor, privatePath, ownerId)))
    await assertFails(getDoc(doc(otherUser, privatePath, ownerId)))
  })

  it('allows the owner to read and update private data', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const reference = doc(owner, 'professionalPrivateProfiles', ownerId)

    const snapshot = await assertSucceeds(getDoc(reference))
    expect(snapshot.data()).toMatchObject({
      ownerId,
      phone: privateProfile.phone,
      privateLocation: privateProfile.privateLocation,
    })
    await assertSucceeds(
      updateDoc(reference, {
        phone: '1933334444',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows an atomic public/private profile update by the owner', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const batch = writeBatch(owner)
    batch.update(doc(owner, 'professionalProfiles', ownerId), {
      contactVisibility: 'PUBLIC',
      phone: '11999998888',
      updatedAt: serverTimestamp(),
    })
    batch.set(doc(owner, 'professionalPrivateProfiles', ownerId), {
      ...privateProfile,
      updatedAt: serverTimestamp(),
    })

    await assertSucceeds(batch.commit())
  })

  it('blocks private writes from another authenticated user', async () => {
    await seedProfiles()
    const otherUser = testEnvironment
      .authenticatedContext(otherUserId)
      .firestore()

    await assertFails(
      updateDoc(
        doc(otherUser, 'professionalPrivateProfiles', ownerId),
        {
          phone: '1933334444',
          updatedAt: serverTimestamp(),
        },
      ),
    )
  })

  it('rejects sensitive fields added to the public profile', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()

    await assertFails(
      updateDoc(doc(owner, 'professionalProfiles', ownerId), {
        postalCode: '13083852',
        neighborhood: 'Cidade Universitária',
        privateLocation: privateProfile.privateLocation,
        updatedAt: serverTimestamp(),
      }),
    )
  })
})
