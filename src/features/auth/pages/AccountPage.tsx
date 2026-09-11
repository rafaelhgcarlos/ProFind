import { CircleAlert, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useAuth } from '../use-auth'

export function AccountPage() {
  useDocumentTitle('Minha conta — ProFind')
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
      navigate('/entrar', { replace: true })
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : 'Não foi possível sair agora. Tente novamente.',
      )
      setIsLoggingOut(false)
    }
  }

  return (
    <AppShell>
      <section className="mx-auto min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <Badge variant="secondary">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Sessão protegida
        </Badge>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.03em] sm:text-4xl">Minha conta</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Este espaço confirma seu acesso autenticado. Os demais recursos serão adicionados nas etapas próprias do produto.
        </p>

        <Card className="mt-8 max-w-2xl">
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <UserRound aria-hidden="true" />
            </div>
            <h2 className="pt-3 text-lg font-bold tracking-tight">Sessão atual</h2>
            <p className="text-sm leading-6 text-muted-foreground">Conta autenticada com Firebase Authentication.</p>
          </CardHeader>
          <CardContent className="grid gap-5">
            {logoutError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Não foi possível sair</AlertTitle>
                <AlertDescription>{logoutError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="rounded-md border bg-muted/45 p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">E-mail</p>
              <p className="mt-1 break-all font-medium">{user?.email ?? 'E-mail não informado'}</p>
            </div>
            <div>
              <Button variant="outline" loading={isLoggingOut} loadingLabel="Saindo…" onClick={handleLogout}>
                <LogOut aria-hidden="true" />
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  )
}
