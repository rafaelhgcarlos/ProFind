import { CalendarClock, Clock3, MapPin, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import type { ProfessionalOpportunitySummary } from '../../../types/service-request'
import {
  formatOpportunityDeadline,
  formatServiceDate,
} from '../opportunity-formatters'

interface ProfessionalOpportunityCardProps {
  opportunity: ProfessionalOpportunitySummary
  category?: string
  specialty: string
  municipality: string
  returnTo: string
  scrollY: number
}

export function ProfessionalOpportunityCard({
  opportunity,
  category,
  specialty,
  municipality,
  returnTo,
  scrollY,
}: ProfessionalOpportunityCardProps) {
  const period = SERVICE_PERIOD_DEFINITIONS[opportunity.period]

  return (
    <Link
      to={`/profissional/oportunidades/${opportunity.requestId}`}
      state={{ returnTo, scrollY }}
      className="group block min-w-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
    >
      <Card className="flex h-full flex-col transition-colors group-hover:border-primary/40 group-hover:bg-accent/20 group-focus-visible:border-primary/50">
        <CardHeader>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-xs font-semibold tracking-wide text-primary uppercase">
                {opportunity.reopenReason === 'PROFESSIONAL_CANCELLATION'
                  ? 'Substituição solicitada'
                  : category ?? 'Oportunidade compatível'}
              </p>
              <CardTitle className="mt-1">{specialty}</CardTitle>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Wrench aria-hidden="true" className="size-5" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {opportunity.descriptionPreview ? (
            <p className="line-clamp-2 break-words text-sm leading-6 text-muted-foreground">
              {opportunity.descriptionPreview}
            </p>
          ) : null}

          <dl className="grid gap-3 text-sm">
            <div className="flex min-w-0 gap-2">
              <MapPin
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <dt className="sr-only">Município</dt>
                <dd className="break-words">{municipality}</dd>
              </div>
            </div>
            <div className="flex min-w-0 gap-2">
              <CalendarClock
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <dt className="sr-only">Data e período</dt>
                <dd className="break-words">
                  {formatServiceDate(opportunity.serviceDate)} · {period.label}
                </dd>
              </div>
            </div>
            <div className="flex min-w-0 gap-2 text-muted-foreground">
              <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <dt className="sr-only">Prazo para aceitar</dt>
                <dd className="break-words">
                  Aceite até {formatOpportunityDeadline(opportunity.acceptUntil)}
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-auto flex justify-end">
            <span className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold whitespace-normal text-primary-foreground shadow-sm transition-colors group-hover:bg-primary-strong">
              Ver detalhes <span aria-hidden="true">→</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
