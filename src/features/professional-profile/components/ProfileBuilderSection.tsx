import { CheckCircle2, ChevronDown, CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../../utils/cn'

interface ProfileBuilderSectionProps {
  id: string
  title: string
  description: string
  summary: string
  open: boolean
  complete: boolean
  hasError?: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  footer?: ReactNode
}

export function ProfileBuilderSection({
  id,
  title,
  description,
  summary,
  open,
  complete,
  hasError = false,
  onOpenChange,
  children,
  footer,
}: ProfileBuilderSectionProps) {
  const contentId = `${id}-content`
  const triggerId = `${id}-trigger`

  return (
    <section
      id={id}
      aria-labelledby={triggerId}
      className={cn(
        'w-full min-w-0 max-w-full scroll-mt-28 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-soft',
        open && 'ring-1 ring-primary/20',
        hasError && 'border-destructive/60',
      )}
    >
      <h2>
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          className="flex min-h-20 w-full min-w-0 items-start gap-3 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/25 sm:px-6"
          onClick={() => onOpenChange(!open)}
        >
          {hasError ? (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <CheckCircle2
              className={cn(
                'mt-0.5 size-5 shrink-0',
                complete ? 'text-success' : 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-display text-lg font-bold tracking-tight">{title}</span>
              <span className={cn('text-xs font-medium', hasError ? 'text-destructive' : 'text-muted-foreground')}>
                {hasError ? 'Requer atenção' : complete ? 'Concluída' : 'Pendente'}
              </span>
            </span>
            <span className="mt-1 block min-w-0 break-words text-sm leading-5 text-muted-foreground">
              {open ? description : summary}
            </span>
          </span>
          <ChevronDown
            className={cn('mt-1 size-5 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
        className="w-full min-w-0 max-w-full"
      >
        <div className="w-full min-w-0 max-w-full border-t px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
        {footer ? (
          <div className="w-full min-w-0 max-w-full border-t px-5 py-5 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  )
}
