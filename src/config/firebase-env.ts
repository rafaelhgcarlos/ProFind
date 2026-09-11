export interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  messagingSenderId: string
  measurementId?: string
}

type Environment = Record<string, unknown>

const requiredVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
] as const

function readString(environment: Environment, key: string) {
  const value = environment[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function parseFirebaseEnvironment(
  environment: Environment,
): FirebaseClientConfig {
  const missingVariables = requiredVariables.filter(
    (key) => !readString(environment, key),
  )

  if (missingVariables.length > 0) {
    const mode = readString(environment, 'MODE') || 'desconhecido'

    throw new Error(
      `Configuração do Firebase ausente para o ambiente "${mode}": ${missingVariables.join(', ')}. ` +
        'Defina as variáveis conforme o arquivo .env.example.',
    )
  }

  const measurementId = readString(
    environment,
    'VITE_FIREBASE_MEASUREMENT_ID',
  )

  return {
    apiKey: readString(environment, 'VITE_FIREBASE_API_KEY'),
    authDomain: readString(environment, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readString(environment, 'VITE_FIREBASE_PROJECT_ID'),
    appId: readString(environment, 'VITE_FIREBASE_APP_ID'),
    messagingSenderId: readString(
      environment,
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
    ),
    ...(measurementId ? { measurementId } : {}),
  }
}

export function getFirebaseClientConfig() {
  return parseFirebaseEnvironment(import.meta.env)
}
