import type { LucideIcon } from 'lucide-react'

import { cn } from '../../../utils/cn'

export interface CategoryTileProps {
  name: string
  description?: string
  icon: LucideIcon
  active?: boolean
  onSelect?: () => void
}

export function CategoryTile({ name, description, icon: Icon, active = false, onSelect }: CategoryTileProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'group flex min-h-32 w-full min-w-0 flex-col items-start rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 sm:p-5',
        active && 'border-primary bg-accent/60',
      )}
    >
      <span className="mb-4 flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary transition-colors group-hover:bg-accent">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="max-w-full font-semibold break-words text-foreground">{name}</span>
      {description ? <span className="mt-1 text-sm leading-5 break-words text-muted-foreground">{description}</span> : null}
    </button>
  )
}
