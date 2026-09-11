import { Eye, EyeOff } from 'lucide-react'
import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
} from 'react'

import { cn } from '../../utils/cn'
import { Button } from './button'
import { Input } from './input'

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, disabled, id, ...props }, ref) => {
  const [isVisible, setIsVisible] = useState(false)
  const actionLabel = isVisible ? 'Ocultar senha' : 'Mostrar senha'

  return (
    <div className="relative">
      <Input
        {...props}
        id={id}
        ref={ref}
        type={isVisible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-12', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={actionLabel}
        aria-controls={id}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-0 rounded-l-none"
        onClick={() => setIsVisible((visible) => !visible)}
      >
        {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'
