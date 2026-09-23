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
  profileImage: {
    provider: 'IMAGEKIT',
    ownerId,
    purpose: 'PROFESSIONAL_AVATAR',
    url: 'https://images.example/profile.webp',
    providerId: 'profile-123',
    createdAt: 1_795_000_000_000,
    updatedAt: 1_795_000_000_000,
    order: 0,
    altText: 'Marina em seu ambiente de trabalho',
  },
  portfolioImages: [
    {
      provider: 'IMAGEKIT',
      ownerId,
      purpose: 'PROFESSIONAL_PORTFOLIO',
      url: 'https://images.example/service.webp',
      providerId: 'portfolio-123',
      createdAt: 1_795_000_000_000,
      updatedAt: 1_795_000_000_000,
      order: 0,
      altText: 'Instalação elétrica concluída',
    },
  ],
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
      name: 'Marina Souza',
      email: 'marina@example.com',
      roles: ['client', 'professional'],
      activeMode: 'professional',
      professionalProfileStatus: 'complete',
    })
    await setDoc(doc(firestore, 'users', otherUserId), {
      name: 'Outro Usuário',
      email: 'outro@example.com',
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
  it('keeps the client avatar isolated by owner and purpose', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const reference = doc(owner, 'clientProfiles', ownerId)
    const clientAvatar = {
      provider: 'IMAGEKIT',
      ownerId,
      purpose: 'CLIENT_AVATAR',
      url: 'https://images.example/client.webp',
      providerId: 'client-avatar-1',
      createdAt: 1_795_000_000_000,
      updatedAt: 1_795_000_000_000,
    }

    await assertSucceeds(
      setDoc(reference, {
        ownerId,
        phone: '11999998888',
        profileImage: clientAvatar,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: { ...clientAvatar, ownerId: otherUserId },
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: {
          ...clientAvatar,
          purpose: 'PROFESSIONAL_AVATAR',
        },
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: {
          ...clientAvatar,
          createdAt: 200,
          updatedAt: 100,
        },
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: { ...clientAvatar, provider: 'MOCK' },
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('keeps the entire client profile private and owner-only', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const visitor = testEnvironment.unauthenticatedContext().firestore()
    const other = testEnvironment.authenticatedContext(otherUserId).firestore()
    const reference = doc(owner, 'clientProfiles', ownerId)

    await assertSucceeds(
      setDoc(reference, {
        ownerId,
        phone: '',
        profileImage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(getDoc(reference))
    await assertFails(getDoc(doc(visitor, 'clientProfiles', ownerId)))
    await assertFails(getDoc(doc(other, 'clientProfiles', ownerId)))
    await assertFails(
      updateDoc(doc(other, 'clientProfiles', ownerId), {
        phone: '1933334444',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows an atomic client profile creation and controlled shared-name update', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const batch = writeBatch(owner)
    batch.set(doc(owner, 'clientProfiles', ownerId), {
      ownerId,
      phone: '11999998888',
      profileImage: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    batch.update(doc(owner, 'users', ownerId), {
      name: 'Marina Santos',
      updatedAt: serverTimestamp(),
    })

    await assertSucceeds(batch.commit())
    await assertFails(
      updateDoc(doc(owner, 'users', ownerId), {
        email: 'novo@example.com',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('rejects duplicate identity and raw image data in the private client profile', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()

    await assertFails(
      setDoc(doc(owner, 'clientProfiles', ownerId), {
        ownerId,
        phone: '',
        email: 'marina@example.com',
        profileImage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      setDoc(doc(owner, 'clientProfiles', ownerId), {
        ownerId,
        phone: '',
        profileImage: {
          provider: 'IMAGEKIT',
          ownerId,
          purpose: 'CLIENT_AVATAR',
          url: 'data:image/webp;base64,AAAA',
          providerId: 'unsafe-avatar',
          createdAt: 1_795_000_000_000,
          updatedAt: 1_795_000_000_000,
          base64: 'AAAA',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

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
    expect(snapshot.data()).not.toHaveProperty('file')
    expect(snapshot.data()).not.toHaveProperty('base64')
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

  it('allows only minimal image metadata in the public profile', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const reference = doc(owner, 'professionalProfiles', ownerId)

    await assertSucceeds(
      updateDoc(reference, {
        portfolioImages: [
          {
            provider: 'IMAGEKIT',
            ownerId,
            purpose: 'PROFESSIONAL_PORTFOLIO',
            url: 'https://images.example/new-service.webp',
            providerId: 'portfolio-456',
            createdAt: 1_795_000_000_000,
            updatedAt: 1_795_000_000_000,
            order: 0,
            altText: 'Novo serviço concluído',
          },
        ],
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: {
          ...publicProfile.profileImage,
          base64: 'data:image/webp;base64,AAAA',
        },
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: {
          ...publicProfile.profileImage,
          provider: 'MOCK',
        },
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        portfolioImages: [
          {
            provider: 'IMAGEKIT',
            ownerId,
            purpose: 'PROFESSIONAL_PORTFOLIO',
            url: 'data:image/webp;base64,AAAA',
            providerId: 'portfolio-unsafe',
            createdAt: 1_795_000_000_000,
            updatedAt: 1_795_000_000_000,
            order: 0,
            altText: 'Imagem inválida',
          },
        ],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows the owner to create a draft containing valid image metadata', async () => {
    const imageOwnerId = 'image-owner'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', imageOwnerId), {
        roles: ['professional'],
        activeMode: 'professional',
        professionalProfileStatus: 'not-started',
      })
    })
    const owner = testEnvironment.authenticatedContext(imageOwnerId).firestore()

    await assertSucceeds(
      setDoc(doc(owner, 'professionalProfiles', imageOwnerId), {
        ...publicProfile,
        ownerId: imageOwnerId,
        status: 'DRAFT',
        profileImage: {
          ...publicProfile.profileImage,
          ownerId: imageOwnerId,
        },
        portfolioImages: Array.from({ length: 3 }, (_, order) => ({
          provider: 'IMAGEKIT',
          ownerId: imageOwnerId,
          purpose: 'PROFESSIONAL_PORTFOLIO',
          url: `https://images.example/service-${order}.webp`,
          providerId: `portfolio-${order}`,
          createdAt: 1_795_000_000_000,
          updatedAt: 1_795_000_000_000,
          order,
          altText: `Serviço concluído ${order + 1}`,
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('rejects image metadata with another owner or purpose', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
    const reference = doc(owner, 'professionalProfiles', ownerId)

    await assertFails(
      updateDoc(reference, {
        profileImage: {
          ...publicProfile.profileImage,
          ownerId: otherUserId,
        },
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(reference, {
        profileImage: {
          ...publicProfile.profileImage,
          purpose: 'PROFESSIONAL_PORTFOLIO',
        },
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks another user from replacing the professional avatar', async () => {
    await seedProfiles()
    const otherUser = testEnvironment
      .authenticatedContext(otherUserId)
      .firestore()

    await assertFails(
      updateDoc(doc(otherUser, 'professionalProfiles', ownerId), {
        profileImage: {
          ...publicProfile.profileImage,
          providerId: 'attacker-replacement',
          url: 'https://images.example/attacker.webp',
          updatedAt: 1_796_000_000_000,
        },
        updatedAt: serverTimestamp(),
      }),
    )
  })
})
