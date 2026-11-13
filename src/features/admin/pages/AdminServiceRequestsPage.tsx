import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClockAlert,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge, type BadgeProps } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { adminServiceRequestService } from '../../../services/admin-service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import type {
  AdminRequestCursor,
  AdminRequestDetail,
  AdminRequestFilters,
  AdminRequestListItem,
} from '../../../types/admin-service-request'
import {
  SERVICE_PERIODS,
  SERVICE_REQUEST_STATUSES,
  type ServicePeriod,
  type ServiceRequestStatus,
  type ServiceRequestSummary,
} from '../../../types/service-request'
import { formatPostalCode } from '../../../services/postal-code.service'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'

const STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  OPEN: 'Procurando profissional',
  ASSIGNED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
}

const EVENT_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'Pedido criado',
  REQUEST_EDITED: 'Pedido editado',
  REQUEST_CANCELLED: 'Pedido cancelado',
  REQUEST_ASSIGNED: 'Profissional confirmado',
  PROFESSIONAL_REFUSED: 'Profissional recusou a rodada',
  PROFESSIONAL_CANCELLED_AND_REOPENED: 'Cancelamento e procura de substituto',
  SERVICE_STARTED: 'Atendimento iniciado',
}

const ROUND_REASON_LABELS: Record<string, string> = {
  INITIAL: 'Rodada inicial',
  CLIENT_EDIT: 'Edição do cliente',
  PROFESSIONAL_CANCELLATION: 'Substituição após cancelamento',
}

interface FilterForm {
  requestId: string
  status: '' | ServiceRequestStatus
  period: '' | ServicePeriod
  scheduledFrom: string
  scheduledTo: string
}

const EMPTY_FILTERS: FilterForm = {
  requestId: '',
  status: '',
  period: '',
  scheduledFrom: '',
  scheduledTo: '',
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Não foi possível carregar os pedidos. Tente novamente.'
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Não informada'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
}

function formatDateTime(value: Date | null | undefined) {
  if (!value || Number.isNaN(value.getTime())) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(value)
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return value || 'Não informado'
}

function operationalLabel(request: ServiceRequestSummary) {
  if (request.status === 'OPEN' && request.reopenReason === 'PROFESSIONAL_CANCELLATION') {
    return 'Em procura de substituto'
  }
  return STATUS_LABELS[request.status]
}

function statusVariant(status: ServiceRequestStatus): BadgeProps['variant'] {
  if (status === 'COMPLETED') return 'success'
  if (status === 'CANCELLED') return 'destructive'
  if (status === 'OPEN') return 'warning'
  return status === 'IN_PROGRESS' ? 'default' : 'secondary'
}

function withoutAcceptance(request: ServiceRequestSummary) {
  return request.status === 'OPEN' && !request.currentAssignmentId
}

function acceptanceExpired(request: ServiceRequestSummary) {
  return withoutAcceptance(request) && request.acceptUntil.getTime() <= Date.now()
}

function RequestBadges({ request }: { request: ServiceRequestSummary }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={statusVariant(request.status)}>{operationalLabel(request)}</Badge>
      {withoutAcceptance(request) ? <Badge variant="outline">Ainda sem aceite</Badge> : null}
      {acceptanceExpired(request) ? (
        <Badge variant="destructive"><ClockAlert aria-hidden="true" /> Prazo de aceite encerrado</Badge>
      ) : null}
    </div>
  )
}

function LoadingCards() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4 lg:grid-cols-2">
      <span className="sr-only">Carregando pedidosâ€¦</span>
      <Skeleton className="h-56" />
      <Skeleton className="h-56" />
    </div>
  )
}

function RequestCard({
  item,
  specialtyName,
}: {
  item: AdminRequestListItem
  specialtyName: string
}) {
  const request = item.request
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="break-all font-mono text-xs text-muted-foreground">{request.requestId}</p>
            <CardTitle className="mt-2">{specialtyName}</CardTitle>
          </div>
          <RequestBadges request={request} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Município</dt><dd className="font-medium">{item.city} — {item.stateCode}</dd></div>
          <div><dt className="text-muted-foreground">Data e período</dt><dd className="font-medium">{formatDate(request.serviceDate)} · {SERVICE_PERIOD_DEFINITIONS[request.period].label}</dd></div>
          <div><dt className="text-muted-foreground">Criação</dt><dd className="font-medium">{formatDateTime(item.createdAt)}</dd></div>
          <div><dt className="text-muted-foreground">Responsável atual</dt><dd className="font-medium">{item.responsibleName || 'Ainda não definido'}</dd></div>
        </dl>
        <Button asChild variant="outline" className="w-full sm:w-fit">
          <Link to={`/admin/pedidos/${encodeURIComponent(request.requestId)}`}>Ver detalhes</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function AdminRequestsList() {
  const { user } = useAuth()
  const catalogState = useCatalog()
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<FilterForm>(EMPTY_FILTERS)
  const [items, setItems] = useState<AdminRequestListItem[]>([])
  const [cursor, setCursor] = useState<AdminRequestCursor | null>(null)
  const [previousCursors, setPreviousCursors] = useState<Array<AdminRequestCursor | null>>([])
  const [nextCursor, setNextCursor] = useState<AdminRequestCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useDocumentTitle('Pedidos administrativos — ProFind')

  useEffect(() => {
    let active = true
    const input: AdminRequestFilters = {
      ...(filters.requestId.trim() ? { requestId: filters.requestId.trim() } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.period ? { period: filters.period } : {}),
      ...(filters.scheduledFrom ? { scheduledFrom: filters.scheduledFrom } : {}),
      ...(filters.scheduledTo ? { scheduledTo: filters.scheduledTo } : {}),
      pageSize: 12,
      cursor,
    }
    void Promise.resolve().then(() => {
      if (!active) return
      setLoading(true)
      setError(null)
      return adminServiceRequestService.listRequests(input).then(
        (page) => {
          if (!active) return
          setItems(page.items)
          setNextCursor(page.nextCursor)
          setLoading(false)
        },
        (loadError: unknown) => {
          if (!active) return
          setItems([])
          setNextCursor(null)
          setError(errorMessage(loadError))
          setLoading(false)
        },
      )
    })
    return () => {
      active = false
    }
  }, [cursor, filters, reload])

  const specialtyNames = useMemo(() => new Map(
    catalogState.status === 'ready'
      ? catalogState.catalog.specialties.map((item) => [item.id, item.name])
      : [],
  ), [catalogState])

  function resetPagination() {
    setCursor(null)
    setPreviousCursors([])
  }

  return (
    <AdminLayout
      pageTitle="Pedidos"
      userName={user?.displayName || user?.email || 'Administrador ProFind'}
      activeNavigationHref="/admin/pedidos"
    >
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-semibold text-primary">Acompanhamento operacional</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Pedidos de todos os clientes</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Consulte o ciclo dos pedidos e as pendências de aceite. Esta entrega não altera atendimentos.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>As consultas são paginadas e limitadas a 12 pedidos por vez.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
              onSubmit={(event) => {
                event.preventDefault()
                resetPagination()
                setFilters({ ...form })
              }}
            >
              <div className="grid gap-2 md:col-span-2 xl:col-span-1">
                <Label htmlFor="admin-request-id">Identificador exato</Label>
                <Input id="admin-request-id" value={form.requestId} onChange={(event) => setForm((current) => ({ ...current, requestId: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-request-status">Estado</Label>
                <select id="admin-request-status" className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FilterForm['status'] }))}>
                  <option value="">Todos</option>
                  {SERVICE_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-request-period">Período</Label>
                <select id="admin-request-period" className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" value={form.period} onChange={(event) => setForm((current) => ({ ...current, period: event.target.value as FilterForm['period'] }))}>
                  <option value="">Todos</option>
                  {SERVICE_PERIODS.map((period) => <option key={period} value={period}>{SERVICE_PERIOD_DEFINITIONS[period].label}</option>)}
                </select>
              </div>
              <div className="grid gap-2"><Label htmlFor="admin-request-from">Agendado de</Label><Input id="admin-request-from" type="date" value={form.scheduledFrom} onChange={(event) => setForm((current) => ({ ...current, scheduledFrom: event.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="admin-request-to">Agendado até</Label><Input id="admin-request-to" type="date" min={form.scheduledFrom || undefined} value={form.scheduledTo} onChange={(event) => setForm((current) => ({ ...current, scheduledTo: event.target.value }))} /></div>
              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-5">
                <Button type="submit"><Search aria-hidden="true" /> Consultar</Button>
                <Button type="button" variant="outline" onClick={() => { setForm(EMPTY_FILTERS); resetPagination(); setFilters(EMPTY_FILTERS) }}>Limpar filtros</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {loading ? <LoadingCards /> : null}
        {!loading && error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Não foi possível carregar os pedidos</AlertTitle>
            <AlertDescription><p>{error}</p><Button className="mt-4" variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription>
          </Alert>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <Card><EmptyState icon={<ClipboardList aria-hidden="true" />} title="Nenhum pedido nesta consulta" description="Revise os filtros ou informe outro identificador exato." /></Card>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <>
            <section aria-label="Pedidos" className="grid gap-4 lg:grid-cols-2">
              {items.map((item) => <RequestCard key={item.request.requestId} item={item} specialtyName={specialtyNames.get(item.request.specialtyId) ?? item.request.specialtyId} />)}
            </section>
            {!filters.requestId ? (
              <nav aria-label="Paginação dos pedidos" className="flex items-center justify-between gap-3">
                <Button variant="outline" disabled={previousCursors.length === 0} onClick={() => { const history = [...previousCursors]; const previous = history.pop() ?? null; setPreviousCursors(history); setCursor(previous) }}><ChevronLeft aria-hidden="true" /> Anterior</Button>
                <span className="text-sm text-muted-foreground">Página {previousCursors.length + 1}</span>
                <Button variant="outline" disabled={!nextCursor} onClick={() => { setPreviousCursors((history) => [...history, cursor]); setCursor(nextCursor) }}>Próxima <ChevronRight aria-hidden="true" /></Button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

function AdminRequestDetailPage({ requestId }: { requestId: string }) {
  const { user } = useAuth()
  const catalogState = useCatalog()
  const [detail, setDetail] = useState<AdminRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useDocumentTitle('Detalhe do pedido — ProFind')

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setLoading(true)
      setError(null)
      setDetail(null)
      return adminServiceRequestService.getDetail(requestId).then(
        (value) => {
          if (!active) return
          setDetail(value)
          setLoading(false)
        },
        (loadError: unknown) => {
          if (!active) return
          setError(errorMessage(loadError))
          setLoading(false)
        },
      )
    })
    return () => {
      active = false
    }
  }, [reload, requestId])

  const specialtyName = catalogState.status === 'ready'
    ? catalogState.catalog.specialties.find((item) => item.id === detail?.request.specialtyId)?.name
    : undefined

  return (
    <AdminLayout pageTitle="Detalhe do pedido" userName={user?.displayName || user?.email || 'Administrador ProFind'} activeNavigationHref="/admin/pedidos">
      <div className="grid gap-6">
        <div><Button asChild variant="link"><Link to="/admin/pedidos"><ChevronLeft aria-hidden="true" /> Voltar para pedidos</Link></Button></div>
        {loading ? <LoadingCards /> : null}
        {!loading && error ? (
          <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>Não foi possível carregar o pedido</AlertTitle><AlertDescription><p>{error}</p><Button className="mt-4" variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription></Alert>
        ) : null}
        {!loading && detail ? (
          <>
            <Card>
              <CardHeader>
                <p className="break-all font-mono text-xs text-muted-foreground">{detail.request.requestId}</p>
                <CardTitle>{specialtyName || detail.request.specialtyId}</CardTitle>
                <RequestBadges request={detail.request} />
              </CardHeader>
              <CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted-foreground">Data e período</dt><dd className="font-medium">{formatDate(detail.request.serviceDate)} · {SERVICE_PERIOD_DEFINITIONS[detail.request.period].label}</dd></div><div><dt className="text-muted-foreground">Criação</dt><dd className="font-medium">{formatDateTime(detail.createdAt)}</dd></div><div><dt className="text-muted-foreground">Última atualização</dt><dd className="font-medium">{formatDateTime(detail.updatedAt)}</dd></div><div><dt className="text-muted-foreground">Rodada atual</dt><dd className="font-medium">{detail.request.round}</dd></div></dl></CardContent>
            </Card>

            {acceptanceExpired(detail.request) ? (
              <Alert variant="destructive"><ClockAlert aria-hidden="true" /><AlertTitle>Prazo de aceite encerrado</AlertTitle><AlertDescription>O pedido continua aberto e sem aceite. Esta sinalização não afirma ausência de profissionais elegíveis.</AlertDescription></Alert>
            ) : withoutAcceptance(detail.request) ? (
              <Alert><CalendarClock aria-hidden="true" /><AlertTitle>Pedido ainda sem aceite</AlertTitle><AlertDescription>A procura está aberta. A existência ou ausência de candidatos não foi verificada por esta consulta.</AlertDescription></Alert>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle><UserRound className="mr-2 inline size-5" aria-hidden="true" /> Cliente e responsável</CardTitle></CardHeader>
                <CardContent><dl className="grid gap-4 text-sm"><div><dt className="text-muted-foreground">Cliente</dt><dd className="font-medium">{detail.privateData.contactName}</dd></div><div><dt className="text-muted-foreground">Contato privado</dt><dd className="font-medium">{formatPhone(detail.privateData.contactPhone)}</dd></div><div><dt className="text-muted-foreground">Responsável atual</dt><dd className="font-medium">{detail.responsibleName || 'Ainda não definido'}</dd></div><div><dt className="text-muted-foreground">Observações do pedido</dt><dd className="whitespace-pre-wrap">{detail.privateData.notes}</dd></div></dl></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle><MapPin className="mr-2 inline size-5" aria-hidden="true" /> Endereço privado autorizado</CardTitle><CardDescription>Visível somente neste contexto administrativo protegido.</CardDescription></CardHeader>
                <CardContent><address className="text-sm leading-7 not-italic">{detail.privateData.address.street}, {detail.privateData.address.number}{detail.privateData.address.complement ? ` — ${detail.privateData.address.complement}` : ''}<br />{detail.privateData.address.neighborhood}<br />{detail.privateData.address.city} — {detail.privateData.address.stateCode}<br />CEP {formatPostalCode(detail.privateData.address.postalCode)} · IBGE {detail.privateData.address.ibgeCode}</address></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Rodadas e atribuições</CardTitle><CardDescription>Histórico operacional do pedido, sem controles de intervenção.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                {detail.rounds.map((round) => <div key={round.roundId} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Rodada {round.round}</strong><Badge variant={round.status === 'OPEN' ? 'warning' : 'outline'}>{round.status === 'OPEN' ? 'Aberta' : 'Encerrada'}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{ROUND_REASON_LABELS[round.reason] || round.reason}</p><p className="mt-2 text-xs text-muted-foreground">Aberta em {formatDateTime(round.openedAt)}{round.closedAt ? ` · encerrada em ${formatDateTime(round.closedAt)}` : ''}</p></div>)}
                {detail.rounds.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma rodada registrada.</p> : null}
                {detail.assignments.map((assignment) => <div key={assignment.assignmentId} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{assignment.professionalName || assignment.professionalId}</strong><Badge variant={assignment.status === 'ACTIVE' ? 'success' : 'outline'}>{assignment.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">Rodada {assignment.round} · aceite em {formatDateTime(assignment.acceptedAt)}</p>{assignment.endedReason ? <p className="mt-2 text-sm">Encerramento: {assignment.endedReason}</p> : null}</div>)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Histórico</CardTitle><CardDescription>Até 50 eventos imutáveis, do mais recente para o mais antigo.</CardDescription></CardHeader>
              <CardContent>
                <ol className="grid gap-3">
                  {detail.history.map((event) => <li key={event.eventId} className="rounded-md border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><strong>{EVENT_LABELS[event.type] || event.type}</strong><time className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</time></div><p className="mt-1 text-sm text-muted-foreground">Rodada {event.round} · ator {event.actorId}</p>{event.reason ? <p className="mt-2 text-sm">{event.reason}</p> : null}</li>)}
                  {detail.history.length === 0 ? <li className="text-sm text-muted-foreground">Nenhum evento registrado.</li> : null}
                </ol>
              </CardContent>
            </Card>

            <Alert><ShieldCheck aria-hidden="true" /><AlertTitle>Consulta administrativa</AlertTitle><AlertDescription>Reabertura, reagendamento, resolução de ocorrências e outras intervenções permanecem fora desta entrega parcial da #34.</AlertDescription></Alert>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

export function AdminServiceRequestsPage() {
  const { requestId } = useParams<{ requestId: string }>()
  return requestId
    ? <AdminRequestDetailPage requestId={requestId} />
    : <AdminRequestsList />
}
