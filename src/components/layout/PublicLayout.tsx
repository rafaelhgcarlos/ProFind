import { Menu, ShieldCheck } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

import { Brand } from '../brand/Brand'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Button } from '../ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'

export interface PublicNavigationItem {
  label: string
  href: string
}

interface PublicLayoutProps extends PropsWithChildren {
  navigation?: PublicNavigationItem[]
}

export function PublicLayout({ children, navigation = [] }: PublicLayoutProps) {
  const hasNavigation = navigation.length > 0

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#conteudo-principal"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur-md">
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

          <div className="flex items-center gap-1">
            <ThemeToggle />
            {hasNavigation ? (
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Abrir menu">
                      <Menu aria-hidden="true" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    className="w-[min(88vw,22rem)] gap-0 p-0 sm:p-0"
                  >
                    <SheetHeader className="border-b px-5 py-6 pr-14">
                      <SheetTitle>Navegação</SheetTitle>
                      <SheetDescription>
                        Acesse as opções disponíveis no ProFind.
                      </SheetDescription>
                    </SheetHeader>
                    <nav aria-label="Navegação mobile" className="grid gap-1 p-3">
                      {navigation.map((item) => (
                        <Button
                          key={item.href}
                          variant="ghost"
                          className="min-h-12 w-full justify-start px-3"
                          asChild
                        >
                          <Link to={item.href}>{item.label}</Link>
                        </Button>
                      ))}
                    </nav>
                    <div className="mt-auto border-t bg-muted/35 px-5 py-5">
                      <div className="flex gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                          <ShieldCheck className="size-4" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">Escolha com confiança</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Informação e privacidade em cada etapa.
                          </p>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
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
