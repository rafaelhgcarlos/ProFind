import { useCallback, useEffect, useState } from 'react'

import { listAvailableCatalog } from '../../services/catalog.service'
import type { ServiceCatalog } from '../../types/catalog'

type CatalogState =
  | { status: 'loading'; catalog: null; error: null }
  | { status: 'ready'; catalog: ServiceCatalog; error: null }
  | { status: 'error'; catalog: null; error: string }

const initialState: CatalogState = {
  status: 'loading',
  catalog: null,
  error: null,
}

export function useCatalog() {
  const [state, setState] = useState<CatalogState>(initialState)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    setState(initialState)
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    let active = true

    void listAvailableCatalog()
      .then((catalog) => {
        if (active) setState({ status: 'ready', catalog, error: null })
      })
      .catch(() => {
        if (active) {
          setState({
            status: 'error',
            catalog: null,
            error:
              'Não foi possível carregar as categorias agora. Verifique sua conexão e tente novamente.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [attempt])

  return { ...state, retry }
}
