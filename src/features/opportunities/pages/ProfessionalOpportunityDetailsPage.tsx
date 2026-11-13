import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { serviceRequestService } from '../../../services/service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import {
  ServiceRequestError,
  type ProfessionalOpportunityDetails,
} from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

type RouteState = { returnTo?: string; scrollY?: number }

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
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
      <div className="mx-auto grid max-w-4xl gap-5">
        <div>
          <Button type="button" variant="ghost" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
            Voltar às oportunidades
          </Button>
        </div>

        {loading ? (
          <div role="status" className="grid gap-4">
            <span className="sr-only">Carregando detalhes da oportunidade…</span>
            <Skeleton className="h-40" />
            <Skeleton className="h-56" />
            <Skeleton className="h-40" />
          </div>
        ) : null}

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
              <Alert>
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Dados sem confirmação da rede</AlertTitle>
                <AlertDescription>
                  O aceite ficará disponível quando a versão atual for confirmada pelo servidor.
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  <Wrench aria-hidden="true" /> Serviço solicitado
                </Badge>
                <CardTitle>{names.specialty || 'Serviço solicitado'}</CardTitle>
                {names.category ? <CardDescription>{names.category}</CardDescription> : null}
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Descrição do trabalho</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                  {details.description}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  <MapPin aria-hidden="true" /> Localização
                </Badge>
                <CardTitle>{details.city} — {details.stateCode}</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <LockKeyhole aria-hidden="true" />
                  <AlertTitle>Endereço protegido</AlertTitle>
                  <AlertDescription>
                    O endereço completo estará disponível após a confirmação do aceite.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit">
                  <CalendarClock aria-hidden="true" /> Agendamento
                </Badge>
                <CardTitle>{formatDate(details.opportunity.serviceDate)}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold">Período</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {SERVICE_PERIOD_DEFINITIONS[details.opportunity.period].label}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Horário correspondente</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {SERVICE_PERIOD_DEFINITIONS[details.opportunity.period].startHour}:00 às{' '}
                      {SERVICE_PERIOD_DEFINITIONS[details.opportunity.period].endHour}:00
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold">Prazo para aceitar</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {formatDeadline(details.opportunity.acceptUntil)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {confirming ? (
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Confirmar este atendimento?</AlertTitle>
                <AlertDescription>
                  <p>
                    O aceite reserva este período na sua agenda. A transação validará novamente a rodada e sua elegibilidade.
                  </p>
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={accepting}
                      onClick={() => setConfirming(false)}
                    >
                      Continuar revisando
                    </Button>
                    <Button
                      type="button"
                      loading={accepting}
                      loadingLabel="Confirmando aceite…"
                      onClick={() => void accept()}
                    >
                      Confirmar aceite
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
              <Button
                type="button"
                disabled={!canAccept || confirming}
                onClick={() => setConfirming(true)}
              >
                Aceitar atendimento
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </ProfessionalLayout>
  )
}
