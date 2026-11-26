import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CalendarClock,
  ClipboardList,
  FileWarning,
  History,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  UserRound,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { ActivityTimeline, type ActivityItem } from '../../../components/ui/activity-timeline'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import { serviceRequestService } from '../../../services/service-request.service'
import type { ServiceReport } from '../../../types/service-report'
import type {
  ClientRequestPage,
  ClientRequestPageCursor,
  ClientRequestTrackingDetails,
  ServiceRequestEvent,
} from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'
import { formatCalendarDate, formatServiceHours } from '../../../utils/service-date-display'
import { ClientServiceReports } from '../../service-reports/components/ClientServiceReports'
import {
  clientRequestStatus,
  clientRequestStatusVariant,
  requestGuidance,
} from '../client-request-display'
import { ClientRequestCard } from '../components/ClientRequestCard'
import { ConfirmedProfessionalCard } from '../components/ConfirmedProfessionalCard'

const PAGE_SIZE = 10

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function specialtyName(
  specialtyId: string,
  catalogState: ReturnType<typeof useCatalog>,
) {
  if (catalogState.status !== 'ready') return 'Serviço solicitado'
  return catalogState.catalog.specialties.find((item) => item.id === specialtyId)?.name
    ?? 'Serviço solicitado'
}

const requestEvents: Partial<Record<ServiceRequestEvent['type'], Pick<ActivityItem, 'title' | 'icon'>>> = {
  REQUEST_CREATED: { title: 'Pedido criado', icon: ClipboardList },
  REQUEST_EDITED: { title: 'Pedido atualizado', icon: Pencil },
  REQUEST_CANCELLED: { title: 'Pedido cancelado', icon: XCircle },
  REQUEST_ASSIGNED: { title: 'Atendimento confirmado', icon: CheckCircle2 },
  PROFESSIONAL_CANCELLED_AND_REOPENED: { title: 'Atendimento cancelado pelo profissional. Busca por substituto iniciada.', icon: RefreshCw },
  SERVICE_STARTED: { title: 'Atendimento iniciado', icon: Play },
  SERVICE_COMPLETED: { title: 'Conclusão informada pelo profissional', icon: CheckCircle2 },
  ADMIN_REOPENED_FROM_REPORT: { title: 'Pedido reaberto pela administração', icon: RefreshCw },
}

function timelineItems(history: ServiceRequestEvent[], reports: ServiceReport[]) {
  const eventItems = history.flatMap<ActivityItem>((event) => {
    const presentation = requestEvents[event.type]
    return presentation ? [{ id: `event:${event.eventId}`, ...presentation, at: event.createdAt }] : []
  })
  const reportItems = reports.flatMap<ActivityItem>((report) => {
    const items: ActivityItem[] = [{
      id: `report:${report.reportId}:open`,
      title: 'Relato aberto',
      icon: FileWarning,
      detail: report.description,
      at: report.createdAt,
    }]
    if (report.reviewedAt) items.push({
      id: `report:${report.reportId}:review`,
      title: 'Relato em análise',
      icon: FileWarning,
      at: report.reviewedAt,
    })
    if (report.proposedAt && report.proposedServiceDate && report.proposedPeriod) items.push({
      id: `report:${report.reportId}:proposed`,
      title: 'Novo horário proposto',
      icon: CalendarClock,
      detail: `${formatCalendarDate(report.proposedServiceDate)} · ${SERVICE_PERIOD_DEFINITIONS[report.proposedPeriod].label}`,
      at: report.proposedAt,
    })
    if (report.clientAcknowledgedAt) items.push({
      id: `report:${report.reportId}:acknowledged`,
      title: 'Novo horário reconhecido pelo cliente',
      icon: CalendarClock,
      at: report.clientAcknowledgedAt,
    })
    if (report.resolvedAt) items.push({
      id: `report:${report.reportId}:resolved`,
      title: report.resolutionDecision === 'RESCHEDULE_AND_REOPEN' ? 'Relato resolvido com reagendamento' : 'Relato resolvido',
      icon: report.resolutionDecision === 'RESCHEDULE_AND_REOPEN' ? CalendarClock : CheckCircle2,
      detail: report.resolutionJustification ?? undefined,
      at: report.resolvedAt,
    })
    return items
  })
  return [...eventItems, ...reportItems].sort((first, second) => second.at.getTime() - first.at.getTime())
}

export function ClientRequestsPage() {
  const { requestId } = useParams<{ requestId?: string }>()
  const { user } = useAuth()
  const { profile } = useProfile()
  const catalogState = useCatalog()
  useDocumentTitle(requestId ? 'Detalhe do pedido — ProFind' : 'Meus pedidos — ProFind')

  return (
    <ClientLayout
      pageTitle={requestId ? 'Detalhe do pedido' : 'Meus pedidos'}
      heading={requestId ? { description: 'Acompanhe a situação e o histórico do atendimento.' } : {
        description: 'Acompanhe o andamento dos seus pedidos.',
        action: <Button asChild><Link to="/cliente/solicitar"><Plus aria-hidden="true" />Solicitar serviço</Link></Button>,
      }}
      activeNavigationHref="/cliente/pedidos"
      userName={profile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      {requestId ? (
        <RequestDetails
          key={`${user?.uid ?? 'signed-out'}:${requestId}`}
          requestId={requestId}
          userId={user?.uid}
          catalogState={catalogState}
        />
      ) : (
        <RequestsList
          key={user?.uid ?? 'signed-out'}
          userId={user?.uid}
          catalogState={catalogState}
        />
      )}
    </ClientLayout>
  )
}

function RequestsList({
  userId,
  catalogState,
}: {
  userId?: string
  catalogState: ReturnType<typeof useCatalog>
}) {
  const [page, setPage] = useState<ClientRequestPage | null>(null)
  const [cursor, setCursor] = useState<ClientRequestPageCursor | null>(null)
  const [previous, setPrevious] = useState<Array<ClientRequestPageCursor | null>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setPage(null)
      setLoading(true)
      setError('')
    })
    if (!userId) return () => { active = false }
    let unsubscribe: () => void = () => undefined
    try {
      unsubscribe = serviceRequestService.subscribeOwnRequests({
        pageSize: PAGE_SIZE,
        cursor,
        onPage(snapshot) {
          if (!active) return
          setPage(snapshot.page)
          setFromCache(snapshot.fromCache)
          setLoading(false)
          setError('')
        },
        onError(nextError) {
          if (!active) return
          setLoading(false)
          setError(nextError.message)
        },
      })
    } catch (nextError) {
      queueMicrotask(() => {
        if (!active) return
        setLoading(false)
        setError(errorMessage(nextError, 'Não foi possível carregar seus pedidos.'))
      })
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [attempt, cursor, userId])

  function nextPage() {
    if (!page?.nextCursor) return
    setPrevious((items) => [...items, cursor])
    setCursor(page.nextCursor)
  }

  function previousPage() {
    setPrevious((items) => {
      const copy = [...items]
      setCursor(copy.pop() ?? null)
      return copy
    })
  }

  return (
    <div className="grid gap-6">
      {fromCache ? (
        <Alert variant="warning"><WifiOff aria-hidden="true" /><AlertTitle>Mostrando dados salvos</AlertTitle><AlertDescription>Os estados abaixo podem estar desatualizados e não confirmam a situação atual. A lista será atualizada quando a conexão voltar.</AlertDescription></Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription><p>{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}><RefreshCw aria-hidden="true" />Tentar novamente</Button></AlertDescription></Alert>
      ) : null}
      {loading ? (
        <div role="status" aria-label="Carregando pedidos" className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      ) : null}
      {!loading && !error && page?.items.length === 0 ? (
        <EmptyState title="Você ainda não tem pedidos" description="Solicite um serviço para acompanhar o atendimento por aqui." />
      ) : null}
      {!loading && page?.items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {page.items.map((item) => <ClientRequestCard key={item.request.requestId} item={item} specialtyName={specialtyName(item.request.specialtyId, catalogState)} stale={fromCache || Boolean(error)} />)}
        </div>
      ) : null}
      {!loading && (previous.length > 0 || page?.nextCursor) ? (
        <nav aria-label="Páginas de pedidos" className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" disabled={!previous.length} onClick={previousPage}><ChevronLeft aria-hidden="true" />Anteriores</Button>
          <span className="text-sm text-muted-foreground">Página {previous.length + 1}</span>
          <Button variant="outline" disabled={!page?.nextCursor} onClick={nextPage}>Próximos<ChevronRight aria-hidden="true" /></Button>
        </nav>
      ) : null}
    </div>
  )
}

function RequestDetails({
  requestId,
  userId,
  catalogState,
}: {
  requestId: string
  userId?: string
  catalogState: ReturnType<typeof useCatalog>
}) {
  const [details, setDetails] = useState<ClientRequestTrackingDetails | null>(null)
  const [reports, setReports] = useState<ServiceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profileWarning, setProfileWarning] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setDetails(null)
      setReports([])
      setLoading(true)
      setError('')
      setProfileWarning('')
    })
    if (!userId) return () => { active = false }
    let unsubscribe: () => void = () => undefined
    try {
      unsubscribe = serviceRequestService.subscribeOwnRequestTracking({
        requestId,
        onDetails(snapshot) {
          if (!active) return
          setDetails(snapshot.details)
          setFromCache(snapshot.fromCache)
          setLoading(false)
          setError('')
        },
        onProfileError() {
          if (active) setProfileWarning('O perfil do profissional não pôde ser carregado agora.')
        },
        onError(nextError) {
          if (!active) return
          setLoading(false)
          setError(nextError.message)
        },
      })
    } catch (nextError) {
      queueMicrotask(() => {
        if (!active) return
        setLoading(false)
        setError(errorMessage(nextError, 'Não foi possível abrir este pedido.'))
      })
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [attempt, requestId, userId])

  const timeline = useMemo(() => timelineItems(details?.history ?? [], reports), [details?.history, reports])

  if (loading) return <div role="status" aria-label="Carregando detalhe do pedido" className="grid gap-4"><Skeleton className="h-44" /><Skeleton className="h-72" /></div>
  if (error || !details) return (
    <div className="grid gap-4">
      <Button asChild variant="ghost" className="w-fit"><Link to="/cliente/pedidos"><ArrowLeft aria-hidden="true" />Voltar</Link></Button>
      <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Pedido indisponível</AlertTitle><AlertDescription><p>{error || 'Este pedido não foi encontrado ou não pertence à sua conta.'}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}><RefreshCw aria-hidden="true" />Tentar novamente</Button></AlertDescription></Alert>
    </div>
  )

  const { request, privateData } = details
  const currentProfessional = request.currentAssignmentId && request.assignedProfessionalId
    && details.currentProfessional?.professionalId === request.assignedProfessionalId
    && (request.status === 'ASSIGNED' || request.status === 'IN_PROGRESS' || request.status === 'COMPLETED')
    ? details.currentProfessional
    : null
  const guidance = requestGuidance(request)
  const canEdit = request.status === 'OPEN'
  const canCancel = request.status === 'OPEN' || request.status === 'ASSIGNED'

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" className="w-fit"><Link to="/cliente/pedidos"><ArrowLeft aria-hidden="true" />Meus pedidos</Link></Button>
      {fromCache ? <Alert variant="warning"><WifiOff aria-hidden="true" /><AlertTitle>Dados salvos no dispositivo</AlertTitle><AlertDescription>Este estado pode estar desatualizado e não confirma a situação atual. As alterações mais recentes aparecerão quando a conexão for restabelecida.</AlertDescription></Alert> : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pedido #{request.requestId.slice(-8)}</p><CardTitle className="mt-1">{specialtyName(request.specialtyId, catalogState)}</CardTitle></div>
            {fromCache ? <Badge variant="outline"><WifiOff aria-hidden="true" className="size-3.5" />Estado salvo</Badge> : <Badge variant={clientRequestStatusVariant(request)}>{clientRequestStatus(request)}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex gap-3"><CalendarDays aria-hidden="true" className="size-5 shrink-0 text-primary" /><div><dt className="font-semibold">Data</dt><dd className="mt-1 text-muted-foreground">{formatCalendarDate(request.serviceDate)}</dd></div></div>
            <div className="flex gap-3"><Clock3 aria-hidden="true" className="size-5 shrink-0 text-primary" /><div><dt className="font-semibold">Período</dt><dd className="mt-1 text-muted-foreground">{SERVICE_PERIOD_DEFINITIONS[request.period].label} · {formatServiceHours(request.period)}</dd></div></div>
          </dl>
          <div><h3 className="font-semibold">Descrição</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{privateData.notes}</p></div>
          {guidance ? <Alert variant="warning"><Clock3 aria-hidden="true" /><AlertTitle>Sobre a confirmação</AlertTitle><AlertDescription>{guidance}</AlertDescription></Alert> : null}
          {canEdit || canCancel ? <div className="flex flex-wrap gap-2">{canEdit ? <Button asChild variant="outline"><Link to={`/cliente/solicitar?pedido=${encodeURIComponent(request.requestId)}&acao=editar`}><Pencil aria-hidden="true" />Editar</Link></Button> : null}{canCancel ? <Button asChild variant="outline"><Link to={`/cliente/solicitar?pedido=${encodeURIComponent(request.requestId)}&acao=cancelar`}><XCircle aria-hidden="true" />Cancelar pedido</Link></Button> : null}</div> : null}
        </CardContent>
      </Card>

      {currentProfessional ? (
        <ConfirmedProfessionalCard key={currentProfessional.professionalId} professional={currentProfessional} specialty={specialtyName(request.specialtyId, catalogState)} warning={profileWarning} />
      ) : request.status === 'ASSIGNED' || request.status === 'IN_PROGRESS' || request.status === 'COMPLETED' ? (
        <Alert variant="warning"><UserRound aria-hidden="true" /><AlertTitle>Perfil indisponível</AlertTitle><AlertDescription>O pedido continua acompanhado normalmente. Os dados públicos do responsável não puderam ser exibidos.</AlertDescription></Alert>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History aria-hidden="true" className="size-5" />Linha do tempo</CardTitle></CardHeader>
        <CardContent><ActivityTimeline items={timeline} empty="O histórico aparecerá aqui." /></CardContent>
      </Card>

      <ClientServiceReports requestId={request.requestId} onReportsChange={setReports} />
    </div>
  )
}
