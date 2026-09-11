import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { cn } from '../../utils/cn'

const buttonVariants = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm data-[disabled=false]:hover:bg-primary-strong',
        secondary:
          'bg-secondary text-secondary-foreground data-[disabled=false]:hover:bg-accent data-[disabled=false]:hover:text-accent-foreground',
        outline:
          'border border-input bg-background text-foreground data-[disabled=false]:hover:bg-accent data-[disabled=false]:hover:text-accent-foreground',
        ghost:
          'text-foreground data-[disabled=false]:hover:bg-accent data-[disabled=false]:hover:text-accent-foreground',
        destructive:
          'bg-destructive text-destructive-foreground data-[disabled=false]:hover:brightness-90',
        link:
          'min-h-0 rounded-sm p-0 text-primary underline-offset-4 data-[disabled=false]:hover:underline',
      },
      size: {
        default: 'px-4 py-2.5',
        sm: 'min-h-9 rounded-sm px-3 py-2 text-xs',
        lg: 'min-h-12 rounded-lg px-6 py-3 text-base',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  loadingLabel?: string
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      className,
      variant,
      size,
      loading = false,
      loadingLabel = 'Carregando',
      disabled,
      children,
      icon,
      onClick,
      onClickCapture,
      tabIndex,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading
    const classes = cn(buttonVariants({ variant, size }), className)

    if (asChild) {
      const preventDisabledInteraction = (
        event: MouseEvent<HTMLButtonElement>,
      ) => {
        if (isDisabled) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        onClickCapture?.(event)
      }

      return (
        <Slot
          className={classes}
          ref={ref}
          aria-busy={loading || undefined}
          aria-disabled={isDisabled || undefined}
          data-disabled={isDisabled}
          onClick={isDisabled ? undefined : onClick}
          onClickCapture={preventDisabledInteraction}
          tabIndex={isDisabled ? -1 : tabIndex}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    return (
      <button
        className={classes}
        aria-busy={loading || undefined}
        data-disabled={isDisabled}
        disabled={isDisabled}
        onClick={onClick}
        onClickCapture={onClickCapture}
        tabIndex={tabIndex}
        ref={ref}
        {...props}
      >
        {loading ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
        {loading ? loadingLabel : children}
      </button>
    )
  },
)
Button.displayName = 'Button'
