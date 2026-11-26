import { ArrowRight, CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import type { ProfessionalAppointmentSummary } from '../../../types/service-request'
import { useServiceToday } from '../../../hooks/use-service-today'
import { formatCompactServiceDate } from '../../../utils/service-date-display'
import { appointmentStatusLabel } from '../appointment-formatters'

export function ProfessionalAppointmentCard({ appointment, specialtyName, stale }: {
  appointment: ProfessionalAppointmentSummary
  specialtyName: string
  stale?: boolean
}) {
  const today = useServiceToday()
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="wrap-anywhere">{specialtyName}</CardTitle>
        <Badge variant="outline">{stale ? 'Estado salvo' : appointmentStatusLabel(appointment.status)}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-start gap-4">
        <p className="flex gap-2 text-sm text-muted-foreground">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span><time dateTime={appointment.serviceDate}>{formatCompactServiceDate(appointment.serviceDate, today)}</time> · {SERVICE_PERIOD_DEFINITIONS[appointment.period].label}</span>
        </p>
        <Button asChild variant="outline" className="mt-auto">
          <Link to={`/profissional/atendimentos/${encodeURIComponent(appointment.requestId)}`}>
            Ver atendimento <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
