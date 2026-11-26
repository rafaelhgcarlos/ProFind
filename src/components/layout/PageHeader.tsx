import type { ReactNode } from 'react'

export interface PageHeading {
  title?: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action, level = 1 }: PageHeading & { title: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 basis-64 grow">
        <Heading className="text-2xl font-bold tracking-tight wrap-anywhere sm:text-3xl">{title}</Heading>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex min-w-0 max-w-full flex-wrap gap-2">{action}</div> : null}
    </header>
  )
}
