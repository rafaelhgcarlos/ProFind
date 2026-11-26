import { forwardRef, type TextareaHTMLAttributes } from 'react'

import { cn } from '../../utils/cn'
import { fieldControlClass } from './field-styles'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      fieldControlClass,
      'block min-h-28 resize-y placeholder:text-muted-foreground',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
