export function buildProfessionalReviewMigrationPlan({
  professionalProfiles,
  professionalOperationalProfiles,
  actorId,
}) {
  if (!actorId || typeof actorId !== 'string') {
    throw new Error('Informe o UID real do administrador responsável pela futura execução.')
  }

  const existing = new Set(
    professionalOperationalProfiles.map((document) => document.id),
  )
  const creates = []
  const skipped = []

  for (const profile of professionalProfiles) {
    if (!profile?.id || typeof profile.id !== 'string') continue
    if (existing.has(profile.id)) {
      skipped.push({ professionalId: profile.id, reason: 'operational-review-exists' })
      continue
    }

    const eventId = 'review-1'
    creates.push({
      professionalId: profile.id,
      operationalPath: `professionalOperationalProfiles/${profile.id}`,
      operational: {
        schemaVersion: 1,
        professionalId: profile.id,
        reviewStatus: 'DRAFT',
        active: false,
        profileVersion: 1,
        submittedVersion: null,
        approvedVersion: null,
        revision: 1,
        lastEventId: eventId,
        professionalFeedback: null,
        approvedCategoryIds: [],
        approvedSpecialtyIds: [],
        approvedBaseCityIbgeCode: '',
        approvedSelectedCityIbgeCodes: [],
        eligibleCityIbgeCodes: [],
        updatedAt: { serverTimestamp: true },
      },
      eventPath: `professionalOperationalProfiles/${profile.id}/events/${eventId}`,
      event: {
        eventId,
        entityType: 'PROFESSIONAL',
        entityId: profile.id,
        professionalId: profile.id,
        actorId,
        actorRole: 'ADMIN',
        action: 'PROFILE_UPDATED',
        reasonCode: 'PROFILE_DATA_CHANGED',
        fromStatus: 'DRAFT',
        toStatus: 'DRAFT',
        profileVersion: 1,
        reviewedVersion: null,
        reason: null,
        createdAt: { serverTimestamp: true },
      },
    })
  }

  return {
    mode: 'PREVIEW_ONLY',
    summary: {
      profiles: professionalProfiles.length,
      creates: creates.length,
      skipped: skipped.length,
    },
    creates,
    skipped,
  }
}
