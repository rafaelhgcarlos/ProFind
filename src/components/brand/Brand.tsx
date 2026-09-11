import { BriefcaseBusiness } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '../../utils/cn'

interface BrandProps {
  className?: string
  compact?: boolean
}

export function Brand({ className, compact = false }: BrandProps) {
  return (
    <Link
      to="/"
      aria-label="ProFind — página inicial"
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm font-black tracking-tight text-foreground',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <BriefcaseBusiness className="size-5" aria-hidden="true" />
      </span>
      {compact ? null : <span className="text-xl">ProFind</span>}
    </Link>
  )
}
