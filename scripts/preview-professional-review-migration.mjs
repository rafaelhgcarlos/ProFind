import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildProfessionalReviewMigrationPlan } from './professional-review-migration-plan.mjs'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const inputPath = argument('--input')
const actorId = argument('--actor-id')

if (!inputPath || !actorId) {
  console.error(
    'Uso: node scripts/preview-professional-review-migration.mjs --input <export-local.json> --actor-id <uid-admin>',
  )
  process.exitCode = 1
} else {
  const source = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
  const plan = buildProfessionalReviewMigrationPlan({
    professionalProfiles: source.professionalProfiles ?? [],
    professionalOperationalProfiles:
      source.professionalOperationalProfiles ?? [],
    actorId,
  })
  console.log(JSON.stringify(plan, null, 2))
}
