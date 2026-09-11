import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { HTMLAttributes } from 'react'

import { cn } from '../../utils/cn'
import { Button } from './button'

interface PaginationProps extends HTMLAttributes<HTMLElement> {
  page: number
  totalPages: number
  onPrevious?: () => void
  onNext?: () => void
}

export function Pagination({
  page,
  totalPages,
  onPrevious,
  onNext,
  className,
  ...props
}: PaginationProps) {
  return (
    <nav
      aria-label="Paginação"
      className={cn('flex items-center justify-between gap-3', className)}
      {...props}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={onPrevious}
        icon={<ChevronLeft />}
      >
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Página <strong className="text-foreground">{page}</strong> de {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={onNext}
        icon={<ChevronRight />}
      >
        Próxima
      </Button>
    </nav>
  )
}
