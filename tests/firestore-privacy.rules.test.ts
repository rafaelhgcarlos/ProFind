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
  orderBy,
  query,
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

function operationalReview(professionalId: string) {
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
    approvedCategoryIds: publicProfile.categoryIds,
    approvedSpecialtyIds: publicProfile.specialtyIds,
    approvedBaseCityIbgeCode: publicProfile.baseLocation.ibgeCode,
    approvedSelectedCityIbgeCodes: [],
    eligibleCityIbgeCodes: [publicProfile.baseLocation.ibgeCode],
    updatedAt: new Date('2026-09-22T12:00:00Z'),
  }
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
      doc(firestore, 'professionalOperationalProfiles', ownerId),
      operationalReview(ownerId),
    )
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

  it('preserves an unchanged legacy client avatar but rejects new legacy metadata', async () => {
    await seedProfiles()
    const legacyAvatar = {
      ownerId,
      purpose: 'CLIENT_AVATAR',
      url: 'https://images.example/legacy-client.webp',
      providerId: 'legacy-client-avatar',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'clientProfiles', ownerId), {
        ownerId,
        phone: '',
        profileImage: legacyAvatar,
        createdAt: new Date('2025-01-01T12:00:00Z'),
        updatedAt: new Date('2025-01-01T12:00:00Z'),
      })
    })
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()

    await assertSucceeds(
      updateDoc(doc(owner, 'clientProfiles', ownerId), {
        phone: '11999998888',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(owner, 'clientProfiles', ownerId), {
        profileImage: {
          ...legacyAvatar,
          providerId: 'forged-legacy-avatar',
        },
        updatedAt: serverTimestamp(),
      }),
    )
    const otherOwner = testEnvironment
      .authenticatedContext(otherUserId)
      .firestore()
    await assertFails(
      setDoc(doc(otherOwner, 'clientProfiles', otherUserId), {
        ownerId: otherUserId,
        phone: '',
        profileImage: { ...legacyAvatar, ownerId: otherUserId },
        createdAt: serverTimestamp(),
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

    const operationalSnapshot = await getDoc(
      doc(owner, 'professionalOperationalProfiles', ownerId),
    )
    expect(operationalSnapshot.data()).toMatchObject({
      reviewStatus: 'APPROVED',
      active: true,
      profileVersion: 1,
      approvedVersion: 1,
    })
  })

  it('does not invalidate professional approval when the client avatar changes', async () => {
    await seedProfiles()
    const owner = testEnvironment.authenticatedContext(ownerId).firestore()
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

    await assertSucceeds(
      updateDoc(reference, {
        profileImage: {
          provider: 'IMAGEKIT',
          ownerId,
          purpose: 'CLIENT_AVATAR',
          url: 'https://images.example/client-only.webp',
          providerId: 'client-only-avatar',
          createdAt: 1_795_000_000_000,
          updatedAt: 1_795_000_000_000,
        },
        updatedAt: serverTimestamp(),
      }),
    )

    const operationalSnapshot = await getDoc(
      doc(owner, 'professionalOperationalProfiles', ownerId),
    )
    expect(operationalSnapshot.data()).toMatchObject({
      reviewStatus: 'APPROVED',
      active: true,
      profileVersion: 1,
      approvedVersion: 1,
    })
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

    const imageBatch = writeBatch(owner)
    imageBatch.update(reference, {
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
      })
    imageBatch.set(
      doc(owner, 'professionalOperationalProfiles', ownerId),
      {
        ...operationalReview(ownerId),
        reviewStatus: 'UNDER_REVIEW',
        profileVersion: 2,
        submittedVersion: 2,
        revision: 2,
        lastEventId: 'review-2',
        updatedAt: serverTimestamp(),
      },
    )
    imageBatch.set(
      doc(owner, 'professionalOperationalProfiles', ownerId, 'events', 'review-2'),
      {
        eventId: 'review-2',
        entityType: 'PROFESSIONAL',
        entityId: ownerId,
        professionalId: ownerId,
        actorId: ownerId,
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
    await assertSucceeds(imageBatch.commit())
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

    const batch = writeBatch(owner)
    batch.set(doc(owner, 'professionalProfiles', imageOwnerId), {
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
      })
    batch.set(
      doc(owner, 'professionalOperationalProfiles', imageOwnerId),
      {
        schemaVersion: 1,
        professionalId: imageOwnerId,
        reviewStatus: 'DRAFT',
        active: false,
        profileVersion: 1,
        submittedVersion: null,
        approvedVersion: null,
        revision: 1,
        lastEventId: 'review-1',
        professionalFeedback: null,
        approvedCategoryIds: [],
        approvedSpecialtyIds: [],
        approvedBaseCityIbgeCode: '',
        approvedSelectedCityIbgeCodes: [],
        eligibleCityIbgeCodes: [],
        updatedAt: serverTimestamp(),
      },
    )
    batch.set(
      doc(owner, 'professionalOperationalProfiles', imageOwnerId, 'events', 'review-1'),
      {
        eventId: 'review-1',
        entityType: 'PROFESSIONAL',
        entityId: imageOwnerId,
        professionalId: imageOwnerId,
        actorId: imageOwnerId,
        actorRole: 'PROFESSIONAL',
        action: 'PROFILE_UPDATED',
        reasonCode: 'PROFILE_DATA_CHANGED',
        fromStatus: 'DRAFT',
        toStatus: 'DRAFT',
        profileVersion: 1,
        reviewedVersion: null,
        reason: null,
        createdAt: serverTimestamp(),
      },
    )
    await assertSucceeds(batch.commit())
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

describe('Firestore rules for administrative access', () => {
  const adminId = 'authorized-admin'
  const commonUserId = 'common-user'

  async function seedAdministrativeDocuments(active = true) {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore()
      await setDoc(doc(firestore, 'adminAccess', adminId), {
        active,
        schemaVersion: 1,
        provisionedAt: new Date('2026-10-26T12:00:00Z'),
        provisionedBy: 'bootstrap:firebase-console',
      })
      await setDoc(doc(firestore, 'adminData', 'panelStatus'), {
        ready: true,
      })
      await setDoc(doc(firestore, 'users', commonUserId), {
        name: 'Usuário Comum',
        email: 'comum@example.com',
        roles: ['client'],
        activeMode: 'client',
        professionalProfileStatus: 'not-started',
      })
    })
  }

  it('permite ao administrador ler somente sua própria credencial', async () => {
    await seedAdministrativeDocuments()
    const admin = testEnvironment.authenticatedContext(adminId).firestore()
    const common = testEnvironment.authenticatedContext(commonUserId).firestore()
    const visitor = testEnvironment.unauthenticatedContext().firestore()

    const snapshot = await assertSucceeds(
      getDoc(doc(admin, 'adminAccess', adminId)),
    )
    expect(snapshot.data()).toMatchObject({ active: true, schemaVersion: 1 })
    await assertFails(getDoc(doc(common, 'adminAccess', adminId)))
    await assertFails(getDoc(doc(visitor, 'adminAccess', adminId)))
  })

  it('nega criação, alteração e exclusão de credenciais a qualquer cliente web', async () => {
    await seedAdministrativeDocuments()
    const admin = testEnvironment.authenticatedContext(adminId).firestore()
    const common = testEnvironment.authenticatedContext(commonUserId).firestore()

    await assertFails(
      setDoc(doc(common, 'adminAccess', commonUserId), {
        active: true,
        schemaVersion: 1,
        provisionedAt: serverTimestamp(),
        provisionedBy: commonUserId,
      }),
    )
    await assertFails(
      updateDoc(doc(admin, 'adminAccess', adminId), { active: false }),
    )
    await assertFails(deleteDoc(doc(admin, 'adminAccess', adminId)))
  })

  it('impede autopromoção por roles e activeMode no documento público do usuário', async () => {
    await seedAdministrativeDocuments()
    const common = testEnvironment.authenticatedContext(commonUserId).firestore()

    await assertFails(
      updateDoc(doc(common, 'users', commonUserId), {
        roles: ['client', 'admin'],
        activeMode: 'admin',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('protege dados administrativos e falha de forma fechada após revogação', async () => {
    await seedAdministrativeDocuments()
    const admin = testEnvironment.authenticatedContext(adminId).firestore()
    const common = testEnvironment.authenticatedContext(commonUserId).firestore()
    const visitor = testEnvironment.unauthenticatedContext().firestore()
    const adminDataPath = 'adminData/panelStatus'

    await assertSucceeds(getDoc(doc(admin, adminDataPath)))
    await assertFails(getDoc(doc(common, adminDataPath)))
    await assertFails(getDoc(doc(visitor, adminDataPath)))
    await assertFails(setDoc(doc(admin, 'adminData', 'webWrite'), { ready: true }))

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'adminAccess', adminId), {
        active: false,
      })
    })

    await assertFails(getDoc(doc(admin, adminDataPath)))
  })
})

describe('consolidated authorization and repository queries', () => {
  it('repairs a legacy account with an existing role and no active mode', async () => {
    const legacyClientId = 'legacy-client-without-mode'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', legacyClientId), {
        name: 'Cliente Legado',
        email: 'legado@example.com',
        roles: ['client'],
      })
    })
    const legacyClient = testEnvironment
      .authenticatedContext(legacyClientId)
      .firestore()

    await assertSucceeds(
      updateDoc(doc(legacyClient, 'users', legacyClientId), {
        activeMode: 'client',
        professionalProfileStatus: 'not-started',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows onboarding to replace an orphaned legacy mode when roles are empty', async () => {
    const legacyOnboardingId = 'legacy-onboarding-with-orphaned-mode'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', legacyOnboardingId), {
        name: 'Cadastro Legado',
        email: 'cadastro-legado@example.com',
        roles: [],
        activeMode: 'professional',
        professionalProfileStatus: 'not-started',
      })
    })
    const legacyOnboarding = testEnvironment
      .authenticatedContext(legacyOnboardingId)
      .firestore()

    await assertSucceeds(
      updateDoc(doc(legacyOnboarding, 'users', legacyOnboardingId), {
        roles: ['client', 'professional'],
        activeMode: 'client',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows the first role setup but denies later role expansion without a grant', async () => {
    const onboardingUserId = 'first-onboarding-user'
    const existingClientId = 'existing-client-user'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore()
      await setDoc(doc(firestore, 'users', onboardingUserId), {
        name: 'Primeiro Acesso',
        email: 'primeiro@example.com',
        roles: [],
        activeMode: null,
        professionalProfileStatus: 'not-started',
      })
      await setDoc(doc(firestore, 'users', existingClientId), {
        name: 'Cliente Existente',
        email: 'cliente@example.com',
        roles: ['client'],
        activeMode: 'client',
        professionalProfileStatus: 'not-started',
      })
    })
    const onboarding = testEnvironment
      .authenticatedContext(onboardingUserId)
      .firestore()
    const existingClient = testEnvironment
      .authenticatedContext(existingClientId)
      .firestore()

    await assertSucceeds(
      updateDoc(doc(onboarding, 'users', onboardingUserId), {
        roles: ['client', 'professional'],
        activeMode: 'client',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(existingClient, 'users', existingClientId), {
        roles: ['client', 'professional'],
        activeMode: 'professional',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(onboarding, 'users', existingClientId), {
        activeMode: 'professional',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('executes the real ordered catalog queries but denies every web write', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore()
      await setDoc(doc(firestore, 'categories', 'repairs'), {
        name: 'Reparos',
        active: true,
        order: 20,
      })
      await setDoc(doc(firestore, 'categories', 'cleaning'), {
        name: 'Limpeza',
        active: true,
        order: 10,
      })
      await setDoc(doc(firestore, 'specialties', 'electrician'), {
        categoryId: 'repairs',
        name: 'Eletricista',
        active: true,
        order: 20,
      })
      await setDoc(doc(firestore, 'specialties', 'house-cleaning'), {
        categoryId: 'cleaning',
        name: 'Limpeza residencial',
        active: true,
        order: 10,
      })
      await setDoc(doc(firestore, 'adminAccess', 'catalog-admin'), {
        active: true,
        schemaVersion: 1,
      })
    })
    const visitor = testEnvironment.unauthenticatedContext().firestore()
    const admin = testEnvironment.authenticatedContext('catalog-admin').firestore()
    const categories = await assertSucceeds(
      getDocs(query(collection(visitor, 'categories'), orderBy('order', 'asc'))),
    )
    const specialties = await assertSucceeds(
      getDocs(
        query(collection(visitor, 'specialties'), orderBy('order', 'asc')),
      ),
    )

    expect(categories.docs.map((snapshot) => snapshot.id)).toEqual([
      'cleaning',
      'repairs',
    ])
    expect(specialties.docs.map((snapshot) => snapshot.id)).toEqual([
      'house-cleaning',
      'electrician',
    ])
    await assertFails(
      setDoc(doc(visitor, 'categories', 'malicious'), {
        name: 'Injetada',
        active: true,
        order: 0,
      }),
    )
    await assertFails(
      updateDoc(doc(admin, 'categories', 'repairs'), { active: false }),
    )
  })

  it('allows the operational list only to an active administrator', async () => {
    await seedProfiles()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'adminAccess', 'queue-admin'), {
        active: true,
        schemaVersion: 1,
      })
    })
    const admin = testEnvironment.authenticatedContext('queue-admin').firestore()
    const professional = testEnvironment.authenticatedContext(ownerId).firestore()
    const common = testEnvironment.authenticatedContext(otherUserId).firestore()
    const visitor = testEnvironment.unauthenticatedContext().firestore()

    await assertSucceeds(
      getDocs(collection(admin, 'professionalOperationalProfiles')),
    )
    await assertFails(
      getDocs(collection(professional, 'professionalOperationalProfiles')),
    )
    await assertFails(
      getDocs(collection(common, 'professionalOperationalProfiles')),
    )
    await assertFails(
      getDocs(collection(visitor, 'professionalOperationalProfiles')),
    )
  })

  it('keeps a dual-role account restricted to its own private documents', async () => {
    await seedProfiles()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore()
      await setDoc(doc(firestore, 'clientProfiles', ownerId), {
        ownerId,
        phone: '11999998888',
        profileImage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await setDoc(doc(firestore, 'clientProfiles', otherUserId), {
        ownerId: otherUserId,
        phone: '21999998888',
        profileImage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })
    const dual = testEnvironment.authenticatedContext(ownerId).firestore()

    await assertSucceeds(getDoc(doc(dual, 'clientProfiles', ownerId)))
    await assertSucceeds(
      getDoc(doc(dual, 'professionalPrivateProfiles', ownerId)),
    )
    await assertFails(getDoc(doc(dual, 'clientProfiles', otherUserId)))
    await assertFails(
      getDoc(doc(dual, 'professionalPrivateProfiles', otherUserId)),
    )
    await assertFails(
      updateDoc(doc(dual, 'professionalProfiles', ownerId), {
        ownerId: otherUserId,
        updatedAt: serverTimestamp(),
      }),
    )
  })
})
