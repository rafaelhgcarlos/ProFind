import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { loadEnv } from 'vite'

const bundleRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const environment = {
  ...loadEnv('production', process.cwd(), ''),
  ...process.env,
}
const expectedWorkerEndpoint = environment.VITE_IMAGEKIT_AUTH_ENDPOINT?.trim()
const expectedProjectId = environment.VITE_FIREBASE_PROJECT_ID?.trim()

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? files(path) : [path]
    }),
  )
  return nested.flat()
}

const forbidden = [
  'http://localhost:8787',
  'http://127.0.0.1:8787',
  'mock.local',
]
const bundleFiles = await files(bundleRoot)
if (!bundleFiles.includes(join(bundleRoot, 'index.html'))) {
  throw new Error('O artefato do Pages não contém index.html na raiz.')
}
if (bundleFiles.includes(join(bundleRoot, '404.html'))) {
  throw new Error(
    'O artefato contém 404.html na raiz e desativa o fallback SPA nativo do Pages.',
  )
}

let bundle = ''
for (const path of bundleFiles) {
  if (!new Set(['.html', '.js', '.css', '.map', '.json']).has(extname(path))) {
    continue
  }
  bundle += await readFile(path, 'utf8')
}

for (const value of forbidden) {
  if (bundle.includes(value)) {
    throw new Error(`Bundle de produção contém configuração proibida: ${value}`)
  }
}
if (!expectedWorkerEndpoint || !bundle.includes(expectedWorkerEndpoint)) {
  throw new Error(
    'O bundle não contém o VITE_IMAGEKIT_AUTH_ENDPOINT esperado para este build.',
  )
}
if (expectedProjectId !== 'profind-42bf7' || !bundle.includes(expectedProjectId)) {
  throw new Error('O bundle não está ligado ao projeto Firebase profind-42bf7.')
}

console.log('Bundle de produção validado: Firebase correto, Worker HTTPS e nenhum mock/localhost.')
