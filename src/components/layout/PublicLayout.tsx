import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

import { Brand } from '../brand/Brand'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Button } from '../ui/button'
import { PublicAccountActions } from './PublicAccountActions'
import { PublicMobileMenu } from './PublicMobileMenu'

export interface PublicNavigationItem {
  label: string
  href: string
}

interface PublicLayoutProps extends PropsWithChildren {
  navigation?: PublicNavigationItem[]
  showAccountLinks?: boolean
}

export function PublicLayout({ children, navigation = [], showAccountLinks = false }: PublicLayoutProps) {
  const hasNavigation = navigation.length > 0

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#conteudo-principal"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-18 lg:px-8">
          <Brand />

          {hasNavigation ? (
            <nav aria-label="Navegação principal" className="hidden items-center gap-1 md:flex">
              {navigation.map((item) => (
                <Button key={item.href} variant="ghost" asChild>
                  <Link to={item.href}>{item.label}</Link>
                </Button>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {showAccountLinks ? (
              <PublicAccountActions navigation={navigation} />
            ) : hasNavigation ? (
              <PublicMobileMenu navigation={navigation} />
            ) : null}
          </div>
        </div>
      </header>
      <main id="conteudo-principal">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>ProFind — serviços e profissionais mais próximos.</span>
          <span>Escolhas com contexto, conversa e confiança.</span>
        </div>
      </footer>
    </div>
  )
}
