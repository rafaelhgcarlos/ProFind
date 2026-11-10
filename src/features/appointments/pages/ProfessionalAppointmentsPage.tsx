import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  Play,
  RefreshCw,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Label } from '../../../components/ui/label'
import { Skeleton } from '../../../components/ui/skeleton'
import { Textarea } from '../../../components/ui/textarea'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { serviceRequestService } from '../../../services/service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import {
  type ProfessionalAppointmentDetails,
  type ProfessionalAppointmentsCursor,
  type ProfessionalAppointmentSummary,
} from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

const PAGE_SIZE = 12

interface AppointmentPageState {
  items: ProfessionalAppointmentSummary[]
  nextCursor: ProfessionalAppointmentsCursor | null
  loading: boolean
  fromCache: boolean
}

function pageKey(cursor?: ProfessionalAppointmentsCursor | null) {
  return cursor ? `page-${cursor.requestId}` : 'first'
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day, 12))
}

function statusLabel(status: ProfessionalAppointmentSummary['status']) {
  return status === 'IN_PROGRESS' ? 'Em andamento' : 'Confirmado'
}

function normalizedError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function addressLabel(details: ProfessionalAppointmentDetails) {
  const { address } = details.privateData
  return [
    `${address.street}, ${address.number}`,
    address.complement,
    address.neighborhood,
    `${address.city} - ${address.stateCode}`,
    `CEP ${address.postalCode.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`,
  ]
    .filter(Boolean)
    .join(', ')
}

export function ProfessionalAppointmentsPage() {
  const { requestId } = useParams<{ requestId?: string }>()
  const location = useLocation()
  useDocumentTitle(
    requestId ? 'Detalhe do atendimento — ProFind' : 'Atendimentos — ProFind',
  )
  const { user } = useAuth()
  const { profile } = useProfile()
  const catalogState = useCatalog()
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <ProfessionalLayout
      pageTitle={requestId ? 'Detalhe do atendimento' : 'Atendimentos'}
      activeNavigationHref="/profissional/atendimentos"
      userName={profile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      {requestId ? (
        <AppointmentDetails
          key={`${user?.uid ?? 'signed-out'}:${requestId}`}
          requestId={requestId}
          userId={user?.uid}
          online={online}
          catalogState={catalogState}
        />
      ) : (
        <AppointmentsList
          key={user?.uid ?? 'signed-out'}
          userId={user?.uid}
          online={online}
          catalogState={catalogState}
          notice={
            typeof location.state === 'object' &&
            location.state !== null &&
            'appointmentNotice' in location.state &&
            typeof location.state.appointmentNotice === 'string'
              ? location.state.appointmentNotice
              : ''
          }
        />
      )}
    </ProfessionalLayout>
  )
}

interface CatalogStateLike {
  status: string
  catalog: {
    specialties: Array<{ id: string; name: string }>
  } | null
}

function AppointmentsList({
  userId,
  online,
  catalogState,
  notice,
}: {
  userId?: string
  online: boolean
  catalogState: CatalogStateLike
  notice: string
}) {
  const [pages, setPages] = useState<Record<string, AppointmentPageState>>({})
  const [pageOrder, setPageOrder] = useState<string[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const subscriptions = useRef(new Map<string, () => void>())
  const generation = useRef(0)

  const connectPage = useCallback(
    (cursor: ProfessionalAppointmentsCursor | null, key: string, version: number) => {
      if (subscriptions.current.has(key)) return
      setPageOrder((current) =>
        current.includes(key) ? current : [...current, key],
      )
      setPages((current) => ({
        ...current,
        [key]: {
          items: current[key]?.items ?? [],
          nextCursor: current[key]?.nextCursor ?? null,
          loading: true,
          fromCache: current[key]?.fromCache ?? false,
        },
      }))
      try {
        const unsubscribe = serviceRequestService.subscribeProfessionalAppointments({
          pageSize: PAGE_SIZE,
          cursor,
          onPage(snapshot) {
            if (generation.current !== version) return
            setError('')
            setPages((current) => ({
              ...current,
              [key]: {
                ...snapshot.page,
                loading: false,
                fromCache: snapshot.fromCache,
              },
            }))
          },
          onError(nextError) {
            if (generation.current !== version) return
            setPages((current) => ({
              ...current,
              ...(current[key]
                ? { [key]: { ...current[key], loading: false } }
                : {}),
            }))
            setError(nextError.message)
          },
        })
        subscriptions.current.set(key, unsubscribe)
      } catch (nextError) {
        setError(
          normalizedError(nextError, 'Não foi possível abrir seus atendimentos.'),
        )
      }
    },
    [],
  )

  useEffect(() => {
    generation.current += 1
    const version = generation.current
    for (const unsubscribe of subscriptions.current.values()) unsubscribe()
    const activeSubscriptions = new Map<string, () => void>()
    subscriptions.current = activeSubscriptions
    queueMicrotask(() => {
      if (generation.current !== version) return
      setPages({})
      setPageOrder([])
      setError('')
      if (userId) connectPage(null, 'first', version)
    })
    return () => {
      generation.current += 1
      for (const unsubscribe of activeSubscriptions.values()) unsubscribe()
      activeSubscriptions.clear()
    }
  }, [attempt, connectPage, userId])

  const appointments = useMemo(() => {
    const unique = new Map<string, ProfessionalAppointmentSummary>()
    for (const key of pageOrder) {
      for (const appointment of pages[key]?.items ?? []) {
        unique.set(appointment.requestId, appointment)
      }
    }
    return Array.from(unique.values()).sort(
      (left, right) =>
        left.periodStartAt.getTime() - right.periodStartAt.getTime() ||
        left.requestId.localeCompare(right.requestId),
    )
  }, [pageOrder, pages])
  const specialtyNames = useMemo(
    () =>
      new Map(
        catalogState.status === 'ready'
          ? (catalogState.catalog?.specialties ?? []).map((item) => [item.id, item.name])
          : [],
      ),
    [catalogState],
  )
  const firstPage = pages.first
  const loading = !firstPage || firstPage.loading
  const lastPage = [...pageOrder]
    .reverse()
    .map((key) => pages[key])
    .find(Boolean)
  const nextCursor = lastPage?.nextCursor ?? null
  const disconnected =
    !online || Object.values(pages).some((page) => page.fromCache)

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <Badge variant="secondary">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          Agenda confirmada
        </Badge>
        <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
          Seus atendimentos
        </h2>
        <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
          Acompanhe compromissos confirmados e serviços que já estão em andamento.
        </p>
      </header>

      {notice ? (
        <Alert variant="success" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Atendimento atualizado</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {disconnected ? (
        <Alert variant="warning">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Conexão indisponível</AlertTitle>
          <AlertDescription>
            A lista pode estar desatualizada. Ações somente serão confirmadas após a reconexão.
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !error ? (
        <div role="status" className="grid gap-4 md:grid-cols-2">
          <span className="sr-only">Carregando atendimentos…</span>
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Não foi possível carregar os atendimentos</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setAttempt((current) => current + 1)}
            >
              <RefreshCw aria-hidden="true" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error && appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden="true" />}
          title="Nenhum atendimento agendado"
          description="Quando um aceite for confirmado, o compromisso aparecerá aqui automaticamente."
          action={
            <Button asChild variant="outline">
              <Link to="/profissional/oportunidades">Ver oportunidades</Link>
            </Button>
          }
        />
      ) : null}

      {appointments.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {appointments.map((appointment) => (
            <Card key={appointment.requestId} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge
                      variant={
                        appointment.status === 'IN_PROGRESS' ? 'success' : 'secondary'
                      }
                    >
                      {statusLabel(appointment.status)}
                    </Badge>
                    <CardTitle className="mt-3">
                      {specialtyNames.get(appointment.specialtyId) ?? 'Serviço profissional'}
                    </CardTitle>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Wrench aria-hidden="true" className="size-5" />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {formatServiceDate(appointment.serviceDate)} ·{' '}
                    {SERVICE_PERIOD_DEFINITIONS[appointment.period].label}
                  </span>
                </p>
                <Button asChild className="mt-auto">
                  <Link to={`/profissional/atendimentos/${appointment.requestId}`}>
                    Ver atendimento
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(pages[pageKey(nextCursor)]?.loading)}
            onClick={() =>
              connectPage(nextCursor, pageKey(nextCursor), generation.current)
            }
          >
            {pages[pageKey(nextCursor)]?.loading
              ? 'Carregando…'
              : 'Carregar mais atendimentos'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function AppointmentDetails({
  requestId,
  userId,
  online,
  catalogState,
}: {
  requestId: string
  userId?: string
  online: boolean
  catalogState: CatalogStateLike
}) {
  const navigate = useNavigate()
  const [details, setDetails] = useState<ProfessionalAppointmentDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [confirmStart, setConfirmStart] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startNotice, setStartNotice] = useState('')
  const [confirmCancellation, setConfirmCancellation] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 15_000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setDetails(null)
      setLoading(true)
      setFromCache(false)
      setError('')
      setConfirmStart(false)
      setStartNotice('')
      setConfirmCancellation(false)
      setCancellationReason('')
    })
    if (!userId) {
      return () => {
        active = false
      }
    }
    const unsubscribe = serviceRequestService.subscribeProfessionalAppointmentDetails({
      requestId,
      onDetails(snapshot) {
        if (!active) return
        setDetails(snapshot.details)
        setFromCache(snapshot.fromCache)
        setLoading(false)
        setError('')
      },
      onUnavailable(nextError) {
        if (!active) return
        setDetails(null)
        setLoading(false)
        setError(nextError.message)
      },
      onError(nextError) {
        if (!active) return
        setLoading(false)
        setError(nextError.message)
      },
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [attempt, requestId, userId])

  const specialtyName =
    catalogState.status === 'ready'
      ? catalogState.catalog?.specialties.find(
          (item) => item.id === details?.appointment.specialtyId,
        )?.name
      : undefined
  const startAvailable = details
    ? currentTime >= details.appointment.periodStartAt.getTime()
    : false

  async function handleStart() {
    if (!details || starting) return
    setStarting(true)
    setError('')
    setStartNotice('')
    try {
      await serviceRequestService.startAssignment({
        requestId,
        expectedAssignmentId: details.appointment.assignmentId,
        expectedRound: details.appointment.round,
      })
      setConfirmStart(false)
      setStartNotice('Início confirmado. A reserva permanece ativa durante a execução.')
    } catch (nextError) {
      setError(
        normalizedError(nextError, 'Não foi possível confirmar o início do atendimento.'),
      )
    } finally {
      setStarting(false)
    }
  }

  async function handleCancel() {
    if (!details || cancelling) return
    const reason = cancellationReason.trim().replace(/\s+/g, ' ')
    if (reason.length < 10 || reason.length > 500) {
      setError('Informe o motivo do cancelamento em 10 a 500 caracteres.')
      return
    }
    setCancelling(true)
    setError('')
    try {
      const result = await serviceRequestService.cancelAssignment({
        requestId,
        expectedAssignmentId: details.appointment.assignmentId,
        reason,
      })
      navigate('/profissional/atendimentos', {
        replace: true,
        state: {
          appointmentNotice: result.replacementSearchOpen
            ? 'Cancelamento confirmado e procura por substituto iniciada.'
            : 'Cancelamento confirmado. O pedido ficou pendente para intervenção ou reagendamento.',
        },
      })
    } catch (nextError) {
      setError(
        normalizedError(nextError, 'Não foi possível cancelar este atendimento.'),
      )
      setCancelling(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <Button asChild variant="ghost" className="-ml-3">
          <Link to="/profissional/atendimentos">
            <ArrowLeft aria-hidden="true" />
            Voltar aos atendimentos
          </Link>
        </Button>
      </div>

      {!online || fromCache ? (
        <Alert variant="warning">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Dados possivelmente desatualizados</AlertTitle>
          <AlertDescription>
            Reconecte-se antes de iniciar ou cancelar o atendimento.
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div role="status" className="space-y-4">
          <span className="sr-only">Carregando detalhe do atendimento…</span>
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Não foi possível atualizar o atendimento</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {!details ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setAttempt((current) => current + 1)}
              >
                <RefreshCw aria-hidden="true" />
                Recarregar atendimento
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {startNotice ? (
        <Alert variant="success" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Atendimento iniciado</AlertTitle>
          <AlertDescription>{startNotice}</AlertDescription>
        </Alert>
      ) : null}

      {details ? (
        <>
          <Card>
            <CardHeader>
              <Badge
                variant={
                  details.appointment.status === 'IN_PROGRESS' ? 'success' : 'secondary'
                }
                className="w-fit"
              >
                {statusLabel(details.appointment.status)}
              </Badge>
              <CardTitle>{specialtyName ?? 'Serviço profissional'}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="flex gap-3">
                  <CalendarClock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-semibold">Data e período</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {formatServiceDate(details.appointment.serviceDate)} ·{' '}
                      {SERVICE_PERIOD_DEFINITIONS[details.appointment.period].label}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-semibold">Status</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {statusLabel(details.appointment.status)}
                    </dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endereço autorizado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="flex gap-3 text-sm leading-6">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>{addressLabel(details)}</span>
              </p>
              {details.privateData.notes ? (
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Descrição do serviço
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {details.privateData.notes}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {details.appointment.status === 'ASSIGNED' ? (
            <Card>
              <CardHeader>
                <CardTitle>Ações do atendimento</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {!startAvailable ? (
                  <Alert>
                    <Clock3 aria-hidden="true" />
                    <AlertTitle>Início ainda indisponível</AlertTitle>
                    <AlertDescription>
                      O serviço poderá ser iniciado a partir do começo do período agendado.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {confirmStart ? (
                  <Alert variant="warning">
                    <Play aria-hidden="true" />
                    <AlertTitle>Confirmar início do atendimento?</AlertTitle>
                    <AlertDescription>
                      <p>O cliente verá o serviço como em andamento somente após a confirmação do servidor.</p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          loading={starting}
                          loadingLabel="Confirmando…"
                          disabled={!online || fromCache}
                          onClick={() => void handleStart()}
                        >
                          Confirmar início
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={starting}
                          onClick={() => setConfirmStart(false)}
                        >
                          Voltar
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : confirmCancellation ? (
                  <Alert variant="warning">
                    <AlertTriangle aria-hidden="true" />
                    <AlertTitle>Cancelar este atendimento?</AlertTitle>
                    <AlertDescription>
                      <p>A atribuição e a reserva só serão alteradas após o commit.</p>
                      <div className="mt-4 space-y-2">
                        <Label htmlFor="appointment-cancellation-reason">
                          Motivo do cancelamento *
                        </Label>
                        <Textarea
                          id="appointment-cancellation-reason"
                          required
                          minLength={10}
                          maxLength={500}
                          value={cancellationReason}
                          onChange={(event) => {
                            setCancellationReason(event.target.value)
                            setError('')
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          {cancellationReason.length}/500 caracteres
                        </p>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="destructive"
                          loading={cancelling}
                          loadingLabel="Cancelando…"
                          disabled={!online || fromCache}
                          onClick={() => void handleCancel()}
                        >
                          Confirmar cancelamento
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={cancelling}
                          onClick={() => setConfirmCancellation(false)}
                        >
                          Manter atendimento
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      disabled={!startAvailable || !online || fromCache}
                      onClick={() => {
                        setError('')
                        setConfirmStart(true)
                      }}
                    >
                      <Play aria-hidden="true" />
                      Iniciar atendimento
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!online || fromCache}
                      onClick={() => {
                        setError('')
                        setConfirmCancellation(true)
                      }}
                    >
                      Cancelar atendimento
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>Serviço em andamento</AlertTitle>
              <AlertDescription>
                A reserva continua ativa. A conclusão será disponibilizada em uma etapa própria.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : null}
    </div>
  )
}
