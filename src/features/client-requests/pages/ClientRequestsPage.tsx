import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Images,
  Pencil,
  RefreshCw,
  Star,
  UserRound,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
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
import { AdminImageViewer, type AdminReviewImage } from '../../admin/components/AdminImageViewer'
import { imageKitDisplayUrl } from '../../admin/components/admin-image-viewer.utils'
import { ClientServiceReports } from '../../service-reports/components/ClientServiceReports'
import {
  clientRequestStatus,
  clientRequestStatusVariant,
  formatServiceDate,
  requestGuidance,
} from '../client-request-display'
import { ClientRequestCard } from '../components/ClientRequestCard'

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

function eventLabel(event: ServiceRequestEvent) {
  const labels: Partial<Record<ServiceRequestEvent['type'], string>> = {
    REQUEST_CREATED: 'Pedido criado',
    REQUEST_EDITED: 'Pedido atualizado',
    REQUEST_CANCELLED: 'Pedido cancelado',
    REQUEST_ASSIGNED: 'Atendimento confirmado',
    PROFESSIONAL_CANCELLED_AND_REOPENED: 'Substituição iniciada',
    SERVICE_STARTED: 'Atendimento iniciado',
    SERVICE_COMPLETED: 'Conclusão informada pelo profissional',
    ADMIN_REOPENED_FROM_REPORT: 'Pedido reaberto pela administração',
  }
  return labels[event.type] ?? null
}

function formatMoment(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

type TimelineItem = { id: string; title: string; detail?: string; at: Date }

function timelineItems(history: ServiceRequestEvent[], reports: ServiceReport[]) {
  const eventItems = history.flatMap<TimelineItem>((event) => {
    const title = eventLabel(event)
    return title ? [{ id: `event:${event.eventId}`, title, at: event.createdAt }] : []
  })
  const reportItems = reports.flatMap<TimelineItem>((report) => {
    const items: TimelineItem[] = [{
      id: `report:${report.reportId}:open`,
      title: 'Relato aberto',
      detail: report.description,
      at: report.createdAt,
    }]
    if (report.reviewedAt) items.push({
      id: `report:${report.reportId}:review`,
      title: 'Relato em análise',
      at: report.reviewedAt,
    })
    if (report.resolvedAt) items.push({
      id: `report:${report.reportId}:resolved`,
      title: 'Relato resolvido',
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
      <div>
        <p className="text-sm text-muted-foreground">Acompanhe confirmações, substituições, conclusões e relatos em tempo real.</p>
      </div>
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
        <EmptyState title="Você ainda não tem pedidos" description="Solicite um serviço para acompanhar o atendimento por aqui." action={<Button asChild><Link to="/cliente/solicitar">Solicitar serviço</Link></Button>} />
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [viewerReturnFocus, setViewerReturnFocus] = useState<HTMLElement | null>(null)

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

  const portfolio = useMemo(
    () => details?.currentProfessional?.portfolioImages ?? [],
    [details?.currentProfessional?.portfolioImages],
  )
  const viewerImages = useMemo<AdminReviewImage[]>(() => portfolio.map((image, index) => ({
    url: image.url,
    alt: image.altText || `Trabalho ${index + 1} do profissional`,
    label: `Portfólio — imagem ${index + 1}`,
  })), [portfolio])
  const timeline = useMemo(() => timelineItems(details?.history ?? [], reports), [details?.history, reports])

  if (loading) return <div role="status" aria-label="Carregando detalhe do pedido" className="grid gap-4"><Skeleton className="h-44" /><Skeleton className="h-72" /></div>
  if (error || !details) return (
    <div className="grid gap-4">
      <Button asChild variant="ghost" className="w-fit"><Link to="/cliente/pedidos"><ArrowLeft aria-hidden="true" />Voltar</Link></Button>
      <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Pedido indisponível</AlertTitle><AlertDescription><p>{error || 'Este pedido não foi encontrado ou não pertence à sua conta.'}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}><RefreshCw aria-hidden="true" />Tentar novamente</Button></AlertDescription></Alert>
    </div>
  )

  const { request, privateData, currentProfessional } = details
  const guidance = requestGuidance(request)
  const canEdit = request.status === 'OPEN'
  const canCancel = request.status === 'OPEN' || request.status === 'ASSIGNED'
  const initials = currentProfessional?.publicName.split(/\s+/).slice(0, 2).map((value) => value[0]).join('').toUpperCase() || 'PF'
  const hasRatings = Boolean(
    currentProfessional
    && currentProfessional.rating !== null
    && currentProfessional.reviewCount !== null
    && currentProfessional.reviewCount > 0,
  )

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
            <div className="flex gap-3"><CalendarDays aria-hidden="true" className="size-5 text-primary" /><div><dt className="font-semibold">Data</dt><dd className="mt-1 capitalize text-muted-foreground">{formatServiceDate(request.serviceDate)}</dd></div></div>
            <div className="flex gap-3"><Clock3 aria-hidden="true" className="size-5 text-primary" /><div><dt className="font-semibold">Período</dt><dd className="mt-1 text-muted-foreground">{SERVICE_PERIOD_DEFINITIONS[request.period].label}</dd></div></div>
          </dl>
          <div><h3 className="font-semibold">Descrição</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{privateData.notes}</p></div>
          {guidance ? <Alert variant="warning"><Clock3 aria-hidden="true" /><AlertTitle>Sobre a confirmação</AlertTitle><AlertDescription>{guidance}</AlertDescription></Alert> : null}
          {canEdit || canCancel ? <div className="flex flex-wrap gap-2">{canEdit ? <Button asChild variant="outline"><Link to={`/cliente/solicitar?pedido=${encodeURIComponent(request.requestId)}&acao=editar`}><Pencil aria-hidden="true" />Editar</Link></Button> : null}{canCancel ? <Button asChild variant="outline"><Link to={`/cliente/solicitar?pedido=${encodeURIComponent(request.requestId)}&acao=cancelar`}><XCircle aria-hidden="true" />Cancelar pedido</Link></Button> : null}</div> : null}
        </CardContent>
      </Card>

      {currentProfessional ? (
        <Card>
          <CardHeader><CardTitle>Profissional responsável</CardTitle></CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="size-16"><AvatarImage src={currentProfessional.profileImage?.url} alt="" /><AvatarFallback>{initials}</AvatarFallback></Avatar>
              <div className="min-w-0"><h3 className="break-words text-lg font-bold">{currentProfessional.publicName || 'Profissional confirmado'}</h3><p className="text-sm text-muted-foreground">{specialtyName(request.specialtyId, catalogState)}</p>{currentProfessional.headline ? <p className="mt-1 text-sm">{currentProfessional.headline}</p> : null}<p className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><Star aria-hidden="true" className="size-4" />{hasRatings ? `${currentProfessional.rating!.toFixed(1)} (${currentProfessional.reviewCount} avaliações)` : 'Sem avaliações'}</p></div>
            </div>
            {profileWarning ? <Alert variant="warning"><AlertCircle aria-hidden="true" /><AlertDescription>{profileWarning} O acompanhamento do pedido continua disponível.</AlertDescription></Alert> : null}
            {portfolio.length ? <div><h3 className="flex items-center gap-2 font-semibold"><Images aria-hidden="true" className="size-4" />Portfólio</h3><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{portfolio.map((image, index) => failedImages.has(image.providerId) ? <div key={image.providerId} className="flex aspect-square items-center justify-center rounded-lg border bg-muted p-3 text-center text-xs text-muted-foreground">Imagem indisponível</div> : <button key={image.providerId} type="button" className="aspect-square overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25" aria-label={`Ampliar imagem ${index + 1} do portfólio`} onClick={(event) => { setViewerReturnFocus(event.currentTarget); setViewerIndex(index) }}><img src={imageKitDisplayUrl(image.url, 640)} alt={image.altText || `Trabalho ${index + 1}`} className="size-full object-cover" onError={() => setFailedImages((current) => new Set(current).add(image.providerId))} /></button>)}</div></div> : <p className="text-sm text-muted-foreground">Nenhuma imagem de portfólio disponível.</p>}
          </CardContent>
        </Card>
      ) : request.status === 'ASSIGNED' || request.status === 'IN_PROGRESS' || request.status === 'COMPLETED' ? (
        <Alert variant="warning"><UserRound aria-hidden="true" /><AlertTitle>Perfil indisponível</AlertTitle><AlertDescription>O pedido continua acompanhado normalmente. Os dados públicos do responsável não puderam ser exibidos.</AlertDescription></Alert>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History aria-hidden="true" className="size-5" />Linha do tempo</CardTitle></CardHeader>
        <CardContent>{timeline.length ? <ol className="grid gap-4">{timeline.map((item) => <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 text-primary" /><div><h3 className="font-semibold">{item.title}</h3><time className="text-xs text-muted-foreground" dateTime={item.at.toISOString()}>{formatMoment(item.at)}</time>{item.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.detail}</p> : null}</div></li>)}</ol> : <p className="text-sm text-muted-foreground">O histórico aparecerá aqui.</p>}</CardContent>
      </Card>

      <ClientServiceReports requestId={request.requestId} onReportsChange={setReports} />
      <AdminImageViewer images={viewerImages} index={viewerIndex} returnFocusTo={viewerReturnFocus} onIndexChange={setViewerIndex} />
    </div>
  )
}
