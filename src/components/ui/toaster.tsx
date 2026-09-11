import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { Toaster as SonnerToaster } from 'sonner'

import { useTheme } from '../../hooks/useTheme'

export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-center"
      closeButton
      icons={{
        success: <CircleCheck className="size-4" aria-hidden="true" />,
        error: <CircleX className="size-4" aria-hidden="true" />,
        warning: <TriangleAlert className="size-4" aria-hidden="true" />,
        info: <Info className="size-4" aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'border-border bg-popover text-popover-foreground shadow-soft',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-secondary text-secondary-foreground',
          closeButton: 'border-border bg-background text-foreground',
        },
      }}
    />
  )
}
