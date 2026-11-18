import { ArrowRight, CalendarDays, Clock3, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import type { ClientRequestListItem } from '../../../types/service-request'
import {
  clientRequestStatus,
  clientRequestStatusVariant,
  formatServiceDate,
  requestGuidance,
} from '../client-request-display'

export function ClientRequestCard({
  item,
  specialtyName,
}: {
  item: ClientRequestListItem
  specialtyName: string
}) {
  const { request } = item
  const guidance = requestGuidance(request)
  return (
    <Card className="group h-full transition-colors hover:border-primary/45">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pedido #{request.requestId.slice(-8)}
            </p>
            <CardTitle className="mt-1 flex items-start gap-2">
              <Wrench aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>{specialtyName}</span>
            </CardTitle>
          </div>
          <Badge variant={clientRequestStatusVariant(request)}>{clientRequestStatus(request)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex items-start gap-2">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div><dt className="sr-only">Data</dt><dd className="capitalize">{formatServiceDate(request.serviceDate)}</dd></div>
          </div>
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <div><dt className="sr-only">Período</dt><dd>{SERVICE_PERIOD_DEFINITIONS[request.period].label}</dd></div>
          </div>
        </dl>
        {guidance ? <p className="text-sm leading-5 text-muted-foreground">{guidance}</p> : null}
        <Link
          to={`/cliente/pedidos/${encodeURIComponent(request.requestId)}`}
          className="inline-flex min-h-10 items-center justify-between gap-3 rounded-md font-semibold text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
        >
          Acompanhar pedido <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </CardContent>
    </Card>
  )
}
