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
    <div className={cn('mx-auto max-w-md px-4 py-10 text-center', className)}>
      {icon ? (
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground [&>svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
