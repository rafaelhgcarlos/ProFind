import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatServiceTimestamp } from '../../utils/service-date-display'

export interface ActivityItem {
  id: string
  title: string
  icon: LucideIcon
  at: Date
  detail?: ReactNode
}

export function ActivityTimeline({ items, empty = 'Nenhum evento registrado.' }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ol className="grid gap-3">
      {items.map(({ id, title, icon: Icon, at, detail }) => (
        <li key={id} className="group grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground"><Icon className="size-4" /></span>
          </div>
          <div className="min-w-0 border-b pb-3 wrap-anywhere group-last:border-0 group-last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-semibold">{title}</p>
              <time className="text-xs text-muted-foreground" dateTime={Number.isNaN(at.getTime()) ? undefined : at.toISOString()}>{formatServiceTimestamp(at)}</time>
            </div>
            {detail ? <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
