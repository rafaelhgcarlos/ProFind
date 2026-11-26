import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, CircleMinus, LockKeyhole } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Skeleton } from '../../../components/ui/skeleton'
import { Switch } from '../../../components/ui/switch'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { professionalAvailabilityService } from '../../../services/professional-availability.service'
import {
  availabilityDateBounds,
  SERVICE_PERIOD_DEFINITIONS,
} from '../../../services/service-period-policy'
import {
  SERVICE_PERIODS,
  type ServicePeriod,
} from '../../../types/service-request'
import type {
  ProfessionalAvailabilityDay,
  ProfessionalAvailabilitySelection,
} from '../../../types/professional-availability'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { formatCalendarDate, formatCompactServiceDate, formatServiceHours, shiftCalendarDate } from '../../../utils/service-date-display'
import { useServiceToday } from '../../../hooks/use-service-today'
import { cn } from '../../../utils/cn'

const availabilityStates = {
  available: { label: 'Disponível', icon: CheckCircle2, style: 'border-success/35 bg-success/10 text-success' },
  unavailable: { label: 'Indisponível', icon: CircleMinus, style: 'bg-muted text-muted-foreground' },
  reserved: { label: 'Reservado', icon: LockKeyhole, style: 'border-warning/35 bg-warning/10 text-foreground' },
}

function AvailabilityStatus({ state }: { state: keyof typeof availabilityStates }) {
  const { label, icon: Icon, style } = availabilityStates[state]
  return <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold', style)}><Icon className="size-3.5 shrink-0" aria-hidden="true" />{label}</span>
}

function selectionFromDay(
  day: ProfessionalAvailabilityDay,
): ProfessionalAvailabilitySelection {
  return Object.fromEntries(
    day.periods.map((period) => [period.period, period.available]),
  ) as ProfessionalAvailabilitySelection
}

function emptySelection(): ProfessionalAvailabilitySelection {
  return { MORNING: false, AFTERNOON: false, EVENING: false }
}

export function ProfessionalAvailabilityPage() {
  useDocumentTitle('Disponibilidade — ProFind')
  const bounds = availabilityDateBounds()
  const today = useServiceToday()
  const [serviceDate, setServiceDate] = useState(bounds.min)
  const [day, setDay] = useState<ProfessionalAvailabilityDay | null>(null)
  const [selection, setSelection] =
    useState<ProfessionalAvailabilitySelection>(emptySelection)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const savingRef = useRef(false)
  const previousDate = shiftCalendarDate(serviceDate, -1)
  const nextDate = shiftCalendarDate(serviceDate, 1)

  useEffect(() => {
    let active = true

    void professionalAvailabilityService
      .loadDay(serviceDate)
      .then((loadedDay) => {
        if (!active) return
        setDay(loadedDay)
        setSelection(selectionFromDay(loadedDay))
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setDay(null)
        setSelection(emptySelection())
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Não foi possível carregar sua disponibilidade.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [attempt, serviceDate])

  async function handleSave() {
    if (savingRef.current || !day || loading) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const savedDay = await professionalAvailabilityService.saveDay(
        serviceDate,
        selection,
      )
      setDay(savedDay)
      setSelection(selectionFromDay(savedDay))
      setSaved(true)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar sua disponibilidade.',
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function reserved(period: ServicePeriod) {
    return day?.periods.find((item) => item.period === period)?.reserved === true
  }

  function selectDate(value: string) {
    if (!value || value === serviceDate || value < bounds.min || value > bounds.max || savingRef.current) return
    setLoading(true)
    setError(null)
    setSaved(false)
    setDay(null)
    setServiceDate(value)
  }

  return (
    <ProfessionalLayout
      pageTitle="Disponibilidade"
      heading={{ title: 'Agenda de disponibilidade', description: 'Escolha um dia e marque os períodos em que você pode receber oportunidades.' }}
      activeNavigationHref="/profissional/disponibilidade"
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="max-w-4xl space-y-5">
        <section aria-label="Escolha de data" className="grid gap-2">
            <Label htmlFor="availability-date">Data de atendimento</Label>
            <div className="flex min-w-0 items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Dia anterior" disabled={saving || previousDate < bounds.min} onClick={() => selectDate(previousDate)}><ChevronLeft aria-hidden="true" /></Button>
              <Input id="availability-date" type="date" min={bounds.min} max={bounds.max} value={serviceDate} disabled={saving} aria-describedby="availability-date-help" className="w-full min-w-0 max-w-xs" onChange={(event) => selectDate(event.target.value)} />
              <Button type="button" variant="outline" size="icon" aria-label="Próximo dia" disabled={saving || nextDate > bounds.max} onClick={() => selectDate(nextDate)}><ChevronRight aria-hidden="true" /></Button>
            </div>
            <p id="availability-date-help" className="text-sm text-muted-foreground">A agenda usa o horário de São Paulo. Você pode organizar os próximos 90 dias.</p>
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Não foi possível atualizar a agenda</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              {!day ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setLoading(true)
                    setError(null)
                    setSaved(false)
                    setAttempt((current) => current + 1)
                  }}
                >
                  Tentar novamente
                </Button>
              ) : <p className="mt-1">Sua seleção foi preservada. Use “Salvar disponibilidade” para tentar novamente.</p>}
            </AlertDescription>
          </Alert>
        ) : null}

        {saved ? (
          <Alert variant="success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Disponibilidade salva</AlertTitle>
            <AlertDescription>
              As próximas consultas já considerarão estes períodos.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg" aria-live="polite">
              <time dateTime={serviceDate}>{formatCompactServiceDate(serviceDate, today)}{serviceDate === today ? ` · ${formatCalendarDate(serviceDate, 'short')}` : ''}</time>
            </CardTitle>
            <ul aria-label="Legenda da agenda" className="flex flex-wrap gap-2">
              {(['available', 'unavailable', 'reserved'] as const).map((state) => <li key={state}><AvailabilityStatus state={state} /></li>)}
            </ul>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div role="status" className="space-y-3">
                <span className="sr-only">Carregando disponibilidade…</span>
                {SERVICE_PERIODS.map((period) => (
                  <Skeleton key={period} className="h-20" />
                ))}
              </div>
            ) : day ? (
              <div className="@container">
              <div className="grid gap-3 @min-[34rem]:grid-cols-3">
              {SERVICE_PERIODS.map((period) => {
                const definition = SERVICE_PERIOD_DEFINITIONS[period]
                const isReserved = reserved(period)
                const state = isReserved ? 'reserved' : selection[period] ? 'available' : 'unavailable'
                return (
                  <div
                    key={period}
                    className={cn('flex min-w-0 items-start justify-between gap-2 rounded-lg border p-3 @min-[34rem]:grid', availabilityStates[state].style)}
                  >
                    <div className="min-w-0">
                      <Label htmlFor={`availability-${period}`} className="text-base">
                        {definition.label}
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatServiceHours(period)}
                      </p>
                      <div id={`availability-status-${period}`} className="mt-2"><AvailabilityStatus state={state} /></div>
                      {isReserved ? (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          Atendimento confirmado preservado
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      id={`availability-${period}`}
                      checked={selection[period]}
                      disabled={saving || isReserved}
                      aria-label={`${definition.label}: disponível`}
                      aria-describedby={`availability-status-${period}`}
                      onCheckedChange={(checked) => {
                        setSaved(false)
                        setSelection((current) => ({
                          ...current,
                          [period]: checked,
                        }))
                      }}
                    />
                  </div>
                )
              })}
              </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={loading || saving || !day}
                loading={saving}
                loadingLabel="Salvando disponibilidade…"
                onClick={() => void handleSave()}
              >
                {saving ? 'Salvando…' : 'Salvar disponibilidade'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProfessionalLayout>
  )
}
