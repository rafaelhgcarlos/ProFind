import { ArrowRight, CalendarDays, WifiOff, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import type { ClientRequestListItem } from '../../../types/service-request'
import { cn } from '../../../utils/cn'
import { useServiceToday } from '../../../hooks/use-service-today'
import { formatCompactServiceDate } from '../../../utils/service-date-display'
import {
  clientRequestStatus,
  clientRequestStatusVariant,
  requestGuidance,
} from '../client-request-display'

export function ClientRequestCard({
  item,
  specialtyName,
  stale = false,
  compact = false,
  now,
}: {
  item: ClientRequestListItem
  specialtyName: string
  stale?: boolean
  compact?: boolean
  now?: Date
}) {
  const { request } = item
  const today = useServiceToday()
  const guidance = requestGuidance(request, now)
  const status = clientRequestStatus(request, now)
  return (
    <Card className="flex h-full flex-col transition-colors hover:border-primary/45">
      <CardHeader className={cn('pb-3 sm:pb-3', compact && 'p-4 sm:p-4')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-start gap-2">
              <Wrench aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{specialtyName}</span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Código do pedido · {request.requestId.slice(-8)}</p>
          </div>
          {stale ? (
            <Badge variant="outline">
              <WifiOff aria-hidden="true" className="size-3.5" />
              Estado salvo
            </Badge>
          ) : (
            <Badge variant={clientRequestStatusVariant(request, now)}>{status}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn('flex flex-1 flex-col gap-4', compact && 'gap-3 px-4 pb-3 sm:px-4 sm:pb-3')}>
        <p className="flex items-start gap-2 text-sm">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span><time dateTime={request.serviceDate}>{formatCompactServiceDate(request.serviceDate, today)}</time> · {SERVICE_PERIOD_DEFINITIONS[request.period].label}</span>
        </p>
        {stale ? (
          <p className="text-sm leading-5 text-muted-foreground">
            Último estado conhecido: {status}. Confirme depois da reconexão.
          </p>
        ) : guidance ? (
          <p className="text-sm leading-5 text-muted-foreground">{guidance}</p>
        ) : null}
        <Link
          to={`/cliente/pedidos/${encodeURIComponent(request.requestId)}`}
          draggable={compact ? false : undefined}
          className="mt-auto inline-flex min-h-11 items-center justify-between gap-3 rounded-sm text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Acompanhar pedido <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </CardContent>
    </Card>
  )
}
