import { ChevronDown } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'

import { cn } from '../../utils/cn'
import { fieldControlClass } from './field-styles'

export function NativeSelect({ className, ...props }: ComponentPropsWithRef<'select'>) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className={cn(fieldControlClass, 'block appearance-none pe-9 forced-colors:appearance-auto forced-colors:pe-3', className)}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground forced-colors:hidden"
      />
    </div>
  )
}
