import { AlertCircle, CalendarClock, CheckCircle2, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
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
  const [serviceDate, setServiceDate] = useState(bounds.min)
  const [day, setDay] = useState<ProfessionalAvailabilityDay | null>(null)
  const [selection, setSelection] =
    useState<ProfessionalAvailabilitySelection>(emptySelection)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [attempt, setAttempt] = useState(0)

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
      setSaving(false)
    }
  }

  function reserved(period: ServicePeriod) {
    return day?.periods.find((item) => item.period === period)?.reserved === true
  }

  return (
    <ProfessionalLayout
      pageTitle="Disponibilidade"
      activeNavigationHref="/profissional/disponibilidade"
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <Badge variant="secondary">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            Agenda por data e período
          </Badge>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Quando você pode atender?
          </h2>
          <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
            Marque os períodos em que deseja receber oportunidades. Esta agenda
            não altera a aprovação do cadastro e nunca remove reservas já
            confirmadas.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Escolha uma data</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="availability-date">Data de atendimento</Label>
            <Input
              id="availability-date"
              type="date"
              min={bounds.min}
              max={bounds.max}
              value={serviceDate}
              className="mt-2 max-w-xs"
              onChange={(event) => {
                setLoading(true)
                setError(null)
                setSaved(false)
                setDay(null)
                setServiceDate(event.target.value)
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Você pode organizar os próximos 90 dias no fuso de São Paulo.
            </p>
          </CardContent>
        </Card>

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
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {saved ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Disponibilidade salva</AlertTitle>
            <AlertDescription>
              As próximas consultas já considerarão estes períodos.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Períodos do dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div role="status" className="space-y-3">
                <span className="sr-only">Carregando disponibilidade…</span>
                {SERVICE_PERIODS.map((period) => (
                  <Skeleton key={period} className="h-20" />
                ))}
              </div>
            ) : (
              SERVICE_PERIODS.map((period) => {
                const definition = SERVICE_PERIOD_DEFINITIONS[period]
                const isReserved = reserved(period)
                return (
                  <div
                    key={period}
                    className="flex min-w-0 items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div className="min-w-0">
                      <Label htmlFor={`availability-${period}`} className="text-base">
                        {definition.label}
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {String(definition.startHour).padStart(2, '0')}:00–
                        {String(definition.endHour).padStart(2, '0')}:00
                      </p>
                      {isReserved ? (
                        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary">
                          <LockKeyhole className="size-4" aria-hidden="true" />
                          Atendimento confirmado preservado
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      id={`availability-${period}`}
                      checked={selection[period]}
                      disabled={saving || isReserved}
                      aria-label={`${definition.label}: disponível`}
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
              })
            )}

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={loading || saving || !day}
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
