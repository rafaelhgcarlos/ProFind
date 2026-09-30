import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '../../utils/cn'

const alertVariants = cva(
  'relative grid min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-md border p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        success: 'border-success/35 bg-success/10 text-foreground [&>svg]:text-success',
        warning: 'border-warning/35 bg-warning/10 text-foreground [&>svg]:text-warning',
        destructive:
          'border-destructive/35 bg-destructive/10 text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn('min-w-0 break-words font-semibold leading-5', className)} {...props} />
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('col-start-2 min-w-0 break-words mt-1 leading-5 text-muted-foreground', className)} {...props} />
}
