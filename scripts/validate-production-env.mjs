import process from 'node:process'

import { loadEnv } from 'vite'

const environment = {
  ...loadEnv('production', process.cwd(), ''),
  ...process.env,
}
const errors = []

function read(key) {
  return typeof environment[key] === 'string' ? environment[key].trim() : ''
}

function httpsUrl(key, expectedPath) {
  const value = read(key)
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') {
      errors.push(`${key} deve usar HTTPS.`)
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      errors.push(`${key} não pode apontar para localhost em produção.`)
    }
    if (expectedPath && url.pathname !== expectedPath) {
      errors.push(`${key} deve terminar em ${expectedPath}.`)
    }
    return url
  } catch {
    errors.push(`${key} deve ser uma URL HTTPS válida.`)
    return null
  }
}

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_IMAGEKIT_PUBLIC_KEY',
  'VITE_IMAGEKIT_URL_ENDPOINT',
  'VITE_IMAGEKIT_AUTH_ENDPOINT',
  'VITE_SUPPORT_WHATSAPP_NUMBER',
]
for (const key of required) {
  if (!read(key)) errors.push(`${key} é obrigatória no ambiente Production do Pages.`)
}

if (read('VITE_FIREBASE_PROJECT_ID') !== 'profind-42bf7') {
  errors.push('VITE_FIREBASE_PROJECT_ID deve ser profind-42bf7 nesta publicação.')
}
if (read('VITE_FIREBASE_AUTH_DOMAIN') !== 'profind-42bf7.firebaseapp.com') {
  errors.push('VITE_FIREBASE_AUTH_DOMAIN deve ser profind-42bf7.firebaseapp.com.')
}
if (read('VITE_IMAGE_PROVIDER') !== 'imagekit') {
  errors.push('VITE_IMAGE_PROVIDER deve ser imagekit no build hospedado.')
}

const imageKitUrl = httpsUrl('VITE_IMAGEKIT_URL_ENDPOINT')
const workerUrl = httpsUrl(
  'VITE_IMAGEKIT_AUTH_ENDPOINT',
  '/api/imagekit/auth',
)

for (const [key, value] of Object.entries(environment)) {
  if (
    key.startsWith('VITE_') &&
    /(PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN_SDK|CLIENT_SECRET)/.test(key) &&
    typeof value === 'string' &&
    value.trim()
  ) {
    errors.push(`${key} não pode ser exposta ao frontend.`)
  }
}

if (errors.length > 0) {
  throw new Error(`Ambiente de produção inválido:\n- ${errors.join('\n- ')}`)
}

console.log('Ambiente de produção validado para o projeto Firebase profind-42bf7.')
console.log(`ImageKit: ${imageKitUrl.origin}`)
console.log(`Worker de imagens: ${workerUrl.origin}`)
