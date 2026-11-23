import { Firestore } from '@google-cloud/firestore'

const projectArgument = process.argv.find((argument) =>
  argument.startsWith('--project='),
)
const projectId = projectArgument?.slice('--project='.length).trim()
const dryRun = process.argv.includes('--dry-run')
const mergeExisting = process.argv.includes('--merge-existing')

if (!projectId) {
  throw new Error(
    'Informe o projeto explicitamente: npm run seed:catalog -- --project=SEU_PROJECT_ID',
  )
}

const categories = [
  { id: 'construction', name: 'Construção e manutenção', active: true, order: 10 },
  { id: 'domestic-services', name: 'Serviços residenciais', active: true, order: 20 },
]

const specialties = [
  { id: 'bricklayer', categoryId: 'construction', name: 'Pedreiro', active: true, order: 10 },
  { id: 'painter', categoryId: 'construction', name: 'Pintor', active: true, order: 20 },
  { id: 'electrician', categoryId: 'construction', name: 'Eletricista', active: true, order: 30 },
  { id: 'plumber', categoryId: 'construction', name: 'Encanador', active: true, order: 40 },
  { id: 'construction-other', categoryId: 'construction', name: 'Outros', active: true, order: 50 },
  { id: 'cleaner', categoryId: 'domestic-services', name: 'Diarista', active: true, order: 10 },
  { id: 'gardener', categoryId: 'domestic-services', name: 'Jardineiro', active: true, order: 20 },
  { id: 'cook', categoryId: 'domestic-services', name: 'Cozinheiro', active: true, order: 30 },
  { id: 'domestic-services-other', categoryId: 'domestic-services', name: 'Outros', active: true, order: 40 },
]

const firestore = new Firestore({ projectId })
const entries = [
  ...categories.map(({ id, ...data }) => ({
    ref: firestore.collection('categories').doc(id),
    data,
  })),
  ...specialties.map(({ id, ...data }) => ({
    ref: firestore.collection('specialties').doc(id),
    data,
  })),
]
const snapshots = await firestore.getAll(...entries.map(({ ref }) => ref))
const missing = entries.filter((_, index) => !snapshots[index].exists)
const existing = entries.filter((_, index) => snapshots[index].exists)

if (dryRun) {
  console.log(
    `Prévia do catálogo em ${projectId}: ${missing.length} ausente(s), ` +
      `${existing.length} preservado(s), nenhuma escrita executada.`,
  )
  process.exit(0)
}

const batch = firestore.batch()
for (const { ref, data } of mergeExisting ? entries : missing) {
  if (mergeExisting) batch.set(ref, data, { merge: true })
  else batch.create(ref, data)
}

await batch.commit()

console.log(
  mergeExisting
    ? `Catálogo atualizado explicitamente em ${projectId}: ${entries.length} documento(s).`
    : `Catálogo preparado em ${projectId}: ${missing.length} criado(s), ` +
        `${existing.length} existente(s) preservado(s).`,
)
