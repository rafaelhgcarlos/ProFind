import { describe, expect, it } from 'vitest'

import { parseFirebaseEnvironment } from './firebase-env'

const validEnvironment = {
  MODE: 'test',
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_APP_ID: 'test-app-id',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
}

describe('parseFirebaseEnvironment', () => {
  it('monta a configuração a partir das variáveis de ambiente', () => {
    expect(parseFirebaseEnvironment(validEnvironment)).toEqual({
      apiKey: 'test-api-key',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      appId: 'test-app-id',
      messagingSenderId: '123456789',
    })
  })

  it('inclui o measurement ID somente quando informado', () => {
    expect(
      parseFirebaseEnvironment({
        ...validEnvironment,
        VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST',
      }),
    ).toMatchObject({ measurementId: 'G-TEST' })
  })

  it('informa todas as variáveis ausentes e o ambiente', () => {
    expect(() =>
      parseFirebaseEnvironment({ MODE: 'development' }),
    ).toThrowError(
      /Configuração do Firebase ausente para o ambiente "development".*VITE_FIREBASE_API_KEY.*\.env\.example/,
    )
  })
})
