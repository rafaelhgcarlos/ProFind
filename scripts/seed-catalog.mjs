import { Firestore } from '@google-cloud/firestore'

const projectArgument = process.argv.find((argument) =>
  argument.startsWith('--project='),
)
const projectId = projectArgument?.slice('--project='.length).trim()

if (!projectId) {
  throw new Error(
    'Informe o projeto explicitamente: npm run seed:catalog -- --project=SEU_PROJECT_ID',
  )
}

const categories = [
  { id: 'construction', name: 'Construção Civil', active: true, order: 10 },
  { id: 'domestic-services', name: 'Serviços Domésticos', active: true, order: 20 },
]

const specialties = [
  { id: 'bricklayer', categoryId: 'construction', name: 'Pedreiro', active: true, order: 10 },
  { id: 'painter', categoryId: 'construction', name: 'Pintor', active: true, order: 20 },
  { id: 'electrician', categoryId: 'construction', name: 'Eletricista', active: true, order: 30 },
  { id: 'plumber', categoryId: 'construction', name: 'Encanador', active: true, order: 40 },
  { id: 'construction-other', categoryId: 'construction', name: 'Outros', active: true, order: 50 },
  { id: 'cleaner', categoryId: 'domestic-services', name: 'Diarista/Faxineiro', active: true, order: 10 },
  { id: 'gardener', categoryId: 'domestic-services', name: 'Jardineiro', active: true, order: 20 },
  { id: 'cook', categoryId: 'domestic-services', name: 'Cozinheiro', active: true, order: 30 },
  { id: 'domestic-services-other', categoryId: 'domestic-services', name: 'Outros', active: true, order: 40 },
]

const firestore = new Firestore({ projectId })
const batch = firestore.batch()

for (const { id, ...category } of categories) {
  batch.set(firestore.collection('categories').doc(id), category, { merge: true })
}

for (const { id, ...specialty } of specialties) {
  batch.set(firestore.collection('specialties').doc(id), specialty, { merge: true })
}

await batch.commit()

console.log(
  `Catálogo inicial gravado em ${projectId}: ${categories.length} categorias e ${specialties.length} especialidades.`,
)
