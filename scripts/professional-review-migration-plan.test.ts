import { describe, expect, it } from 'vitest'

import { buildProfessionalReviewMigrationPlan } from './professional-review-migration-plan.mjs'

describe('professional review migration preview', () => {
  it('plans only missing documents in a safe draft without inferring approval', () => {
    const plan = buildProfessionalReviewMigrationPlan({
      professionalProfiles: [
        { id: 'legacy-published', data: { status: 'PUBLISHED' } },
        { id: 'already-versioned', data: { status: 'PUBLISHED' } },
      ],
      professionalOperationalProfiles: [{ id: 'already-versioned', data: {} }],
      actorId: 'admin-fixture',
    })

    expect(plan).toMatchObject({
      mode: 'PREVIEW_ONLY',
      summary: { profiles: 2, creates: 1, skipped: 1 },
    })
    expect(plan.creates[0]).toMatchObject({
      professionalId: 'legacy-published',
      operational: {
        reviewStatus: 'DRAFT',
        active: false,
        approvedVersion: null,
        submittedVersion: null,
      },
      event: { actorId: 'admin-fixture', actorRole: 'ADMIN' },
    })
  })

  it('is idempotent when the preview output is represented as existing state', () => {
    const first = buildProfessionalReviewMigrationPlan({
      professionalProfiles: [{ id: 'legacy-1', data: {} }],
      professionalOperationalProfiles: [],
      actorId: 'admin-fixture',
    })
    const second = buildProfessionalReviewMigrationPlan({
      professionalProfiles: [{ id: 'legacy-1', data: {} }],
      professionalOperationalProfiles: first.creates.map((item) => ({
        id: item.professionalId,
        data: item.operational,
      })),
      actorId: 'admin-fixture',
    })

    expect(second.summary).toMatchObject({ creates: 0, skipped: 1 })
  })
})
