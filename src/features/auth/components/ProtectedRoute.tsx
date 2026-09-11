import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { useAuth } from '../use-auth'

export function ProtectedRoute() {
  const { status, sessionError, retrySession } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <AppShell>
        <div className="flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] items-center justify-center px-4 py-16" role="status" aria-live="polite">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
            Verificando sua sessão…
          </div>
        </div>
      </AppShell>
    )
  }

  if (status === 'error') {
    return (
      <AppShell>
        <section className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-xl items-center px-4 py-16 sm:px-6">
          <Alert variant="destructive" className="w-full p-5 sm:p-6">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Não foi possível verificar sua sessão</AlertTitle>
            <AlertDescription>
              <p>{sessionError}</p>
              <Button className="mt-4" variant="outline" onClick={() => void retrySession()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        </section>
      </AppShell>
    )
  }

  if (status === 'unauthenticated') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/entrar" replace state={{ from, notice: sessionError }} />
  }

  return <Outlet />
}
