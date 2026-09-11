import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Elemento raiz da aplicação não encontrado.')
}

const appRoot = rootElement

async function bootstrap() {
  const { initializeFirebase } = await import('./lib/firebase')
  initializeFirebase()

  createRoot(appRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
