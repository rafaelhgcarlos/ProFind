import { Ellipsis } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '../../utils/cn'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet'
import type { LayoutNavigationItem } from './AuthenticatedLayout'

export function MobileNavigationMore({ items, activeHref, className }: {
  items: LayoutNavigationItem[]
  activeHref?: string
  className: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia?.('(min-width: 64rem)')
    if (!desktop) return
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [open])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" aria-label="Mais opções" aria-current={activeHref ? 'true' : undefined} className={className}>
          <Ellipsis className="size-5" aria-hidden="true" />
          <span>Mais</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" aria-describedby={undefined} className="mx-auto max-h-[min(80dvh,30rem)] w-full max-w-md gap-0 p-0 motion-safe:ui-enter sm:p-0 [&>button]:top-2 [&>button]:right-2 [&>button]:size-11">
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-14">
          <SheetTitle className="text-lg">Mais opções</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mais opções da área profissional" className="min-h-0 space-y-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {items.map(({ href, icon: Icon, label, disabled, disabledReason }) => {
            const active = href === activeHref
            const rowClass = 'flex min-h-12 min-w-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold wrap-anywhere'
            if (disabled) return <span key={href} aria-disabled="true" className={cn(rowClass, 'text-muted-foreground opacity-55')}><Icon className="size-5 shrink-0" aria-hidden="true" /><span>{label}<span className="sr-only">. {disabledReason}</span></span></span>
            return (
              <SheetClose key={href} asChild>
                <Link to={href} aria-current={active ? 'page' : undefined} className={cn(rowClass, 'ui-transition hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', active && 'bg-accent text-accent-foreground hover:bg-accent')}>
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </SheetClose>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
