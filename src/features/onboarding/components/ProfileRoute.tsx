import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Skeleton } from '../../../components/ui/skeleton'
import { useAuth } from '../../auth/use-auth'
import { useProfile } from '../use-profile'

export function ProfileRoute() {
  const { logout } = useAuth()
  const { status, profileError, retryProfile } = useProfile()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : 'Não foi possível sair agora. Tente novamente.',
      )
      setIsLoggingOut(false)
    }
  }

  if (status === 'idle' || status === 'loading') {
    return (
      <AppShell>
        <section
          className="mx-auto min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-4xl px-4 py-12 sm:px-6 sm:py-20"
          role="status"
          aria-live="polite"
        >
          <span className="sr-only">Carregando seu perfil…</span>
          <div aria-hidden="true" className="mx-auto max-w-2xl space-y-5">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-11 w-4/5" />
            <Skeleton className="h-5 w-full" />
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          </div>
        </section>
      </AppShell>
    )
  }

  if (status === 'error') {
    return (
      <AppShell>
        <section className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-xl items-center px-4 py-16 sm:px-6">
          <Alert variant="destructive" className="w-full p-5 sm:p-6">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Não foi possível carregar seu perfil</AlertTitle>
            <AlertDescription>
              <p>{profileError}</p>
              {logoutError ? (
                <p className="mt-2 text-destructive">{logoutError}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void retryProfile()}>
                  Tentar novamente
                </Button>
                <Button
                  variant="ghost"
                  loading={isLoggingOut}
                  loadingLabel="Saindo…"
                  onClick={() => void handleLogout()}
                >
                  Sair da conta
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </section>
      </AppShell>
    )
  }

  return <Outlet />
}
