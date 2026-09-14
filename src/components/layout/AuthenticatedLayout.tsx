import {
  BriefcaseBusiness,
  ClipboardList,
  Compass,
  Home,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { cn } from '../../utils/cn'
import { Brand } from '../brand/Brand'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Avatar, AvatarFallback } from '../ui/avatar'

export interface LayoutNavigationItem {
  label: string
  href: string
  icon: LucideIcon
}

export type AuthenticatedMode = 'client' | 'professional' | 'admin'

const navigationByMode: Record<AuthenticatedMode, LayoutNavigationItem[]> = {
  client: [
    { label: 'Início', href: '/cliente', icon: Home },
    { label: 'Buscar', href: '/cliente/buscar', icon: Search },
    { label: 'Pedidos', href: '/cliente/pedidos', icon: ClipboardList },
    { label: 'Mensagens', href: '/cliente/mensagens', icon: MessageCircle },
    { label: 'Perfil', href: '/cliente/perfil', icon: UserRound },
  ],
  professional: [
    { label: 'Início', href: '/profissional', icon: Home },
    { label: 'Oportunidades', href: '/profissional/oportunidades', icon: Compass },
    { label: 'Serviços', href: '/profissional/servicos', icon: BriefcaseBusiness },
    { label: 'Mensagens', href: '/profissional/mensagens', icon: MessageCircle },
    { label: 'Perfil', href: '/profissional/perfil', icon: UserRound },
  ],
  admin: [
    { label: 'Visão geral', href: '/admin', icon: ShieldCheck },
    { label: 'Usuários', href: '/admin/usuarios', icon: Users },
    { label: 'Configurações', href: '/admin/configuracoes', icon: Settings },
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
  navigation?: LayoutNavigationItem[]
  activeNavigationHref?: string
  contextSwitcher?: ReactNode
}

export function AuthenticatedLayout({
  mode,
  pageTitle,
  userName = 'Usuário ProFind',
  navigation = navigationByMode[mode],
  activeNavigationHref,
  contextSwitcher,
  children,
}: AuthenticatedLayoutProps) {
  const location = useLocation()
  const activePathname = activeNavigationHref ?? location.pathname
  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((name) => name[0])
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#conteudo-principal"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <aside
        className={cn(
          'hidden border-r bg-background lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col',
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
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                  active && 'bg-accent text-accent-foreground shadow-sm',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/92 px-4 backdrop-blur-md sm:px-6 lg:h-18 lg:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-medium text-muted-foreground">{modeLabels[mode]}</p>
            <h1 className="font-bold">{pageTitle}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {contextSwitcher}
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-semibold">{userName}</p>
              <p className="text-xs text-muted-foreground">Conta ativa</p>
            </div>
            <Avatar>
              <AvatarFallback aria-label={userName}>{initials}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main id="conteudo-principal" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <h1 className="mb-6 text-2xl font-black tracking-tight lg:hidden">{pageTitle}</h1>
          {children}
        </main>
      </div>

      <nav
        aria-label={`${modeLabels[mode]} — navegação mobile`}
        className="fixed inset-x-0 bottom-0 z-40 grid min-h-16 border-t bg-card/96 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        style={{ gridTemplateColumns: `repeat(${navigation.length}, minmax(0, 1fr))` }}
      >
        {navigation.map((item) => {
          const active = isNavigationItemActive(activePathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm px-1 text-[0.68rem] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                active && 'bg-accent text-accent-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
