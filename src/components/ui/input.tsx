import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '../../utils/cn'
import { fieldControlClass } from './field-styles'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    type={type}
    className={cn(
      fieldControlClass,
      'block placeholder:text-muted-foreground',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'
