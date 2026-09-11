import { Menu } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

import { Brand } from '../brand/Brand'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Button } from '../ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'

const navigation = [
  { label: 'Como funciona', href: '/#beneficios' },
  { label: 'Design system', href: '/design-system' },
]

export function PublicLayout({ children }: PropsWithChildren) {
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

          <nav aria-label="Navegação principal" className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => (
              <Button key={item.href} variant="ghost" asChild>
                <Link to={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Abrir menu">
                    <Menu aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <nav aria-label="Navegação mobile" className="mt-4 grid gap-2">
                    {navigation.map((item) => (
                      <Button key={item.href} variant="ghost" className="justify-start" asChild>
                        <Link to={item.href}>{item.label}</Link>
                      </Button>
                    ))}
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
      <main id="conteudo-principal">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>ProFind — profissionais e clientes mais próximos.</span>
          <span>Design acessível, simples e responsivo.</span>
        </div>
      </footer>
    </div>
  )
}
