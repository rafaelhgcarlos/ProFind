import { Menu, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import type { PublicNavigationItem } from './PublicLayout'

interface PublicMobileMenuProps {
  navigation: PublicNavigationItem[]
  accountIdentity?: ReactNode
  accountActions?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNavigate?: () => void
}

export function PublicMobileMenu({
  navigation,
  accountIdentity,
  accountActions,
  open,
  onOpenChange,
  onNavigate,
}: PublicMobileMenuProps) {
  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Abrir menu">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[min(88vw,22rem)] gap-0 p-0 sm:p-0">
          <SheetHeader className="border-b px-5 py-6 pr-14">
            <SheetTitle>Navegação</SheetTitle>
            <SheetDescription>Acesse as opções disponíveis no ProFind.</SheetDescription>
          </SheetHeader>
          {accountIdentity}
          <nav aria-label="Navegação mobile" className="grid gap-1 p-3">
            {navigation.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                className="min-h-12 w-full justify-start px-3"
                asChild
              >
                <Link to={item.href} onClick={onNavigate}>{item.label}</Link>
              </Button>
            ))}
            {accountActions ? <div className="mt-3 grid gap-2 border-t pt-4">{accountActions}</div> : null}
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
  )
}
