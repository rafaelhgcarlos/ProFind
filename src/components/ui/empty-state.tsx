import type { ReactNode } from 'react'

import { cn } from '../../utils/cn'

interface EmptyStateProps {
  title: string
  description: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('mx-auto min-w-0 max-w-md px-4 py-8 text-center wrap-anywhere sm:py-10', className)}>
      {icon ? (
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground [&>svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
