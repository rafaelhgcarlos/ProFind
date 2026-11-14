import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Compass,
  RefreshCw,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

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
import { professionalReviewService } from '../../../services/professional-review.service'
import { serviceRequestService } from '../../../services/service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import {
  type OpportunityFeedCursor,
  type ProfessionalOpportunitySummary,
} from '../../../types/service-request'
import type { ProfessionalOperationalReview } from '../../../types/professional-review'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalRegistrationSupport } from '../../professional-profile/components/ProfessionalRegistrationSupport'
import { ProfessionalReviewStatusCard } from '../../professional-profile/components/ProfessionalReviewStatusCard'
import { ProfessionalOpportunityCard } from '../components/ProfessionalOpportunityCard'
import { formatServiceDate } from '../opportunity-formatters'

const FEED_PAGE_SIZE = 12

type AccessState = 'loading' | 'eligible' | 'restricted'

interface FeedPageState {
  items: ProfessionalOpportunitySummary[]
  nextCursor: OpportunityFeedCursor | null
  loading: boolean
  fromCache: boolean
}

interface AcceptedConfirmation {
  opportunity: ProfessionalOpportunitySummary
  assignmentId: string
}

function pageKey(cursor?: OpportunityFeedCursor | null) {
  return cursor ? `page-${cursor.page}` : 'first'
}

export function ProfessionalOpportunitiesPage() {
  useDocumentTitle('Oportunidades — ProFind')
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recoveredRequestId = searchParams.get('atendimento') ?? ''
  const recoveredAssignmentId = searchParams.get('atribuicao') ?? ''
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
  const [accepted, setAccepted] = useState<AcceptedConfirmation | null>(null)
  const [recoveringAssignment, setRecoveringAssignment] = useState(
    Boolean(recoveredRequestId && recoveredAssignmentId),
  )
  const [confirmCancellation, setConfirmCancellation] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellingAssignment, setCancellingAssignment] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [cancellationNotice, setCancellationNotice] = useState('')
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
      setAccepted(null)
      setConfirmCancellation(false)
      setCancellationReason('')
      setAssignmentError('')
      setRecoveringAssignment(Boolean(recoveredRequestId && recoveredAssignmentId))

      if (userId) {
        void reloadReview(userId, version)
        connectPage(null, 'first', version)
        if (recoveredRequestId && recoveredAssignmentId) {
          void serviceRequestService
            .getCurrentProfessionalAssignment(
              recoveredRequestId,
              recoveredAssignmentId,
            )
            .then((details) => {
              if (generation.current === version) setAccepted(details)
            })
            .catch((error: unknown) => {
              if (generation.current !== version) return
              setAssignmentError(
                error instanceof Error
                  ? error.message
                  : 'Não foi possível recuperar este atendimento.',
              )
            })
            .finally(() => {
              if (generation.current === version) setRecoveringAssignment(false)
            })
        }
      }
    })

    return () => {
      generation.current += 1
      for (const unsubscribe of activeSubscriptions.values()) unsubscribe()
      activeSubscriptions.clear()
    }
  }, [
    attempt,
    connectPage,
    recoveredAssignmentId,
    recoveredRequestId,
    reloadReview,
    userId,
  ])

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

  useEffect(() => {
    if (isInitialLoading) return
    const restoreScrollY = (location.state as { restoreScrollY?: unknown } | null)
      ?.restoreScrollY
    if (typeof restoreScrollY !== 'number') return
    const frame = window.requestAnimationFrame(() =>
      window.scrollTo(0, restoreScrollY),
    )
    return () => window.cancelAnimationFrame(frame)
  }, [isInitialLoading, location.state])
  const lastPage = [...pageOrder]
    .reverse()
    .map((key) => pages[key])
    .find(Boolean)
  const nextCursor = lastPage?.nextCursor ?? null
  const isDisconnected =
    !online || Object.values(pages).some((page) => page.fromCache)

  async function handleCancelAssignment() {
    if (!accepted || cancellingAssignment) return
    const reason = cancellationReason.trim().replace(/\s+/g, ' ')
    if (reason.length < 10 || reason.length > 500) {
      setAssignmentError('Informe o motivo do cancelamento em 10 a 500 caracteres.')
      return
    }
    setCancellingAssignment(true)
    setAssignmentError('')
    try {
      const result = await serviceRequestService.cancelAssignment({
        requestId: accepted.opportunity.requestId,
        expectedAssignmentId: accepted.assignmentId,
        reason,
      })
      setAccepted(null)
      setConfirmCancellation(false)
      setCancellationReason('')
      setCancellationNotice(
        result.replacementSearchOpen
          ? 'Atendimento cancelado. A procura por substituto foi iniciada.'
          : 'Atendimento cancelado. O prazo de aceite terminou e o pedido ficou pendente para intervenção ou reagendamento.',
      )
      navigate(location.pathname, { replace: true })
    } catch (error) {
      setAssignmentError(
        error instanceof Error
          ? error.message
          : 'Não foi possível cancelar este atendimento.',
      )
    } finally {
      setCancellingAssignment(false)
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

        {recoveringAssignment ? (
          <div role="status" aria-label="Recuperando atendimento">
            <Skeleton className="h-40" />
          </div>
        ) : null}

        {cancellationNotice ? (
          <Alert variant="success" aria-live="polite">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Cancelamento confirmado</AlertTitle>
            <AlertDescription>{cancellationNotice}</AlertDescription>
          </Alert>
        ) : null}

        {accepted ? (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                <CalendarClock aria-hidden="true" className="size-3.5" />
                Compromisso existente
              </Badge>
              <CardTitle>Atendimento confirmado</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                {specialtyNames.get(accepted.opportunity.specialtyId) ?? 'Serviço'} ·{' '}
                {formatServiceDate(accepted.opportunity.serviceDate)} ·{' '}
                {SERVICE_PERIOD_DEFINITIONS[accepted.opportunity.period].label}
              </p>
              {assignmentError ? (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  <AlertTitle>Não foi possível atualizar o atendimento</AlertTitle>
                  <AlertDescription>{assignmentError}</AlertDescription>
                </Alert>
              ) : null}
              {confirmCancellation ? (
                <Alert variant="warning">
                  <AlertTriangle aria-hidden="true" />
                  <AlertTitle>Cancelar este atendimento?</AlertTitle>
                  <AlertDescription>
                    <p>
                      A atribuição será encerrada e a reserva liberada somente após a confirmação do servidor.
                    </p>
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="professional-cancellation-reason">
                        Motivo do cancelamento *
                      </Label>
                      <Textarea
                        id="professional-cancellation-reason"
                        required
                        minLength={10}
                        maxLength={500}
                        value={cancellationReason}
                        aria-invalid={
                          cancellationReason.trim().length > 0 &&
                          cancellationReason.trim().length < 10
                        }
                        placeholder="Explique por que não poderá realizar o atendimento."
                        onChange={(event) => {
                          setCancellationReason(event.target.value)
                          setAssignmentError('')
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
                        loading={cancellingAssignment}
                        loadingLabel="Cancelando…"
                        onClick={() => void handleCancelAssignment()}
                      >
                        Confirmar cancelamento
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={cancellingAssignment}
                        onClick={() => {
                          setConfirmCancellation(false)
                          setAssignmentError('')
                        }}
                      >
                        Manter atendimento
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmCancellation(true)}
                  >
                    Cancelar atendimento
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : assignmentError && recoveredRequestId ? (
          <Alert variant="destructive" role="alert">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Atendimento indisponível</AlertTitle>
            <AlertDescription>{assignmentError}</AlertDescription>
          </Alert>
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
                  const specialty =
                    specialtyNames.get(opportunity.specialtyId) ?? 'Serviço profissional'
                  const category = categoryNames.get(opportunity.categoryId)
                  const municipality =
                    municipalityNames.get(opportunity.cityIbgeCode) ??
                    `Município IBGE ${opportunity.cityIbgeCode}`

                  return (
                    <ProfessionalOpportunityCard
                      key={opportunity.requestId}
                      opportunity={opportunity}
                      category={category}
                      specialty={specialty}
                      municipality={municipality}
                      returnTo={`${location.pathname}${location.search}`}
                      scrollY={window.scrollY}
                    />
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
