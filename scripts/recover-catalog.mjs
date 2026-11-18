import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

const projectArgument = process.argv.find((argument) =>
  argument.startsWith('--project='),
)
const projectId = projectArgument?.slice('--project='.length).trim()
const shouldApply = process.argv.includes('--apply')

if (!projectId) {
  throw new Error(
    'Informe o projeto explicitamente: node scripts/recover-catalog.mjs --project=SEU_PROJECT_ID [--apply]',
  )
}

if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
  throw new Error(`ID de projeto Firebase inválido: ${projectId}`)
}

// Catálogo original do seed introduzido pelo commit 9ad5ad3.
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

const fieldValidators = {
  name: (value) => typeof value === 'string' && value.trim().length > 0,
  active: (value) => typeof value === 'boolean',
  order: (value) => Number.isSafeInteger(value) && value >= 0,
  categoryId: (value) => typeof value === 'string' && value.trim().length > 0,
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return undefined
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('nullValue' in value) return null
  return undefined
}

function encodeValue(value) {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (Number.isSafeInteger(value)) return { integerValue: String(value) }
  throw new Error(`Valor de catálogo não suportado: ${String(value)}`)
}

function decodeDocument(document) {
  return {
    id: decodeURIComponent(document.name.slice(document.name.lastIndexOf('/') + 1)),
    name: document.name,
    updateTime: document.updateTime,
    fields: Object.fromEntries(
      Object.entries(document.fields ?? {}).map(([field, value]) => [
        field,
        decodeValue(value),
      ]),
    ),
  }
}

async function firebaseCliAccessToken() {
  const firebaseToolsEntry = require.resolve('firebase-tools')
  const firebaseToolsLib = path.dirname(firebaseToolsEntry)
  const cliAuth = require(path.join(firebaseToolsLib, 'auth.js'))
  const cliApi = require(path.join(firebaseToolsLib, 'apiv2.js'))
  const account =
    cliAuth.getProjectDefaultAccount(process.cwd()) ??
    cliAuth.getGlobalDefaultAccount()

  if (!account) {
    throw new Error('Nenhuma conta encontrada. Execute: npx firebase login')
  }

  cliAuth.setActiveAccount({}, account)
  return { token: await cliApi.getAccessToken(), email: account.user.email }
}

const { token, email } = await firebaseCliAccessToken()
const databasePath = `projects/${projectId}/databases/(default)`
const documentsUrl = `https://firestore.googleapis.com/v1/${databasePath}/documents`

async function firestoreRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = body.error?.message ?? response.statusText
    throw new Error(`Firestore respondeu ${response.status}: ${detail}`)
  }

  return body
}

async function listCollection(collectionId) {
  const documents = []
  let pageToken = ''

  do {
    const query = new URLSearchParams({ pageSize: '300' })
    if (pageToken) query.set('pageToken', pageToken)
    const body = await firestoreRequest(
      `${documentsUrl}/${collectionId}?${query.toString()}`,
    )
    documents.push(...(body.documents ?? []).map(decodeDocument))
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)

  return documents
}

function planCollection(collectionId, expectedItems, actualDocuments) {
  const actualById = new Map(actualDocuments.map((document) => [document.id, document]))
  const writes = []
  const report = []

  for (const expected of expectedItems) {
    const actual = actualById.get(expected.id)
    const expectedFields = Object.fromEntries(
      Object.entries(expected).filter(([field]) => field !== 'id'),
    )

    if (!actual) {
      const documentName = `${databasePath}/documents/${collectionId}/${expected.id}`
      writes.push({
        update: {
          name: documentName,
          fields: Object.fromEntries(
            Object.entries(expectedFields).map(([field, value]) => [
              field,
              encodeValue(value),
            ]),
          ),
        },
        currentDocument: { exists: false },
      })
      report.push({ id: expected.id, action: 'create', fields: Object.keys(expectedFields) })
      continue
    }

    const repairedFields = Object.fromEntries(
      Object.entries(expectedFields).filter(([field]) => {
        const validator = fieldValidators[field]
        return !validator(actual.fields[field])
      }),
    )

    if (Object.keys(repairedFields).length > 0) {
      writes.push({
        update: {
          name: actual.name,
          fields: Object.fromEntries(
            Object.entries(repairedFields).map(([field, value]) => [
              field,
              encodeValue(value),
            ]),
          ),
        },
        updateMask: { fieldPaths: Object.keys(repairedFields) },
        currentDocument: { updateTime: actual.updateTime },
      })
      report.push({
        id: expected.id,
        action: 'repair',
        fields: Object.keys(repairedFields),
      })
    } else {
      report.push({ id: expected.id, action: 'preserve', fields: [] })
    }
  }

  return {
    collectionId,
    actualDocuments,
    extraDocumentIds: actualDocuments
      .filter((document) => !expectedItems.some((item) => item.id === document.id))
      .map((document) => document.id),
    report,
    writes,
  }
}

function printPlan(plan) {
  console.log(`\n${plan.collectionId}: ${plan.actualDocuments.length} documento(s) encontrado(s).`)
  for (const item of plan.report) {
    const fields = item.fields.length > 0 ? ` [${item.fields.join(', ')}]` : ''
    console.log(`- ${item.id}: ${item.action}${fields}`)
  }
  if (plan.extraDocumentIds.length > 0) {
    console.log(`- documentos extras preservados: ${plan.extraDocumentIds.join(', ')}`)
  }
}

function validateCatalog(categoryDocuments, specialtyDocuments) {
  const categoriesById = new Map(categoryDocuments.map((item) => [item.id, item.fields]))
  const specialtiesById = new Map(specialtyDocuments.map((item) => [item.id, item.fields]))
  const errors = []

  for (const expected of categories) {
    const actual = categoriesById.get(expected.id)
    if (!actual) {
      errors.push(`categoria ausente: ${expected.id}`)
      continue
    }
    for (const field of ['name', 'active', 'order']) {
      if (!fieldValidators[field](actual[field])) {
        errors.push(`categoria ${expected.id} com ${field} inválido`)
      }
    }
    if (actual.active !== true) errors.push(`categoria original inativa: ${expected.id}`)
  }

  for (const expected of specialties) {
    const actual = specialtiesById.get(expected.id)
    if (!actual) {
      errors.push(`especialidade ausente: ${expected.id}`)
      continue
    }
    for (const field of ['categoryId', 'name', 'active', 'order']) {
      if (!fieldValidators[field](actual[field])) {
        errors.push(`especialidade ${expected.id} com ${field} inválido`)
      }
    }
    if (actual.categoryId !== expected.categoryId) {
      errors.push(
        `especialidade ${expected.id} ligada a ${actual.categoryId}, esperado ${expected.categoryId}`,
      )
    }
    if (actual.active !== true) {
      errors.push(`especialidade original inativa: ${expected.id}`)
    }
    if (categoriesById.get(actual.categoryId)?.active !== true) {
      errors.push(`especialidade ${expected.id} sem categoria ativa`)
    }
  }

  const activeCategories = categoryDocuments
    .filter(({ fields }) =>
      fieldValidators.name(fields.name) &&
      fields.active === true &&
      fieldValidators.order(fields.order),
    )
    .sort((left, right) => left.fields.order - right.fields.order)
  const activeCategoryIds = new Set(activeCategories.map(({ id }) => id))
  const availableSpecialties = specialtyDocuments
    .filter(({ fields }) =>
      fieldValidators.name(fields.name) &&
      fields.active === true &&
      fieldValidators.order(fields.order) &&
      activeCategoryIds.has(fields.categoryId),
    )
    .sort((left, right) => left.fields.order - right.fields.order)

  console.log('\nValidação do filtro da aplicação:')
  console.log(`- categorias ativas disponíveis: ${activeCategories.length}`)
  for (const category of activeCategories) {
    const linked = availableSpecialties.filter(
      ({ fields }) => fields.categoryId === category.id,
    )
    console.log(`- ${category.fields.name} (${category.id}): ${linked.length} especialidade(s)`)
  }

  return errors
}

console.log(`Projeto Firebase confirmado: ${projectId}`)
console.log(`Conta autenticada: ${email}`)
console.log(`Modo: ${shouldApply ? 'RECUPERAÇÃO' : 'DIAGNÓSTICO (sem escrita)'}`)

const [categoryDocuments, specialtyDocuments] = await Promise.all([
  listCollection('categories'),
  listCollection('specialties'),
])
const categoryPlan = planCollection('categories', categories, categoryDocuments)
const specialtyPlan = planCollection('specialties', specialties, specialtyDocuments)
const plans = [categoryPlan, specialtyPlan]

for (const plan of plans) printPlan(plan)

const writes = plans.flatMap((plan) => plan.writes)
console.log(`\nOperações necessárias: ${writes.length}`)

if (shouldApply && writes.length > 0) {
  await firestoreRequest(
    `https://firestore.googleapis.com/v1/${databasePath}/documents:commit`,
    { method: 'POST', body: JSON.stringify({ writes }) },
  )
  console.log(`Recuperação atômica concluída: ${writes.length} documento(s) criado(s) ou reparado(s).`)
} else if (shouldApply) {
  console.log('Nenhuma escrita necessária; o catálogo já estava íntegro.')
} else if (writes.length > 0) {
  console.log('Nenhuma escrita realizada. Repita com --apply após revisar o diagnóstico.')
}

const [finalCategories, finalSpecialties] = shouldApply
  ? await Promise.all([listCollection('categories'), listCollection('specialties')])
  : [categoryDocuments, specialtyDocuments]
const validationErrors = validateCatalog(finalCategories, finalSpecialties)

if (validationErrors.length > 0) {
  console.error('\nFalhas de validação:')
  for (const error of validationErrors) console.error(`- ${error}`)
  process.exitCode = 2
} else {
  console.log('\nCatálogo original íntegro e relacionamentos validados.')
}
