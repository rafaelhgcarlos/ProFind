import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Clock3,
  LockKeyhole,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { ConfirmationDialog } from '../../../components/ui/confirmation-dialog'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { serviceRequestService } from '../../../services/service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import { formatCalendarDate, formatServiceHours, formatServiceTimestamp } from '../../../utils/service-date-display'
import {
  ServiceRequestError,
  type ProfessionalOpportunityDetails,
} from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

type RouteState = { returnTo?: string; scrollY?: number }

function revisionKey(details: ProfessionalOpportunityDetails) {
  const item = details.opportunity
  return JSON.stringify([
    item.round,
    item.categoryId,
    item.specialtyId,
    item.cityIbgeCode,
    item.serviceDate,
    item.period,
    details.city,
    details.stateCode,
    details.description,
  ])
}

function unavailableMessage(error: ServiceRequestError) {
  const messages: Partial<Record<ServiceRequestError['code'], string>> = {
    'opportunity-taken':
      'Outro profissional confirmou esta oportunidade. O aceite não está mais disponível.',
    'request-expired': 'O prazo para aceitar esta oportunidade terminou.',
    'round-changed':
      'O cliente alterou os dados ou iniciou uma nova rodada. Revise a versão atual.',
    'professional-restricted':
      'Sua elegibilidade para oportunidades mudou. Consulte a situação do cadastro profissional.',
    'excluded-from-round': 'Você não participa desta rodada de distribuição.',
    'already-refused': 'Você já recusou esta oportunidade nesta rodada.',
    'slot-conflict': 'Sua agenda já possui uma reserva nesse período.',
    'not-open': 'Esta oportunidade foi cancelada ou não está mais aberta.',
    'not-eligible': 'Esta oportunidade não corresponde mais à sua elegibilidade.',
    'permission-denied':
      'Você não está autorizado a consultar esta oportunidade.',
    offline: 'Você está offline. Reconecte-se para confirmar o aceite.',
    unavailable: 'A conexão falhou. Tente novamente.',
  }
  return messages[error.code] ?? error.message
}

function OpportunityDetailsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando detalhes da oportunidade"
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]"
    >
      <span className="sr-only">Carregando detalhes da oportunidade…</span>

      <Card role="group" aria-label="Carregando serviço solicitado" className="lg:col-span-full">
        <CardHeader>
          <Skeleton className="h-6 w-40 max-w-full" />
          <Skeleton className="h-7 w-2/3 max-w-full" />
          <Skeleton className="h-5 w-1/2 max-w-full" />
        </CardHeader>
      </Card>

      <Card role="group" aria-label="Carregando descrição do trabalho" className="lg:row-span-2">
        <CardHeader>
          <Skeleton className="h-7 w-52 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5 max-w-full" />
        </CardContent>
      </Card>

      <Card role="group" aria-label="Carregando localização">
        <CardHeader>
          <Skeleton className="h-6 w-32 max-w-full" />
          <Skeleton className="h-7 w-1/2 max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 rounded-lg border p-4">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </CardContent>
      </Card>

      <Card role="group" aria-label="Carregando agendamento">
        <CardHeader>
          <Skeleton className="h-6 w-32 max-w-full" />
          <Skeleton className="h-7 w-3/4 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-20 max-w-full" />
            <Skeleton className="h-4 w-28 max-w-full" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-5 w-44 max-w-full" />
            <Skeleton className="h-4 w-32 max-w-full" />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Skeleton className="h-5 w-36 max-w-full" />
            <Skeleton className="h-4 w-28 max-w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ProfessionalOpportunityDetailsPage() {
  useDocumentTitle('Detalhes da oportunidade — ProFind')
  const { requestId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const routeState = (location.state ?? {}) as RouteState
  const { user } = useAuth()
  const { profile } = useProfile()
  const catalogState = useCatalog()
  const [details, setDetails] = useState<ProfessionalOpportunityDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const offerAction = useRef<HTMLButtonElement>(null)

  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const reviewedRevision = useRef('')

  const returnTo = routeState.returnTo?.startsWith('/profissional')
    ? routeState.returnTo
    : '/profissional/oportunidades'

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => undefined
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
    setError('')
    setDetails(null)
    setConfirming(false)
    setNeedsReview(false)
    reviewedRevision.current = ''
    if (!user?.uid || !requestId) {
      setLoading(false)
      return
    }

    try {
      unsubscribe = serviceRequestService.subscribeProfessionalOpportunityDetails({
        requestId,
        onDetails(snapshot) {
          if (!active) return
          const nextRevision = revisionKey(snapshot.details)
          if (
            reviewedRevision.current &&
            reviewedRevision.current !== nextRevision
          ) {
            setNeedsReview(true)
            setConfirming(false)
          } else if (!reviewedRevision.current) {
            reviewedRevision.current = nextRevision
          }
          setDetails(snapshot.details)
          setFromCache(snapshot.fromCache)
          setError('')
          setLoading(false)
        },
        onUnavailable(nextError) {
          if (!active) return
          setDetails(null)
          setConfirming(false)
          setError(unavailableMessage(nextError))
          setLoading(false)
        },
        onError(nextError) {
          if (!active) return
          setDetails(null)
          setConfirming(false)
          setError(unavailableMessage(nextError))
          setLoading(false)
        },
      })
    } catch (nextError) {
      setError(
        nextError instanceof ServiceRequestError
          ? unavailableMessage(nextError)
          : 'Não foi possível abrir esta oportunidade.',
      )
      setLoading(false)
    }
    })
    return () => {
      active = false
      unsubscribe()
      setDetails(null)
    }
  }, [attempt, requestId, user?.uid])

  const names = useMemo(() => {
    if (catalogState.status !== 'ready') return { category: '', specialty: '' }
    return {
      category:
        catalogState.catalog.categories.find(
          (item) => item.id === details?.opportunity.categoryId,
        )?.name ?? '',
      specialty:
        catalogState.catalog.specialties.find(
          (item) => item.id === details?.opportunity.specialtyId,
        )?.name ?? '',
    }
  }, [catalogState, details])

  const expired = details
    ? details.opportunity.acceptUntil.getTime() <= now
    : false
  const canAccept = Boolean(
    details && !expired && !fromCache && !needsReview && !accepting && !declining,
  )

  function goBack() {
    navigate(returnTo, {
      state: { restoreScrollY: routeState.scrollY ?? 0 },
    })
  }

  async function accept() {
    if (!details || !canAccept) return
    setAccepting(true)
    setError('')
    try {
      const result = await serviceRequestService.acceptOpportunity({
        requestId: details.opportunity.requestId,
        expectedRound: details.opportunity.round,
      })
      navigate(`/profissional/atendimentos/${details.opportunity.requestId}`, {
        replace: true,
        state: { assignmentId: result.assignmentId },
      })
    } catch (nextError) {
      setConfirming(false)
      setError(
        nextError instanceof ServiceRequestError
          ? unavailableMessage(nextError)
          : 'Não foi possível confirmar o aceite. Releia os dados e tente novamente.',
      )
    } finally {
      setAccepting(false)
    }
  }

  async function decline() {
    if (!details || declining || accepting) return
    setDeclining(true)
    setError('')
    try {
      await serviceRequestService.declineOpportunity({
        requestId: details.opportunity.requestId,
        expectedRound: details.opportunity.round,
      })
      goBack()
    } catch (nextError) {
      setError(
        nextError instanceof ServiceRequestError
          ? unavailableMessage(nextError)
          : 'Não foi possível registrar a recusa.',
      )
    } finally {
      setDeclining(false)
    }
  }

  return (
    <ProfessionalLayout
      pageTitle="Detalhes da oportunidade"
      activeNavigationHref="/profissional/oportunidades"
      userName={profile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto grid min-w-0 max-w-6xl gap-5">
        <div>
          <Button type="button" variant="ghost" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
            Voltar às oportunidades
          </Button>
        </div>

        {loading ? <OpportunityDetailsSkeleton /> : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>
              {details
                ? 'Não foi possível concluir a ação'
                : 'O aceite não está disponível'}
            </AlertTitle>
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

        {details ? (
          <>
            {needsReview ? (
              <Alert>
                <RefreshCw aria-hidden="true" />
                <AlertTitle>A oportunidade foi atualizada</AlertTitle>
                <AlertDescription>
                  <p>Revise novamente todos os dados antes de aceitar.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      reviewedRevision.current = revisionKey(details)
                      setNeedsReview(false)
                    }}
                  >
                    Revisei os dados atualizados
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            {expired ? (
              <Alert variant="destructive">
                <Clock3 aria-hidden="true" />
                <AlertTitle>Prazo encerrado</AlertTitle>
                <AlertDescription>
                  O prazo para aceitar esta oportunidade terminou. Nenhuma reserva foi criada.
                </AlertDescription>
              </Alert>
            ) : null}

            {fromCache ? (
              <Alert variant="warning">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Dados sem confirmação da rede</AlertTitle>
                <AlertDescription>
                  O aceite ficará disponível quando a versão atual for confirmada pelo servidor.
                </AlertDescription>
              </Alert>
            ) : null}

            <header className="min-w-0 border-b pb-5">
              {names.category ? <p className="mb-1 text-sm font-semibold text-muted-foreground">{names.category}</p> : null}
              <h2 className="text-2xl font-bold tracking-tight wrap-anywhere sm:text-3xl">
                {names.specialty || 'Serviço solicitado'}
              </h2>
            </header>

            <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
              <Card>
                <CardHeader><CardTitle>Descrição do trabalho</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm wrap-anywhere whitespace-pre-wrap leading-7 sm:text-base">
                    {details.description}
                  </p>
                </CardContent>
              </Card>

              <aside aria-label="Resumo da oportunidade" className="min-w-0">
                <Card>
                  <CardHeader className="pb-4"><CardTitle>Resumo do atendimento</CardTitle></CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Município</p>
                        <h3 className="text-sm font-semibold wrap-anywhere">{details.city} — {details.stateCode}</h3>
                      </div>
                    </div>
                    <dl className="grid gap-3 border-t pt-4 text-sm">
                      <div className="flex items-start gap-3">
                        <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <dt className="text-xs text-muted-foreground">Agendamento</dt>
                          <dd className="font-medium">{formatCalendarDate(details.opportunity.serviceDate)} · {SERVICE_PERIOD_DEFINITIONS[details.opportunity.period].label} ({formatServiceHours(details.opportunity.period)})</dd>
                          <dd>
                            {`${SERVICE_PERIOD_DEFINITIONS[details.opportunity.period].startHour}:00 às ${SERVICE_PERIOD_DEFINITIONS[details.opportunity.period].endHour}:00`}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <dt className="text-xs text-muted-foreground">Prazo para aceitar</dt>
                          <dd className="font-medium">{formatServiceTimestamp(details.opportunity.acceptUntil)}</dd>
                        </div>
                      </div>
                    </dl>
                    <div className="flex min-w-0 items-start gap-2 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
                      <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <p><strong className="block text-foreground">Endereço protegido</strong> <span>O endereço completo estará disponível após a confirmação do aceite.</span></p>
                    </div>
                  <ConfirmationDialog
                    open={confirming}
                    title="Aceitar este atendimento?"
                    description="Ao confirmar, você assume o atendimento e reserva esse horário na sua agenda."
                    confirmLabel="Confirmar aceite"
                    cancelLabel="Continuar revisando"
                    busy={accepting}
                    busyLabel="Confirmando aceite…"
                    disabled={!canAccept}
                    returnFocusTo={offerAction}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => void accept()}
                  />

                  <div className="grid gap-2 border-t pt-4">
                    <Button
                      ref={offerAction}
                      type="button"
                      disabled={!canAccept}
                      onClick={() => setConfirming(true)}
                    >
                      Aceitar atendimento
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      loading={declining}
                      loadingLabel="Recusando…"
                      disabled={accepting}
                      onClick={() => void decline()}
                    >
                      Recusar oportunidade
                    </Button>
                  </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </ProfessionalLayout>
  )
}
