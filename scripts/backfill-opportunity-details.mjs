import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const firebaseAuth = require('../node_modules/firebase-tools/lib/auth.js')

function argument(name) {
  const prefix = `${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function positiveLimit(value) {
  const parsed = Number(value ?? 100)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error('Use --limit entre 1 e 500.')
  }
  return parsed
}

function isSafeDescription(value) {
  return (
    typeof value === 'string' &&
    value.length >= 10 &&
    value.length <= 1000 &&
    !/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/i.test(value) &&
    !/(?:https?:\/\/|www\.)\S+/i.test(value) &&
    !/(?:\d[\s().+-]*){10,}/.test(value) &&
    !/\b\d{5}-?\d{3}\b/.test(value)
  )
}

function projection(requestId, summary, privateData) {
  const address = privateData.address
  if (
    !summary ||
    summary.status !== 'OPEN' ||
    typeof summary.categoryId !== 'string' ||
    typeof summary.specialtyId !== 'string' ||
    typeof summary.cityIbgeCode !== 'string' ||
    typeof summary.serviceDate !== 'string' ||
    !['MORNING', 'AFTERNOON', 'EVENING'].includes(summary.period) ||
    !Number.isSafeInteger(summary.round) ||
    !address ||
    typeof address.city !== 'string' ||
    !address.city.trim() ||
    typeof address.stateCode !== 'string' ||
    !/^[A-Z]{2}$/.test(address.stateCode) ||
    address.ibgeCode !== summary.cityIbgeCode ||
    privateData.requestId !== requestId ||
    privateData.clientId !== summary.clientId ||
    !isSafeDescription(privateData.notes) ||
    !privateData.createdAt
  ) {
    return null
  }

  return {
    requestId,
    categoryId: summary.categoryId,
    specialtyId: summary.specialtyId,
    cityIbgeCode: summary.cityIbgeCode,
    city: address.city.trim(),
    stateCode: address.stateCode,
    serviceDate: summary.serviceDate,
    period: summary.period,
    round: summary.round,
    description: privateData.notes,
    createdAt: privateData.createdAt,
  }
}

function decodeValue(value) {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return new Date(value.timestampValue)
  if ('stringValue' in value) return value.stringValue
  if ('referenceValue' in value) return value.referenceValue
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(decodeValue)
  }
  if ('mapValue' in value) {
    return decodeFields(value.mapValue.fields ?? {})
  }
  throw new Error('Tipo de campo Firestore nÃ£o suportado pelo backfill.')
}

function decodeFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  )
}

function encodeValue(value) {
  if (value === null) return { nullValue: null }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } }
  }
  if (value && typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } }
  }
  throw new Error('Valor nÃ£o suportado pelo backfill.')
}

function encodeFields(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeValue(value)]),
  )
}

const projectId = argument('--project')
const confirmedProject = argument('--confirm-project')
const requestId = argument('--request-id')
const limit = positiveLimit(argument('--limit'))
const apply = process.argv.includes('--apply')

if (!projectId) {
  throw new Error(
    'Informe --project=ID. A execuÃ§Ã£o padrÃ£o Ã© somente de prÃ©via.',
  )
}
if (apply && confirmedProject !== projectId) {
  throw new Error(
    'Para aplicar, informe --apply --confirm-project com o mesmo ID de --project.',
  )
}

const account = firebaseAuth.getGlobalDefaultAccount()
if (!account?.tokens?.refresh_token) {
  throw new Error('Nenhuma sessÃ£o vÃ¡lida do Firebase CLI foi encontrada.')
}
const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [])
if (!token?.access_token) {
  throw new Error('NÃ£o foi possÃ­vel obter uma credencial temporÃ¡ria do Firebase CLI.')
}

const databaseRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`

async function firestoreRequest(path, options = {}) {
  const response = await fetch(`${databaseRoot}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (options.allowNotFound && response.status === 404) return null
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    const detail = result?.error?.message ? `: ${result.error.message}` : ''
    throw new Error(`Firestore respondeu ${response.status}${detail}`)
  }
  return response.json()
}

async function getDocument(collection, id) {
  const document = await firestoreRequest(
    `/documents/${collection}/${encodeURIComponent(id)}`,
    { allowNotFound: true },
  )
  if (!document) return null
  return { id, data: decodeFields(document.fields ?? {}) }
}

async function listOpenRequests() {
  if (requestId) {
    const document = await getDocument('serviceRequests', requestId)
    return document ? [document] : [{ id: requestId, data: null }]
  }
  const response = await firestoreRequest('/documents:runQuery', {
    method: 'POST',
    body: {
      structuredQuery: {
        from: [{ collectionId: 'serviceRequests' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'OPEN' },
          },
        },
        limit,
      },
    },
  })
  return response
    .filter((entry) => entry.document)
    .map((entry) => ({
      id: entry.document.name.split('/').at(-1),
      data: decodeFields(entry.document.fields ?? {}),
    }))
}

const requests = await listOpenRequests()
const missing = []
const invalid = []
let existing = 0

for (const request of requests) {
  if (!request.data) {
    invalid.push({ requestId: request.id, reason: 'request-not-found' })
    continue
  }
  const [privateDocument, detailsDocument] = await Promise.all([
    getDocument('serviceRequestPrivate', request.id),
    getDocument('serviceRequestOpportunityDetails', request.id),
  ])
  if (detailsDocument) {
    existing += 1
    continue
  }
  if (!privateDocument) {
    invalid.push({ requestId: request.id, reason: 'private-not-found' })
    continue
  }
  const data = projection(request.id, request.data, privateDocument.data)
  if (!data) {
    invalid.push({ requestId: request.id, reason: 'unsafe-or-inconsistent' })
    continue
  }
  missing.push({ requestId: request.id, data })
}

console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'preview',
      projectId,
      scanned: requests.length,
      existing,
      ready: missing.map(({ requestId: id }) => id),
      invalid,
      limited: !requestId && requests.length === limit,
    },
    null,
    2,
  ),
)

if (apply && missing.length > 0) {
  await firestoreRequest('/documents:commit', {
    method: 'POST',
    body: {
      writes: missing.map((item) => ({
        update: {
          name: `projects/${projectId}/databases/(default)/documents/serviceRequestOpportunityDetails/${item.requestId}`,
          fields: encodeFields(item.data),
        },
        updateTransforms: [
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      })),
    },
  })
  console.log(`Backfill concluÃ­do: ${missing.length} projeÃ§Ã£o(Ãµes) criada(s).`)
}

