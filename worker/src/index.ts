import ImageKit from '@imagekit/nodejs'
import {
  SignJWT,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose'

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
)
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024
const UPLOAD_CHECKS =
  "'file.size' <= '5MB' AND 'file.mime' IN ['image/jpeg','image/png','image/webp']"
const UPLOAD_TOKEN_SECONDS = 5 * 60
const DELETION_GRANT_SECONDS = 15 * 60

export type ImagePurpose =
  | 'CLIENT_AVATAR'
  | 'PROFESSIONAL_AVATAR'
  | 'PROFESSIONAL_PORTFOLIO'

export interface Env {
  IMAGEKIT_PRIVATE_KEY: string
  IMAGEKIT_PUBLIC_KEY: string
  FIREBASE_PROJECT_ID: string
  ALLOWED_ORIGINS?: string
}

interface WorkerDependencies {
  verifyFirebaseToken(token: string, projectId: string): Promise<JWTPayload>
  deleteImage(privateKey: string, providerId: string): Promise<void>
  fetcher: typeof fetch
  now(): number
  randomUUID(): string
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? corsHeaders(origin) : {}),
    },
  })
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    Vary: 'Origin',
  }
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  try {
    const url = new URL(origin)
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return origin
    }
  } catch {
    return null
  }
  const configured = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return configured.includes(origin) ? origin : null
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? ''
  const match = authorization.match(/^Bearer ([^\s]+)$/)
  return match?.[1] ?? ''
}

function isPurpose(value: unknown): value is ImagePurpose {
  return (
    value === 'CLIENT_AVATAR' ||
    value === 'PROFESSIONAL_AVATAR' ||
    value === 'PROFESSIONAL_PORTFOLIO'
  )
}

function folderFor(uid: string, purpose: ImagePurpose) {
  const owner = encodeURIComponent(uid)
  switch (purpose) {
    case 'CLIENT_AVATAR':
      return `/profind/users/${owner}/client-avatar`
    case 'PROFESSIONAL_AVATAR':
      return `/profind/professionals/${owner}/avatar`
    case 'PROFESSIONAL_PORTFOLIO':
      return `/profind/professionals/${owner}/portfolio`
  }
}

function prefixFor(purpose: ImagePurpose) {
  switch (purpose) {
    case 'CLIENT_AVATAR':
      return 'client-avatar'
    case 'PROFESSIONAL_AVATAR':
      return 'professional-avatar'
    case 'PROFESSIONAL_PORTFOLIO':
      return 'portfolio'
  }
}

function transformationFor(purpose: ImagePurpose) {
  return JSON.stringify({
    pre:
      purpose === 'PROFESSIONAL_PORTFOLIO'
        ? 'w-1920,h-1920,c-at_max,q-82,f-webp,rt-auto'
        : 'w-512,h-512,c-at_max,q-80,f-webp,rt-auto',
  })
}

function secretKey(value: string) {
  return new TextEncoder().encode(value)
}

async function signUploadPayload(
  uploadPayload: Record<string, string>,
  env: Env,
  dependencies: WorkerDependencies,
) {
  const now = Math.floor(dependencies.now() / 1000)
  return new SignJWT(uploadPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: env.IMAGEKIT_PUBLIC_KEY })
    .setIssuedAt(now)
    .setExpirationTime(now + UPLOAD_TOKEN_SECONDS)
    .setJti(dependencies.randomUUID())
    .sign(secretKey(env.IMAGEKIT_PRIVATE_KEY))
}

async function signDeletionGrant(
  uid: string,
  purpose: ImagePurpose,
  providerId: string,
  env: Env,
  dependencies: WorkerDependencies,
) {
  const now = Math.floor(dependencies.now() / 1000)
  return new SignJWT({ purpose, providerId, scope: 'imagekit:delete' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(uid)
    .setIssuer('profind-image-worker')
    .setAudience('profind-image-delete')
    .setIssuedAt(now)
    .setExpirationTime(now + DELETION_GRANT_SECONDS)
    .setJti(dependencies.randomUUID())
    .sign(secretKey(env.IMAGEKIT_PRIVATE_KEY))
}

async function validDeletionGrant(
  grant: string,
  uid: string,
  purpose: ImagePurpose,
  providerId: string,
  env: Env,
) {
  try {
    const { payload } = await jwtVerify(grant, secretKey(env.IMAGEKIT_PRIVATE_KEY), {
      algorithms: ['HS256'],
      issuer: 'profind-image-worker',
      audience: 'profind-image-delete',
      subject: uid,
    })
    return (
      payload.scope === 'imagekit:delete' &&
      payload.purpose === purpose &&
      payload.providerId === providerId
    )
  } catch {
    return false
  }
}

type FirestoreFields = Record<string, FirestoreValue>
interface FirestoreValue {
  stringValue?: string
  mapValue?: { fields?: FirestoreFields }
  arrayValue?: { values?: FirestoreValue[] }
}

function imageMatches(
  value: FirestoreValue | undefined,
  uid: string,
  purpose: ImagePurpose,
  providerId: string,
) {
  const fields = value?.mapValue?.fields
  return Boolean(
    fields &&
      fields.provider?.stringValue === 'IMAGEKIT' &&
      fields.ownerId?.stringValue === uid &&
      fields.purpose?.stringValue === purpose &&
      fields.providerId?.stringValue === providerId,
  )
}

async function persistedReferenceMatches(
  uid: string,
  purpose: ImagePurpose,
  providerId: string,
  idToken: string,
  env: Env,
  dependencies: WorkerDependencies,
) {
  const collection =
    purpose === 'CLIENT_AVATAR' ? 'clientProfiles' : 'professionalProfiles'
  const documentUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}` +
    `/databases/(default)/documents/${collection}/${encodeURIComponent(uid)}`
  const response = await dependencies.fetcher(documentUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (!response.ok) return false
  const document = (await response.json()) as { fields?: FirestoreFields }
  if (purpose !== 'PROFESSIONAL_PORTFOLIO') {
    return imageMatches(document.fields?.profileImage, uid, purpose, providerId)
  }
  return Boolean(
    document.fields?.portfolioImages?.arrayValue?.values?.some((value) =>
      imageMatches(value, uid, purpose, providerId),
    ),
  )
}

async function authenticate(
  request: Request,
  env: Env,
  dependencies: WorkerDependencies,
) {
  const origin = allowedOrigin(request, env)
  if (request.headers.has('Origin') && !origin) {
    return json({ error: 'origin-not-allowed' }, 403, null)
  }
  const idToken = bearerToken(request)
  if (!idToken) return json({ error: 'authentication-required' }, 401, origin)

  let identity: JWTPayload
  try {
    identity = await dependencies.verifyFirebaseToken(
      idToken,
      env.FIREBASE_PROJECT_ID,
    )
  } catch {
    return json({ error: 'invalid-authentication' }, 401, origin)
  }
  const uid = identity.sub
  if (!uid || !env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_PUBLIC_KEY) {
    return json({ error: 'provider-not-configured' }, 503, origin)
  }

  let input: Record<string, unknown>
  try {
    input = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid-request' }, 400, origin)
  }
  if (
    !isPurpose(input.purpose) ||
    typeof input.fileName !== 'string' ||
    typeof input.fileType !== 'string' ||
    !ACCEPTED_TYPES.has(input.fileType) ||
    typeof input.fileSize !== 'number' ||
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > MAX_FILE_SIZE ||
    input.publicKey !== env.IMAGEKIT_PUBLIC_KEY
  ) {
    return json({ error: 'invalid-upload' }, 400, origin)
  }

  const purpose = input.purpose
  const uploadPayload = {
    fileName: `${prefixFor(purpose)}-${dependencies.randomUUID()}.webp`,
    folder: folderFor(uid, purpose),
    useUniqueFileName: 'true',
    checks: UPLOAD_CHECKS,
    transformation: transformationFor(purpose),
  }
  const response: Record<string, unknown> = {
    token: await signUploadPayload(uploadPayload, env, dependencies),
    uploadPayload,
  }

  if (typeof input.previousProviderId === 'string') {
    const matches = await persistedReferenceMatches(
      uid,
      purpose,
      input.previousProviderId,
      idToken,
      env,
      dependencies,
    )
    if (!matches) return json({ error: 'scope-mismatch' }, 403, origin)
    response.deletionProviderId = input.previousProviderId
    response.deletionGrant = await signDeletionGrant(
      uid,
      purpose,
      input.previousProviderId,
      env,
      dependencies,
    )
  }

  return json(response, 200, origin)
}

async function remove(
  request: Request,
  providerId: string,
  env: Env,
  dependencies: WorkerDependencies,
) {
  const origin = allowedOrigin(request, env)
  if (request.headers.has('Origin') && !origin) {
    return json({ error: 'origin-not-allowed' }, 403, null)
  }
  const idToken = bearerToken(request)
  if (!idToken) return json({ error: 'authentication-required' }, 401, origin)

  let identity: JWTPayload
  try {
    identity = await dependencies.verifyFirebaseToken(
      idToken,
      env.FIREBASE_PROJECT_ID,
    )
  } catch {
    return json({ error: 'invalid-authentication' }, 401, origin)
  }
  const uid = identity.sub
  if (!uid || !env.IMAGEKIT_PRIVATE_KEY) {
    return json({ error: 'provider-not-configured' }, 503, origin)
  }

  let input: Record<string, unknown>
  try {
    input = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid-request' }, 400, origin)
  }
  if (!isPurpose(input.purpose) || !providerId) {
    return json({ error: 'invalid-request' }, 400, origin)
  }

  const preauthorized =
    typeof input.deletionGrant === 'string' &&
    (await validDeletionGrant(
      input.deletionGrant,
      uid,
      input.purpose,
      providerId,
      env,
    ))
  const persisted = preauthorized
    ? true
    : await persistedReferenceMatches(
        uid,
        input.purpose,
        providerId,
        idToken,
        env,
        dependencies,
      )
  if (!persisted) return json({ error: 'scope-mismatch' }, 403, origin)

  try {
    await dependencies.deleteImage(env.IMAGEKIT_PRIVATE_KEY, providerId)
    return new Response(null, {
      status: 204,
      headers: origin ? corsHeaders(origin) : undefined,
    })
  } catch {
    return json({ error: 'provider-error' }, 502, origin)
  }
}

const defaultDependencies: WorkerDependencies = {
  async verifyFirebaseToken(token, projectId) {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    })
    if (!payload.sub || payload.sub.length > 128 || !payload.auth_time) {
      throw new Error('Invalid Firebase ID token.')
    }
    return payload
  },
  async deleteImage(privateKey, providerId) {
    const imageKit = new ImageKit({ privateKey })
    await imageKit.files.delete(providerId)
  },
  fetcher: fetch,
  now: Date.now,
  randomUUID: () => crypto.randomUUID(),
}

export function createImageKitWorker(
  overrides: Partial<WorkerDependencies> = {},
): ExportedHandler<Env> {
  const dependencies = { ...defaultDependencies, ...overrides }
  return {
    async fetch(request, env) {
      const url = new URL(request.url)
      const origin = allowedOrigin(request, env)
      if (request.method === 'OPTIONS') {
        return request.headers.has('Origin') && !origin
          ? new Response(null, { status: 403 })
          : new Response(null, {
              status: 204,
              headers: origin ? corsHeaders(origin) : undefined,
            })
      }
      if (request.method === 'POST' && url.pathname === '/api/imagekit/auth') {
        return authenticate(request, env, dependencies)
      }
      const deletion = url.pathname.match(/^\/api\/imagekit\/files\/([^/]+)$/)
      if (request.method === 'DELETE' && deletion) {
        return remove(
          request,
          decodeURIComponent(deletion[1]),
          env,
          dependencies,
        )
      }
      return json({ error: 'not-found' }, 404, origin)
    },
  }
}

export default createImageKitWorker()
