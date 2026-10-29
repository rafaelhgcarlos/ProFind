import {
  Activity,
  BookOpenText,
  BriefcaseBusiness,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Home,
  Images,
  LogOut,
  PlusCircle,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useContext, useState, type PropsWithChildren, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'

import { AuthenticationContext } from '../../features/auth/auth-context'
import { cn } from '../../utils/cn'
import { Brand } from '../brand/Brand'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu'

export interface LayoutNavigationItem {
  label: string
  href: string
  icon: LucideIcon
  showOnMobile?: boolean
  disabled?: boolean
  disabledReason?: string
}

export type AuthenticatedMode = 'client' | 'professional' | 'admin'

const navigationByMode: Record<AuthenticatedMode, LayoutNavigationItem[]> = {
  client: [
    { label: 'Início', href: '/cliente', icon: Home },
    {
      label: 'Solicitar serviço',
      href: '/cliente/solicitar',
      icon: PlusCircle,
    },
    {
      label: 'Meus pedidos',
      href: '/cliente#solicitacoes',
      icon: ClipboardList,
      disabled: true,
      disabledReason: 'Em breve você poderá acompanhar seus pedidos por aqui.',
    },
    { label: 'Perfil', href: '/cliente/perfil', icon: UserRound },
  ],
  professional: [
    { label: 'Início', href: '/profissional', icon: Home },
    { label: 'Perfil', href: '/profissional/perfil', icon: UserRound },
    {
      label: 'Análise',
      href: '/profissional/analise',
      icon: ClipboardCheck,
    },
    {
      label: 'Portfólio',
      href: '/profissional/portfolio',
      icon: Images,
      showOnMobile: false,
    },
    {
      label: 'Oportunidades',
      href: '/profissional',
      icon: Compass,
      showOnMobile: false,
      disabled: true,
      disabledReason:
        'Disponível para profissionais elegíveis em uma próxima etapa.',
    },
    {
      label: 'Atendimentos',
      href: '/profissional',
      icon: BriefcaseBusiness,
      showOnMobile: false,
      disabled: true,
      disabledReason:
        'Em breve você poderá acompanhar seus atendimentos por aqui.',
    },
    {
      label: 'Ajuda',
      href: '/profissional#ajuda-cadastro',
      icon: CircleHelp,
    },
  ],
  admin: [
    { label: 'Visão geral', href: '/admin', icon: ShieldCheck },
    {
      label: 'Análise',
      href: '/admin/profissionais',
      icon: ClipboardCheck,
    },
    {
      label: 'Catálogo',
      href: '/admin/catalogo',
      icon: BookOpenText,
      disabled: true,
      disabledReason: 'Disponível em breve.',
    },
    {
      label: 'Operação',
      href: '/admin/operacao',
      icon: Activity,
      disabled: true,
      disabledReason: 'Disponível em breve.',
    },
  ],
}

const modeLabels: Record<AuthenticatedMode, string> = {
  client: 'Área do cliente',
  professional: 'Área profissional',
  admin: 'Administração',
}

function isNavigationItemActive(pathname: string, href: string) {
  return pathname === href || (href.split('/').length > 2 && pathname.startsWith(`${href}/`))
}

interface AuthenticatedLayoutProps extends PropsWithChildren {
  mode: AuthenticatedMode
  pageTitle: string
  userName?: string
  userAvatarUrl?: string
  navigation?: LayoutNavigationItem[]
  activeNavigationHref?: string
  contextSwitcher?: ReactNode
}

export function AuthenticatedLayout({
  mode,
  pageTitle,
  userName = 'Usuário ProFind',
  userAvatarUrl,
  navigation = navigationByMode[mode],
  activeNavigationHref,
  contextSwitcher,
  children,
}: AuthenticatedLayoutProps) {
  const location = useLocation()
  const authentication = useContext(AuthenticationContext)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const activePathname = activeNavigationHref ?? location.pathname
  const mobileNavigationItems = navigation.filter(
    (item) => item.showOnMobile !== false,
  )
  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((name) => name[0])
    .join('')
    .toUpperCase()

  async function handleLogout() {
    if (!authentication || isLoggingOut) return
    setIsLoggingOut(true)
    setLogoutError(null)
    try {
      await authentication.logout()
      setAccountMenuOpen(false)
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : 'Não foi possível sair agora. Tente novamente.',
      )
    } finally {
      setIsLoggingOut(false)
    }
  }

  const mobileNavigation = (
    <nav
      aria-label={`${modeLabels[mode]} — navegação mobile`}
      className="fixed right-auto bottom-0 left-0 z-40 grid min-h-16 w-full min-w-0 max-w-full overflow-hidden border-t bg-card/96 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      style={{
        gridTemplateColumns: `repeat(${mobileNavigationItems.length}, minmax(0, 1fr))`,
        width: 'min(100dvw, 100%)',
        maxWidth: 'min(100dvw, 100%)',
      }}
    >
      {mobileNavigationItems.map((item) => {
        const active = isNavigationItemActive(activePathname, item.href)
        const Icon = item.icon
        if (item.disabled) {
          return (
            <span
              key={`${item.href}-${item.label}`}
              aria-disabled="true"
              title={item.disabledReason}
              className="relative flex min-h-16 min-w-0 max-w-full cursor-not-allowed flex-col items-center justify-center gap-1 overflow-hidden rounded-sm px-1 text-[0.68rem] font-medium text-muted-foreground opacity-55"
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
              <span className="sr-only">{item.disabledReason}</span>
            </span>
          )
        }
        return (
          <Link
            key={`${item.href}-${item.label}`}
            to={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-16 min-w-0 max-w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-sm px-1 text-[0.68rem] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              active && 'bg-accent text-accent-foreground after:absolute after:top-0 after:h-0.5 after:w-8 after:rounded-full after:bg-primary',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      <div className="min-h-dvh w-full min-w-0 max-w-full overflow-x-clip bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <a
        href="#conteudo-principal"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <aside
        className={cn(
          'hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col',
          mode === 'admin' && 'bg-muted/45',
        )}
      >
        <div className="flex h-18 items-center border-b px-5">
          <Brand />
        </div>
        <div className="px-5 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {modeLabels[mode]}
        </div>
        <nav aria-label={modeLabels[mode]} className="grid gap-1 p-3">
          {navigation.map((item) => {
            const active = isNavigationItemActive(activePathname, item.href)
            const Icon = item.icon
            if (item.disabled) {
              return (
                <span
                  key={`${item.href}-${item.label}`}
                  aria-disabled="true"
                  title={item.disabledReason}
                  className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 text-sm font-medium text-muted-foreground opacity-55"
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[0.65rem] font-semibold uppercase tracking-wide">
                    Pendente
                  </span>
                  <span className="sr-only">{item.disabledReason}</span>
                </span>
              )
            }
            return (
              <Link
                key={`${item.href}-${item.label}`}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                  active && 'border-primary bg-accent text-accent-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        {authentication?.status === 'authenticated' ? (
          <div className="mt-auto border-t p-3">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              loading={isLoggingOut}
              loadingLabel="Saindo…"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
            >
              <LogOut aria-hidden="true" /> Sair
            </Button>
            {logoutError ? (
              <p role="alert" className="mt-2 break-words px-3 text-sm text-destructive">
                {logoutError}
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>

      <div className="w-full min-w-0 max-w-full pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 min-w-0 max-w-full items-center justify-between border-b bg-card/95 px-4 backdrop-blur-md sm:px-6 lg:h-18 lg:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="text-xs font-medium text-muted-foreground">
              {modeLabels[mode]} <span aria-hidden="true">/</span>{' '}
              <span className="text-foreground/75">{pageTitle}</span>
            </p>
            <h1 className="break-words font-bold">{pageTitle}</h1>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {contextSwitcher}
            <ThemeToggle />
            <div className="hidden min-w-0 text-right sm:block">
              <p className="max-w-48 truncate text-sm font-semibold">{userName}</p>
              <p className="text-xs text-muted-foreground">Conta ativa</p>
            </div>
            <DropdownMenu
              modal={false}
              open={accountMenuOpen}
              onOpenChange={setAccountMenuOpen}
            >
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={`Abrir menu da conta de ${userName}`} className="rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30">
                    <Avatar className="border border-primary/20">
                      {userAvatarUrl ? <AvatarImage src={userAvatarUrl} alt="" /> : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" collisionPadding={8}>
                  <DropdownMenuLabel className="max-w-48 truncate">{userName}</DropdownMenuLabel>
                  {mode !== 'admin' ? (
                    <DropdownMenuItem asChild>
                      <Link
                        to={
                          mode === 'client'
                            ? '/cliente/perfil'
                            : '/profissional/perfil'
                        }
                      >
                        Meu perfil
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {authentication?.status === 'authenticated' ? (
                    <DropdownMenuItem
                      className="min-h-11"
                      disabled={isLoggingOut}
                      onSelect={(event) => {
                        event.preventDefault()
                        void handleLogout()
                      }}
                    >
                      <LogOut aria-hidden="true" />
                      {isLoggingOut ? 'Saindo…' : 'Sair'}
                    </DropdownMenuItem>
                  ) : null}
                  {logoutError ? (
                    <p role="alert" className="max-w-64 break-words px-2 py-2 text-sm text-destructive">
                      {logoutError}
                    </p>
                  ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="conteudo-principal" className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <h1 className="mb-6 text-2xl font-bold tracking-tight lg:hidden">{pageTitle}</h1>
          {children}
        </main>
      </div>

      </div>

      {typeof document === 'undefined'
        ? mobileNavigation
        : createPortal(mobileNavigation, document.body)}
    </>
  )
}
