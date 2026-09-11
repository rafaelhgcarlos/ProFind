import { LockKeyhole } from 'lucide-react'
import type { HTMLAttributes } from 'react'

import { cn } from '../../utils/cn'

interface PrivacyNoticeProps extends HTMLAttributes<HTMLDivElement> {
  title?: string
}

export function PrivacyNotice({
  title = 'Seus dados continuam privados',
  className,
  children,
  ...props
}: PrivacyNoticeProps) {
  return (
    <div
      role="note"
      className={cn(
        'grid grid-cols-[auto_1fr] gap-3 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm',
        className,
      )}
      {...props}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <LockKeyhole className="size-4" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <div className="mt-1 leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}
