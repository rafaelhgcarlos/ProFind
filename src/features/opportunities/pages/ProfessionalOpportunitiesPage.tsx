import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Compass,
  LoaderCircle,
  MapPin,
  RefreshCw,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { professionalReviewService } from '../../../services/professional-review.service'
import { serviceRequestService } from '../../../services/service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import {
  ServiceRequestError,
  type OpportunityFeedCursor,
  type ProfessionalOpportunitySummary,
  type ServicePeriod,
} from '../../../types/service-request'
import type { ProfessionalOperationalReview } from '../../../types/professional-review'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalRegistrationSupport } from '../../professional-profile/components/ProfessionalRegistrationSupport'
import { ProfessionalReviewStatusCard } from '../../professional-profile/components/ProfessionalReviewStatusCard'

const FEED_PAGE_SIZE = 12

type AccessState = 'loading' | 'eligible' | 'restricted'
type OpportunityAction = 'accept' | 'decline'

interface FeedPageState {
  items: ProfessionalOpportunitySummary[]
  nextCursor: OpportunityFeedCursor | null
  loading: boolean
  fromCache: boolean
}

interface CardFeedback {
  tone: 'error' | 'info'
  message: string
}

interface AcceptedConfirmation {
  opportunity: ProfessionalOpportunitySummary
  assignmentId: string
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day, 12))
}

function formatDeadline(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function actionError(error: unknown) {
  if (!(error instanceof ServiceRequestError)) {
    return {
      code: 'unknown',
      message: 'Não foi possível atualizar esta oportunidade. Tente novamente.',
    }
  }

  const messages: Partial<Record<ServiceRequestError['code'], string>> = {
    'opportunity-taken': 'Outro profissional confirmou esta oportunidade primeiro.',
    'request-expired': 'O prazo para aceitar esta oportunidade terminou.',
    'round-changed': 'A rodada mudou e este card não pode mais ser usado.',
    'slot-conflict': 'Sua agenda já possui um atendimento neste período.',
    'professional-restricted':
      'Sua elegibilidade mudou. Consulte o estado da análise antes de continuar.',
    'excluded-from-round': 'Você não participa desta rodada de distribuição.',
    'already-refused': 'Você já recusou esta oportunidade nesta rodada.',
    offline: 'Você está offline. Reconecte-se antes de confirmar a ação.',
    unavailable: 'A conexão falhou antes da confirmação. Tente novamente.',
  }
  return { code: error.code, message: messages[error.code] ?? error.message }
}

function pageKey(cursor?: OpportunityFeedCursor | null) {
  return cursor ? `page-${cursor.page}` : 'first'
}

export function ProfessionalOpportunitiesPage() {
  useDocumentTitle('Oportunidades — ProFind')
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.uid
  const { profile, professionalProfile } = useProfile()
  const catalogState = useCatalog()
  const [access, setAccess] = useState<AccessState>('loading')
  const [review, setReview] = useState<ProfessionalOperationalReview | null>(null)
  const [reviewLoading, setReviewLoading] = useState(true)
  const [pages, setPages] = useState<Record<string, FeedPageState>>({})
  const [pageOrder, setPageOrder] = useState<string[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [pendingActions, setPendingActions] = useState<
    Record<string, OpportunityAction>
  >({})
  const [cardFeedback, setCardFeedback] = useState<Record<string, CardFeedback>>(
    {},
  )
  const [disabledRequestIds, setDisabledRequestIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [accepted, setAccepted] = useState<AcceptedConfirmation | null>(null)
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  )
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const subscriptions = useRef(new Map<string, () => void>())
  const generation = useRef(0)

  const reloadReview = useCallback(async (professionalId: string, version: number) => {
    try {
      const loadedReview = await professionalReviewService.findByProfessionalId(
        professionalId,
      )
      if (generation.current === version) setReview(loadedReview)
    } catch {
      if (generation.current === version) setReview(null)
    } finally {
      if (generation.current === version) setReviewLoading(false)
    }
  }, [])

  const connectPage = useCallback(
    (cursor: OpportunityFeedCursor | null, key: string, version: number) => {
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
        const unsubscribe = serviceRequestService.subscribeOpportunityFeed({
          pageSize: FEED_PAGE_SIZE,
          cursor,
          onAccessChange(eligible) {
            if (generation.current !== version) return
            setAccess(eligible ? 'eligible' : 'restricted')
            if (!eligible) {
              setPages({})
              setPageOrder([])
              if (userId) void reloadReview(userId, version)
            }
          },
          onPage(snapshot) {
            if (generation.current !== version) return
            setFeedError(null)
            setPages((current) => ({
              ...current,
              [key]: {
                ...snapshot.page,
                loading: false,
                fromCache: snapshot.fromCache,
              },
            }))
          },
          onError(error) {
            if (generation.current !== version) return
            setPages((current) => ({
              ...current,
              ...(current[key]
                ? { [key]: { ...current[key], loading: false } }
                : {}),
            }))
            setFeedError(error.message)
          },
        })
        subscriptions.current.set(key, unsubscribe)
      } catch (error) {
        setFeedError(
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir o feed de oportunidades.',
        )
      }
    },
    [reloadReview, userId],
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 15_000)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.clearInterval(clock)
    }
  }, [])

  useEffect(() => {
    generation.current += 1
    const version = generation.current
    const activeSubscriptions = new Map<string, () => void>()
    for (const unsubscribe of subscriptions.current.values()) unsubscribe()
    subscriptions.current = activeSubscriptions
    queueMicrotask(() => {
      if (generation.current !== version) return
      setAccess('loading')
      setReview(null)
      setReviewLoading(true)
      setPages({})
      setPageOrder([])
      setFeedError(null)
      setPendingActions({})
      setCardFeedback({})
      setDisabledRequestIds(new Set())
      setAccepted(null)

      if (userId) {
        void reloadReview(userId, version)
        connectPage(null, 'first', version)
      }
    })

    return () => {
      generation.current += 1
      for (const unsubscribe of activeSubscriptions.values()) unsubscribe()
      activeSubscriptions.clear()
    }
  }, [attempt, connectPage, reloadReview, userId])

  const opportunities = useMemo(() => {
    const unique = new Map<string, ProfessionalOpportunitySummary>()
    for (const key of pageOrder) {
      for (const opportunity of pages[key]?.items ?? []) {
        if (opportunity.acceptUntil.getTime() > currentTime) {
          unique.set(opportunity.requestId, opportunity)
        }
      }
    }
    return Array.from(unique.values()).sort(
      (left, right) =>
        left.acceptUntil.getTime() - right.acceptUntil.getTime() ||
        left.requestId.localeCompare(right.requestId),
    )
  }, [currentTime, pageOrder, pages])

  const categoryNames = useMemo(
    () =>
      new Map(
        catalogState.status === 'ready'
          ? catalogState.catalog.categories.map((item) => [item.id, item.name])
          : [],
      ),
    [catalogState],
  )
  const specialtyNames = useMemo(
    () =>
      new Map(
        catalogState.status === 'ready'
          ? catalogState.catalog.specialties.map((item) => [item.id, item.name])
          : [],
      ),
    [catalogState],
  )
  const municipalityNames = useMemo(() => {
    const locations = professionalProfile
      ? [professionalProfile.baseLocation, ...professionalProfile.selectedCities]
      : []
    return new Map(locations.map((item) => [item.ibgeCode, item.city]))
  }, [professionalProfile])
  const firstPage = pages.first
  const isInitialLoading =
    access === 'loading' || (access === 'eligible' && (!firstPage || firstPage.loading))
  const lastPage = [...pageOrder]
    .reverse()
    .map((key) => pages[key])
    .find(Boolean)
  const nextCursor = lastPage?.nextCursor ?? null
  const isDisconnected =
    !online || Object.values(pages).some((page) => page.fromCache)

  function removeOpportunity(requestId: string) {
    setPages((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, page]) => [
          key,
          {
            ...page,
            items: page.items.filter((item) => item.requestId !== requestId),
          },
        ]),
      ),
    )
  }

  function disableOpportunity(requestId: string, message: string) {
    setDisabledRequestIds((current) => new Set(current).add(requestId))
    setCardFeedback((current) => ({
      ...current,
      [requestId]: { tone: 'error', message },
    }))
  }

  async function handleAction(
    opportunity: ProfessionalOpportunitySummary,
    action: OpportunityAction,
  ) {
    if (pendingActions[opportunity.requestId]) return
    setPendingActions((current) => ({
      ...current,
      [opportunity.requestId]: action,
    }))
    setCardFeedback((current) => ({
      ...current,
      [opportunity.requestId]: {
        tone: 'info',
        message:
          action === 'accept'
            ? 'Aguardando a confirmação segura do aceite…'
            : 'Registrando sua recusa…',
      },
    }))

    try {
      if (action === 'accept') {
        const result = await serviceRequestService.acceptOpportunity({
          requestId: opportunity.requestId,
          expectedRound: opportunity.round,
        })
        setAccepted({ opportunity, assignmentId: result.assignmentId })
      } else {
        await serviceRequestService.declineOpportunity({
          requestId: opportunity.requestId,
          expectedRound: opportunity.round,
        })
      }
      removeOpportunity(opportunity.requestId)
      setCardFeedback((current) => {
        const next = { ...current }
        delete next[opportunity.requestId]
        return next
      })
    } catch (error) {
      const result = actionError(error)
      if (result.code === 'professional-restricted') {
        setAccess('restricted')
        setPages({})
        setPageOrder([])
        if (userId) void reloadReview(userId, generation.current)
      } else if (result.code === 'slot-conflict') {
        setDisabledRequestIds((current) => {
          const next = new Set(current)
          for (const item of opportunities) {
            if (
              item.serviceDate === opportunity.serviceDate &&
              item.period === opportunity.period
            ) {
              next.add(item.requestId)
            }
          }
          return next
        })
        disableOpportunity(opportunity.requestId, result.message)
      } else if (
        ['opportunity-taken', 'request-expired', 'round-changed', 'excluded-from-round', 'already-refused'].includes(
          result.code,
        )
      ) {
        disableOpportunity(opportunity.requestId, result.message)
      } else {
        setCardFeedback((current) => ({
          ...current,
          [opportunity.requestId]: { tone: 'error', message: result.message },
        }))
      }
    } finally {
      setPendingActions((current) => {
        const next = { ...current }
        delete next[opportunity.requestId]
        return next
      })
    }
  }

  const pageTitle = location.pathname.endsWith('/oportunidades')
    ? 'Oportunidades'
    : 'Início'

  return (
    <ProfessionalLayout
      pageTitle={pageTitle}
      activeNavigationHref={location.pathname}
      userName={profile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto grid max-w-6xl gap-6">
        {feedError && access === 'loading' ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Não foi possível abrir o feed</AlertTitle>
            <AlertDescription>
              <p>{feedError}</p>
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

        {isInitialLoading && !feedError ? (
          <div role="status" className="space-y-4">
            <span className="sr-only">Carregando oportunidades…</span>
            <Skeleton className="h-32" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          </div>
        ) : null}

        {access === 'restricted' && !isInitialLoading ? (
          <>
            <header>
              <Badge variant="secondary">Área profissional</Badge>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Acompanhe seu cadastro profissional
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
                O feed é liberado somente para a versão atual aprovada e ativa.
              </p>
            </header>
            {reviewLoading ? (
              <Skeleton className="h-56" />
            ) : (
              <ProfessionalReviewStatusCard
                review={review}
                profileExists={professionalProfile !== null}
                detailsHref="/profissional/analise"
              />
            )}
            <ProfessionalRegistrationSupport />
          </>
        ) : null}

        {access === 'eligible' && !isInitialLoading ? (
          <>
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <Badge variant="secondary">
                  <Compass aria-hidden="true" className="size-3.5" />
                  Distribuição em tempo real
                </Badge>
                <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                  Oportunidades para você
                </h2>
                <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
                  Exibimos somente serviços compatíveis com seu cadastro,
                  municípios e disponibilidade atual.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/profissional/disponibilidade">
                  <CalendarClock aria-hidden="true" />
                  Editar disponibilidade
                </Link>
              </Button>
            </header>

            {isDisconnected ? (
              <Alert variant="warning">
                <WifiOff aria-hidden="true" />
                <AlertTitle>Conexão indisponível</AlertTitle>
                <AlertDescription>
                  Os dados podem estar desatualizados. Aceites e recusas só são
                  confirmados depois da reconexão e do commit.
                </AlertDescription>
              </Alert>
            ) : null}

            {accepted ? (
              <Alert variant="success" aria-live="polite">
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Aceite confirmado</AlertTitle>
                <AlertDescription>
                  A atribuição {accepted.assignmentId} foi confirmada para{' '}
                  {specialtyNames.get(accepted.opportunity.specialtyId) ?? 'o serviço'}.
                  O acompanhamento completo ficará disponível na etapa de agendados.
                </AlertDescription>
              </Alert>
            ) : null}

            {feedError ? (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Não foi possível atualizar o feed</AlertTitle>
                <AlertDescription>
                  <p>{feedError}</p>
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

            {!feedError && opportunities.length === 0 ? (
              <EmptyState
                icon={<Compass aria-hidden="true" />}
                title="Nenhuma oportunidade disponível"
                description="Quando surgir um pedido compatível com sua agenda, ele aparecerá aqui automaticamente."
                action={
                  <Button asChild variant="outline">
                    <Link to="/profissional/disponibilidade">
                      Revisar disponibilidade
                    </Link>
                  </Button>
                }
              />
            ) : null}

            {opportunities.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {opportunities.map((opportunity) => {
                  const pending = pendingActions[opportunity.requestId]
                  const disabled = disabledRequestIds.has(opportunity.requestId)
                  const feedback = cardFeedback[opportunity.requestId]
                  const specialty =
                    specialtyNames.get(opportunity.specialtyId) ?? 'Serviço profissional'
                  const category = categoryNames.get(opportunity.categoryId)
                  const municipality =
                    municipalityNames.get(opportunity.cityIbgeCode) ??
                    `Município IBGE ${opportunity.cityIbgeCode}`
                  const period = SERVICE_PERIOD_DEFINITIONS[
                    opportunity.period as ServicePeriod
                  ]

                  return (
                    <Card key={opportunity.requestId} className="flex flex-col">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                              {category ?? 'Oportunidade compatível'}
                            </p>
                            <CardTitle className="mt-1">{specialty}</CardTitle>
                          </div>
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                            <Wrench aria-hidden="true" className="size-5" />
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col gap-4">
                        <dl className="grid gap-3 text-sm">
                          <div className="flex gap-2">
                            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                            <div>
                              <dt className="sr-only">Município</dt>
                              <dd>{municipality}</dd>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                            <div>
                              <dt className="sr-only">Data e período</dt>
                              <dd>
                                {formatServiceDate(opportunity.serviceDate)} · {period.label}
                              </dd>
                            </div>
                          </div>
                          <div className="flex gap-2 text-muted-foreground">
                            <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                            <div>
                              <dt className="sr-only">Prazo para aceitar</dt>
                              <dd>Aceite até {formatDeadline(opportunity.acceptUntil)}</dd>
                            </div>
                          </div>
                        </dl>

                        {feedback ? (
                          <p
                            role={feedback.tone === 'error' ? 'alert' : 'status'}
                            className={
                              feedback.tone === 'error'
                                ? 'rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
                                : 'rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'
                            }
                          >
                            {feedback.message}
                          </p>
                        ) : null}

                        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={Boolean(pending) || disabled || !online}
                            onClick={() => void handleAction(opportunity, 'decline')}
                          >
                            {pending === 'decline' ? (
                              <LoaderCircle aria-hidden="true" className="animate-spin" />
                            ) : null}
                            {pending === 'decline' ? 'Recusando…' : 'Recusar'}
                          </Button>
                          <Button
                            type="button"
                            disabled={Boolean(pending) || disabled || !online}
                            onClick={() => void handleAction(opportunity, 'accept')}
                          >
                            {pending === 'accept' ? (
                              <LoaderCircle aria-hidden="true" className="animate-spin" />
                            ) : null}
                            {pending === 'accept' ? 'Confirmando…' : 'Aceitar'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : null}

            {nextCursor ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(pages[pageKey(nextCursor)]?.loading)}
                  onClick={() =>
                    connectPage(
                      nextCursor,
                      pageKey(nextCursor),
                      generation.current,
                    )
                  }
                >
                  {pages[pageKey(nextCursor)]?.loading
                    ? 'Carregando…'
                    : 'Carregar mais oportunidades'}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </ProfessionalLayout>
  )
}
