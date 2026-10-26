import { AlertTriangle, LoaderCircle, ShieldX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { adminAccessService } from '../../../services/admin-access.service'
import { useAuth } from '../../auth/use-auth'

type AdminAccessStatus = 'loading' | 'authorized' | 'denied' | 'error'

interface AdminAccessState {
  userId: string | null
  status: AdminAccessStatus
}

function AdminAccessLoading() {
  return (
    <AppShell showAccountLinks={false}>
      <div
        className="flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] items-center justify-center px-4 py-16"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
          Verificando sua autorização administrativa…
        </div>
      </div>
    </AppShell>
  )
}

interface AdminAccessErrorProps {
  retrying: boolean
  onRetry(): void
}

function AdminAccessError({ retrying, onRetry }: AdminAccessErrorProps) {
  return (
    <AppShell showAccountLinks={false}>
      <section className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-xl items-center px-4 py-16 sm:px-6">
        <Alert variant="destructive" className="w-full p-5 sm:p-6">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Não foi possível confirmar seu acesso</AlertTitle>
          <AlertDescription>
            <p>
              A consulta da autorização administrativa falhou. Nenhum dado do painel foi liberado.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              loading={retrying}
              loadingLabel="Verificando…"
              disabled={retrying}
              onClick={onRetry}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    </AppShell>
  )
}

function AdminAccessDenied() {
  return (
    <AppShell showAccountLinks={false}>
      <section className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-xl items-center px-4 py-16 sm:px-6">
        <Alert className="w-full p-5 sm:p-6">
          <ShieldX aria-hidden="true" />
          <AlertTitle>Acesso administrativo não autorizado</AlertTitle>
          <AlertDescription>
            <p>
              Esta conta não possui uma credencial administrativa ativa. Se o acesso foi revogado, saia da conta ou retorne à sua área habitual.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link to="/conta">Voltar para minha conta</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    </AppShell>
  )
}

export function AdminAccessRoute() {
  const { status: authenticationStatus, user, retrySession } = useAuth()
  const [access, setAccess] = useState<AdminAccessState>({
    userId: null,
    status: 'loading',
  })
  const [retrySequence, setRetrySequence] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const userId = user?.uid

  useEffect(() => {
    if (authenticationStatus !== 'authenticated' || !userId) {
      return
    }

    let active = true
    const unsubscribe = adminAccessService.observeAuthorization(
      userId,
      ({ authorized }) => {
        if (active) {
          setAccess({
            userId,
            status: authorized ? 'authorized' : 'denied',
          })
        }
      },
      () => {
        if (active) setAccess({ userId, status: 'error' })
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [authenticationStatus, retrySequence, userId])

  async function handleRetry() {
    if (retrying) return
    setRetrying(true)
    setAccess({ userId: null, status: 'loading' })
    try {
      await retrySession()
      setRetrySequence((current) => current + 1)
    } finally {
      setRetrying(false)
    }
  }

  const accessStatus = access.userId === userId ? access.status : 'loading'

  if (accessStatus === 'loading') return <AdminAccessLoading />
  if (accessStatus === 'error') {
    return <AdminAccessError retrying={retrying} onRetry={() => void handleRetry()} />
  }
  if (accessStatus === 'denied') return <AdminAccessDenied />

  return <Outlet />
}
