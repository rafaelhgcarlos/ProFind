import { ChevronDown, CircleAlert, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../features/auth/use-auth'
import { useProfile } from '../../features/onboarding/use-profile'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { PublicMobileMenu } from './PublicMobileMenu'
import type { PublicNavigationItem } from './PublicLayout'

interface PublicAccountActionsProps {
  navigation: PublicNavigationItem[]
}

export function PublicAccountActions({ navigation }: PublicAccountActionsProps) {
  const { status, user, logout } = useAuth()
  const { status: profileStatus, profile } = useProfile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const isAuthenticated = status === 'authenticated'
  const isVisitor = status === 'unauthenticated'
  const currentProfile = profileStatus === 'ready' && profile?.userId === user?.uid ? profile : null
  const displayName = currentProfile?.name || user?.displayName || user?.email || 'Usuário ProFind'
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
      setMobileMenuOpen(false)
      setIsLoggingOut(false)
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Não foi possível sair agora. Tente novamente.')
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      {isVisitor ? (
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" asChild><Link to="/entrar">Entrar</Link></Button>
          <Button asChild><Link to="/cadastro">Criar conta</Link></Button>
        </div>
      ) : null}

      {isAuthenticated ? (
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Abrir menu da conta de ${displayName}`}
                className="inline-flex min-h-11 max-w-52 items-center gap-2 rounded-md px-1 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              >
                <Avatar className="size-9 border border-primary/20">
                  {user?.photoURL ? <AvatarImage src={user.photoURL} alt="" /> : null}
                  <AvatarFallback>{initials || 'PF'}</AvatarFallback>
                </Avatar>
                <span className="truncate">{displayName}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-48 truncate">{displayName}</DropdownMenuLabel>
              <DropdownMenuItem asChild><Link to="/conta">Acessar minha conta</Link></DropdownMenuItem>
              <DropdownMenuItem
                disabled={isLoggingOut}
                onSelect={(event) => {
                  event.preventDefault()
                  void handleLogout()
                }}
              >
                <LogOut aria-hidden="true" />
                {isLoggingOut ? 'Saindo…' : 'Sair'}
              </DropdownMenuItem>
              {logoutError ? <p role="alert" className="px-2 py-2 text-sm text-destructive">{logoutError}</p> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <PublicMobileMenu
        navigation={navigation}
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        onNavigate={() => setMobileMenuOpen(false)}
        accountIdentity={isAuthenticated ? (
          <div className="flex min-w-0 items-center gap-3 border-b px-5 py-4">
            <Avatar className="size-10 border border-primary/20">
              {user?.photoURL ? <AvatarImage src={user.photoURL} alt="" /> : null}
              <AvatarFallback>{initials || 'PF'}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate text-sm font-semibold">{displayName}</span>
          </div>
        ) : undefined}
        accountActions={isVisitor ? (
          <>
            <Button variant="outline" asChild><Link to="/entrar" onClick={() => setMobileMenuOpen(false)}>Entrar</Link></Button>
            <Button asChild><Link to="/cadastro" onClick={() => setMobileMenuOpen(false)}>Criar conta</Link></Button>
          </>
        ) : isAuthenticated ? (
          <>
            <Button variant="outline" asChild><Link to="/conta" onClick={() => setMobileMenuOpen(false)}>Acessar minha conta</Link></Button>
            <Button variant="ghost" loading={isLoggingOut} loadingLabel="Saindo…" onClick={() => void handleLogout()} className="w-full justify-start">
              <LogOut aria-hidden="true" />Sair
            </Button>
            {logoutError ? <p role="alert" className="px-3 text-sm text-destructive">{logoutError}</p> : null}
          </>
        ) : undefined}
      />

      {logoutError && isAuthenticated ? (
        <Alert variant="destructive" className="absolute top-full right-4 z-50 mt-2 hidden w-[min(22rem,calc(100vw-2rem))] shadow-soft md:grid">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Não foi possível sair</AlertTitle>
          <AlertDescription>{logoutError}</AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
