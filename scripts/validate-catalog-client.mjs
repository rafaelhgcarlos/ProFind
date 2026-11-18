import { readFile } from 'node:fs/promises'

import { deleteApp, initializeApp } from 'firebase/app'
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  terminate,
} from 'firebase/firestore'

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        const key = line.slice(0, separator)
        const value = line.slice(separator + 1).replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2')
        return [key, value]
      }),
  )
}

const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
const expectedProjectId = process.argv
  .find((argument) => argument.startsWith('--project='))
  ?.slice('--project='.length)

if (!expectedProjectId || env.VITE_FIREBASE_PROJECT_ID !== expectedProjectId) {
  throw new Error(
    `O projeto informado (${expectedProjectId ?? 'ausente'}) não coincide com .env (${env.VITE_FIREBASE_PROJECT_ID ?? 'ausente'}).`,
  )
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
})
const firestore = getFirestore(app)

try {
  const [categorySnapshot, specialtySnapshot] = await Promise.all([
    getDocs(query(collection(firestore, 'categories'), orderBy('order', 'asc'))),
    getDocs(query(collection(firestore, 'specialties'), orderBy('order', 'asc'))),
  ])
  const categories = categorySnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((category) => category.active)
  const activeCategoryIds = new Set(categories.map((category) => category.id))
  const specialties = specialtySnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter(
      (specialty) =>
        specialty.active && activeCategoryIds.has(specialty.categoryId),
    )

  const expectedCounts = new Map([
    ['construction', 5],
    ['domestic-services', 4],
  ])

  if (categories.length !== expectedCounts.size) {
    throw new Error(`Esperadas 2 categorias ativas; recebidas ${categories.length}.`)
  }

  console.log(`Consulta cliente pública validada em ${env.VITE_FIREBASE_PROJECT_ID}.`)
  for (const category of categories) {
    const linked = specialties.filter(
      (specialty) => specialty.categoryId === category.id,
    )
    const expectedCount = expectedCounts.get(category.id)
    if (linked.length !== expectedCount) {
      throw new Error(
        `${category.id}: esperadas ${expectedCount ?? 0} especialidades; recebidas ${linked.length}.`,
      )
    }
    console.log(`- ${category.name} (${category.id}): ${linked.length} especialidade(s)`)
  }
} finally {
  await terminate(firestore)
  await deleteApp(app)
}
