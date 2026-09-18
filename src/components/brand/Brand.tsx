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
        'inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm font-extrabold tracking-[-0.04em] text-foreground',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-[0.8rem] bg-primary text-primary-foreground shadow-soft">
        <svg className="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="m9.1 10.4 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {compact ? null : <span className="text-xl">Pro<span className="text-primary">Find</span></span>}
    </Link>
  )
}
