import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  ClockAlert,
  FileWarning,
  MapPin,
  Pencil,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { AppliedFilterList } from '../../../components/ui/applied-filters'
import { ActivityTimeline, type ActivityItem } from '../../../components/ui/activity-timeline'
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
import { NativeSelect } from '../../../components/ui/native-select'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useServiceToday } from '../../../hooks/use-service-today'
import { adminServiceRequestService } from '../../../services/admin-service-request.service'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import type {
  AdminRequestCursor,
  AdminRequestDetail,
  AdminEligibilityResult,
  AdminRequestFilters,
  AdminRequestListItem,
  AdminOperationalState,
  AdminPendingKind,
} from '../../../types/admin-service-request'
import {
  SERVICE_PERIODS,
  SERVICE_REQUEST_STATUSES,
  type ServicePeriod,
  type ServiceRequestEvent,
  type ServiceRequestStatus,
  type ServiceRequestSummary,
} from '../../../types/service-request'
import { formatPostalCode } from '../../../services/postal-code.service'
import { cn } from '../../../utils/cn'
import { formatCalendarDate, formatCompactServiceDate, formatServiceHours, formatServiceTimestamp as formatDateTime } from '../../../utils/service-date-display'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'

const STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  OPEN: 'Procurando profissional',
  ASSIGNED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
}

const OPERATIONAL_STATE_LABELS: Record<AdminOperationalState, string> = {
  ...STATUS_LABELS,
  OPEN: 'Procurando profissional',
  REPLACEMENT: 'Procurando substituto',
}

const PENDING_LABELS: Record<AdminPendingKind, string> = {
  ALL: 'Todas as pendências',
  WITHOUT_ACCEPTANCE: 'Ainda sem aceite',
  ACCEPTANCE_EXPIRED: 'Prazo de aceite encerrado',
  PERIOD_OVERDUE: 'Período vencido',
  OPEN_REPORT: 'Relato aberto ou em análise',
  RESTRICTED_PROFESSIONAL: 'Responsável restrito',
  NO_ELIGIBLE: 'Sem profissionais elegíveis (verificado)',
}

const EVENT_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'Pedido criado',
  REQUEST_EDITED: 'Pedido editado',
  REQUEST_CANCELLED: 'Pedido cancelado',
  REQUEST_ASSIGNED: 'Profissional confirmado',
  PROFESSIONAL_REFUSED: 'Profissional recusou a rodada',
  PROFESSIONAL_CANCELLED_AND_REOPENED: 'Cancelamento e procura de substituto',
  SERVICE_STARTED: 'Atendimento iniciado',
  SERVICE_COMPLETED: 'Conclusão informada pelo profissional',
  ADMIN_REOPENED_FROM_REPORT: 'Reabertura administrativa por relato',
}

const EVENT_ICONS: Record<ServiceRequestEvent['type'], ActivityItem['icon']> = {
  REQUEST_CREATED: ClipboardList,
  REQUEST_EDITED: Pencil,
  REQUEST_CANCELLED: XCircle,
  REQUEST_ASSIGNED: ShieldCheck,
  PROFESSIONAL_REFUSED: Ban,
  PROFESSIONAL_CANCELLED_AND_REOPENED: RefreshCw,
  SERVICE_STARTED: Play,
  SERVICE_COMPLETED: ShieldCheck,
  ADMIN_REOPENED_FROM_REPORT: FileWarning,
}

const ROUND_REASON_LABELS: Record<string, string> = {
  INITIAL: 'Rodada inicial',
  CLIENT_EDIT: 'Edição do cliente',
  PROFESSIONAL_CANCELLATION: 'Substituição após cancelamento',
  ADMIN_INTERVENTION: 'Intervenção administrativa por relato',
}

const ASSIGNMENT_END_LABELS: Record<string, string> = {
  PROFESSIONAL_CANCELLATION: 'Cancelamento do profissional',
  CLIENT_CANCELLATION: 'Cancelamento do cliente',
  ADMIN_INTERVENTION: 'Intervenção administrativa por relato',
  PROFESSIONAL_COMPLETION: 'Conclusão informada pelo profissional',
}

interface FilterForm {
  requestId: string
  status: '' | AdminOperationalState
  pending: '' | AdminPendingKind
  period: '' | ServicePeriod
  scheduledFrom: string
  scheduledTo: string
}

const filterFieldClass = 'grid min-w-0 content-start gap-2'

const EMPTY_FILTERS: FilterForm = {
  requestId: '',
  status: '',
  pending: '',
  period: '',
  scheduledFrom: '',
  scheduledTo: '',
}

function errorMessage(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Você está offline. Reconecte-se e tente carregar os pedidos novamente.'
  }
  return error instanceof Error
    ? error.message
    : 'Não foi possível carregar os pedidos. Tente novamente.'
}

function formatDate(value: string) {
  return formatCalendarDate(value, 'short')
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
  if (request.status === 'OPEN' && request.reopenReason !== null) {
    return 'Em procura de substituto'
  }
  return STATUS_LABELS[request.status]
}

function statusVariant(status: ServiceRequestStatus): BadgeProps['variant'] {
  if (status === 'COMPLETED') return 'success'
  if (status === 'CANCELLED') return 'destructive'
  if (status === 'OPEN') return 'outline'
  return 'secondary'
}

function withoutAcceptance(request: ServiceRequestSummary) {
  return request.status === 'OPEN' && !request.currentAssignmentId
}

function acceptanceExpired(request: ServiceRequestSummary) {
  return withoutAcceptance(request) && request.acceptUntil.getTime() <= Date.now()
}

function periodOverdue(request: ServiceRequestSummary) {
  return !['COMPLETED', 'CANCELLED'].includes(request.status)
    && request.periodStartAt.getTime() <= Date.now()
}

function RequestStatus({
  request,
  item,
}: {
  request: ServiceRequestSummary
  item?: AdminRequestListItem
}) {
  const expired = acceptanceExpired(request)
  const alerts = [
    expired ? 'Ainda sem aceite' : null,
    periodOverdue(request) ? 'Período vencido' : null,
    item?.openReportCount ? (item.openReportCount === 1 ? '1 relato pendente' : item.openReportCount + ' relatos pendentes') : null,
    item?.responsibleRestricted ? 'Responsável restrito' : null,
    item?.eligibilityVerification === 'NONE_FOUND' ? 'Sem profissionais elegíveis' : null,
  ].filter(Boolean)
  return (
    <div className="grid min-w-0 justify-items-start gap-1.5">
      <Badge variant={expired ? 'destructive' : statusVariant(request.status)} className="max-w-full whitespace-normal wrap-anywhere">
        {expired ? 'Prazo de aceite encerrado' : operationalLabel(request)}
      </Badge>
      {alerts.length ? (
        <ul className="grid gap-1 text-xs leading-5 text-muted-foreground">
          {alerts.map((alert) => <li key={alert}>{alert}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function LoadingCards({ list = false }: { list?: boolean }) {
  return (
    <div role="status" className={cn('grid gap-4', !list && 'lg:grid-cols-2')}>
      <span className="sr-only">Carregando pedidos…</span>
      <Skeleton className={list ? 'h-28' : 'h-56'} />
      <Skeleton className={list ? 'h-28' : 'h-56'} />
    </div>
  )
}

function AppliedFilters({ filters, onRemove }: { filters: FilterForm; onRemove: (key: keyof FilterForm) => void }) {
  const labels: [keyof FilterForm, string][] = [
    ['requestId', filters.requestId && `Código: ${filters.requestId}`],
    ['status', filters.status && `Estado: ${OPERATIONAL_STATE_LABELS[filters.status]}`],
    ['pending', filters.pending && filters.pending !== 'ALL' ? PENDING_LABELS[filters.pending] : ''],
    ['period', filters.period && `Período: ${SERVICE_PERIOD_DEFINITIONS[filters.period].label}`],
    ['scheduledFrom', filters.scheduledFrom && `De: ${formatDate(filters.scheduledFrom)}`],
    ['scheduledTo', filters.scheduledTo && `Até: ${formatDate(filters.scheduledTo)}`],
  ]
  return <AppliedFilterList items={labels} onRemove={onRemove} />
}

function RequestResults({ items, specialtyNames, detailBasePath }: {
  items: AdminRequestListItem[]
  specialtyNames: Map<string, string>
  detailBasePath: string
}) {
  const columns = ['Serviço', 'Município', 'Agendamento', 'Profissional responsável', 'Situação']
  const today = useServiceToday()

  return (
    <section aria-label="Resultados dos pedidos" className="@container min-w-0">
      <table role="table" aria-label="Pedidos" className="block w-full text-left text-sm lg:@min-[42rem]:table lg:@min-[42rem]:table-fixed lg:@min-[42rem]:border-separate lg:@min-[42rem]:border-spacing-0 lg:@min-[42rem]:rounded-lg lg:@min-[42rem]:border lg:@min-[42rem]:bg-card">
        <thead role="rowgroup" className="hidden lg:@min-[42rem]:table-header-group">
          <tr role="row" className="bg-muted text-xs text-muted-foreground">
            {columns.map((column) => (
              <th key={column} role="columnheader" scope="col" className="border-b px-4 py-3 font-semibold first:rounded-tl-lg last:w-[26%] last:rounded-tr-lg">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="grid gap-3 lg:@min-[42rem]:table-row-group">
          {items.map((item) => {
            const { request } = item
            return (
              <tr key={request.requestId} role="row" className="grid min-w-0 grid-cols-2 gap-3 rounded-lg border bg-card p-4 wrap-anywhere lg:@min-[42rem]:table-row lg:@min-[42rem]:rounded-none lg:@min-[42rem]:border-0 lg:@min-[42rem]:bg-transparent lg:@min-[42rem]:p-0 lg:@min-[42rem]:not-last:[&>td]:border-b">
                <td role="cell" className="col-span-full min-w-0 lg:@min-[42rem]:px-4 lg:@min-[42rem]:py-4 lg:@min-[42rem]:align-top">
                  <p className="font-semibold">{specialtyNames.get(request.specialtyId) ?? 'Serviço solicitado'}</p>
                  <Link to={`${detailBasePath}/${encodeURIComponent(request.requestId)}`} className="mt-0.5 inline-flex min-h-9 items-center rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                    Ver detalhes <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
                  </Link>
                </td>
                <td role="cell" className="min-w-0 lg:@min-[42rem]:px-4 lg:@min-[42rem]:py-4 lg:@min-[42rem]:align-top">
                  <span className="block text-xs text-muted-foreground lg:@min-[42rem]:hidden">Município</span>
                  {item.city} — {item.stateCode}
                </td>
                <td role="cell" className="min-w-0 lg:@min-[42rem]:px-4 lg:@min-[42rem]:py-4 lg:@min-[42rem]:align-top">
                  <span className="block text-xs text-muted-foreground lg:@min-[42rem]:hidden">Agendamento</span>
                  <time dateTime={request.serviceDate}>{formatCompactServiceDate(request.serviceDate, today)}</time> · {SERVICE_PERIOD_DEFINITIONS[request.period].label}
                </td>
                <td role="cell" className="col-span-full min-w-0 lg:@min-[42rem]:px-4 lg:@min-[42rem]:py-4 lg:@min-[42rem]:align-top">
                  <span className="block text-xs text-muted-foreground lg:@min-[42rem]:hidden">Profissional responsável</span>
                  {item.responsibleName || 'Ainda não definido'}
                </td>
                <td role="cell" className="col-span-full min-w-0 border-t pt-3 lg:@min-[42rem]:border-t-0 lg:@min-[42rem]:px-4 lg:@min-[42rem]:py-4 lg:@min-[42rem]:align-top">
                  <RequestStatus request={request} item={item} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function AdminRequestsList({ pendingMode }: { pendingMode: boolean }) {
  const { user } = useAuth()
  const catalogState = useCatalog()
  const initialFilters = useMemo<FilterForm>(() => ({
    ...EMPTY_FILTERS,
    pending: pendingMode ? 'ALL' : '',
  }), [pendingMode])
  const [form, setForm] = useState<FilterForm>(initialFilters)
  const [filters, setFilters] = useState<FilterForm>(initialFilters)
  const [items, setItems] = useState<AdminRequestListItem[]>([])
  const [cursor, setCursor] = useState<AdminRequestCursor | null>(null)
  const [previousCursors, setPreviousCursors] = useState<Array<AdminRequestCursor | null>>([])
  const [nextCursor, setNextCursor] = useState<AdminRequestCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useDocumentTitle(pendingMode ? 'Pendências administrativas — ProFind' : 'Pedidos administrativos — ProFind')

  useEffect(() => {
    let active = true
    const input: AdminRequestFilters = {
      ...(filters.requestId.trim() ? { requestId: filters.requestId.trim() } : {}),
      ...(filters.status ? { operationalState: filters.status } : {}),
      ...(filters.pending ? { pending: filters.pending } : {}),
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
  }, [cursor, filters, reload, user?.uid])

  const specialtyNames = useMemo(() => new Map(
    catalogState.status === 'ready'
      ? catalogState.catalog.specialties.map((item) => [item.id, item.name])
      : [],
  ), [catalogState])

  function resetPagination() {
    setCursor(null)
    setPreviousCursors([])
  }

  function removeFilter(key: keyof FilterForm) {
    const cleared = initialFilters[key]
    setForm((current) => current[key] === filters[key] ? { ...current, [key]: cleared } : current)
    setFilters((current) => ({ ...current, [key]: cleared }))
    resetPagination()
    document.getElementById('admin-requests-search')?.focus()
  }

  return (
    <AdminLayout
      pageTitle={pendingMode ? 'Pendências' : 'Pedidos'}
      heading={{
        title: pendingMode ? 'Pendências que exigem atenção' : 'Pedidos de todos os clientes',
        description: pendingMode ? 'Consulte a fila para ver os pedidos que precisam de atenção.' : 'Consulte os pedidos e acompanhe cada atendimento.',
      }}
      userName={user?.displayName || user?.email || 'Administrador ProFind'}
      activeNavigationHref={pendingMode ? '/admin/pendencias' : '/admin/pedidos'}
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Busque pelo código ou combine filtros para encontrar pedidos.</CardDescription>
          </CardHeader>
          <CardContent className="@container">
            <form
              className="grid min-w-0 gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                resetPagination()
                const requestId = form.requestId.trim()
                setForm({ ...form, requestId })
                setFilters({ ...form, requestId })
              }}
            >
              <div className={cn('grid gap-4 @min-[30rem]:grid-cols-2', pendingMode && '@min-[50rem]:grid-cols-3')}>
                <div className={filterFieldClass}>
                  <Label htmlFor="admin-request-id">Código do pedido</Label>
                  <Input id="admin-request-id" className="h-11" value={form.requestId} onChange={(event) => setForm((current) => ({ ...current, requestId: event.target.value }))} />
                </div>
                <div className={filterFieldClass}>
                  <Label htmlFor="admin-request-status">Estado</Label>
                  <NativeSelect className="h-11" id="admin-request-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FilterForm['status'] }))}>
                    <option value="">Todos</option>
                    {([...SERVICE_REQUEST_STATUSES, 'REPLACEMENT'] as AdminOperationalState[]).map((status) => <option key={status} value={status}>{OPERATIONAL_STATE_LABELS[status]}</option>)}
                  </NativeSelect>
                </div>
                {pendingMode ? (
                  <div className={filterFieldClass}>
                    <Label htmlFor="admin-request-pending">Pendência</Label>
                    <NativeSelect id="admin-request-pending" value={form.pending} onChange={(event) => setForm((current) => ({ ...current, pending: event.target.value as FilterForm['pending'] }))}>
                      {Object.entries(PENDING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </NativeSelect>
                  </div>
                ) : null}
              </div>
              <details className="group min-w-0 rounded-md border bg-surface-raised">
                <summary className="min-h-11 cursor-pointer rounded-md px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
                  <SlidersHorizontal className="ms-1 me-2 inline size-4 align-text-bottom text-muted-foreground" aria-hidden="true" />Mais filtros
                </summary>
                <div className="grid gap-4 px-4 pb-4 motion-safe:group-open:ui-enter @min-[36rem]:grid-cols-3">
                  <div className={filterFieldClass}>
                    <Label htmlFor="admin-request-period">Período</Label>
                    <NativeSelect id="admin-request-period" value={form.period} onChange={(event) => setForm((current) => ({ ...current, period: event.target.value as FilterForm['period'] }))}>
                      <option value="">Todos</option>
                      {SERVICE_PERIODS.map((period) => <option key={period} value={period}>{SERVICE_PERIOD_DEFINITIONS[period].label}</option>)}
                    </NativeSelect>
                  </div>
                  <div className={filterFieldClass}>
                    <Label htmlFor="admin-request-from">Agendado de</Label>
                    <Input id="admin-request-from" className="h-11" type="date" value={form.scheduledFrom} onChange={(event) => setForm((current) => ({ ...current, scheduledFrom: event.target.value }))} />
                  </div>
                  <div className={filterFieldClass}>
                    <Label htmlFor="admin-request-to">Agendado até</Label>
                    <Input id="admin-request-to" className="h-11" type="date" min={form.scheduledFrom || undefined} value={form.scheduledTo} onChange={(event) => setForm((current) => ({ ...current, scheduledTo: event.target.value }))} />
                  </div>
                </div>
              </details>
              <AppliedFilters filters={filters} onRemove={removeFilter} />
              <div className="flex min-w-0 flex-wrap items-center gap-4">
                <Button type="submit" id="admin-requests-search"><Search aria-hidden="true" /> Consultar</Button>
                <Button type="button" variant="outline" onClick={() => { setForm(initialFilters); resetPagination(); setFilters(initialFilters) }}>Limpar filtros</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {loading ? <LoadingCards list /> : null}
        {!loading && error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Não foi possível carregar os pedidos</AlertTitle>
            <AlertDescription><p>{error}</p><Button className="mt-4" variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription>
          </Alert>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <Card><EmptyState icon={<ClipboardList aria-hidden="true" />} title={pendingMode ? 'Nenhuma pendência nesta consulta' : 'Nenhum pedido nesta consulta'} description="Ajuste os filtros ou confira o código do pedido." /></Card>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <RequestResults items={items} specialtyNames={specialtyNames} detailBasePath={pendingMode ? '/admin/pendencias' : '/admin/pedidos'} />
        ) : null}
        {!loading && !error && !filters.requestId && (items.length > 0 || previousCursors.length > 0 || nextCursor) ? (
          <nav aria-label="Paginação dos pedidos" className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" disabled={previousCursors.length === 0} onClick={() => { const history = [...previousCursors]; const previous = history.pop() ?? null; setPreviousCursors(history); setCursor(previous) }}><ChevronLeft aria-hidden="true" /> Anterior</Button>
            <span className="text-sm text-muted-foreground">Página {previousCursors.length + 1}</span>
            <Button variant="outline" disabled={!nextCursor} onClick={() => { setPreviousCursors((history) => [...history, cursor]); setCursor(nextCursor) }}>Próxima <ChevronRight aria-hidden="true" /></Button>
          </nav>
        ) : null}
      </div>
    </AdminLayout>
  )
}

function AdminRequestDetailPage({
  requestId,
  pendingMode,
}: {
  requestId: string
  pendingMode: boolean
}) {
  const { user } = useAuth()
  const catalogState = useCatalog()
  const [detail, setDetail] = useState<AdminRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [eligibility, setEligibility] = useState<AdminEligibilityResult | null>(null)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [eligibilityError, setEligibilityError] = useState('')

  useDocumentTitle('Detalhe do pedido — ProFind')

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setLoading(true)
      setError(null)
      setDetail(null)
      setEligibility(null)
      setEligibilityError('')
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
  }, [reload, requestId, user?.uid])

  const specialtyName = catalogState.status === 'ready'
    ? catalogState.catalog.specialties.find((item) => item.id === detail?.request.specialtyId)?.name
    : undefined

  async function verifyEligibility() {
    if (eligibilityLoading) return
    setEligibilityLoading(true)
    setEligibilityError('')
    try {
      setEligibility(await adminServiceRequestService.verifyEligibility(requestId))
    } catch (verificationError) {
      setEligibilityError(errorMessage(verificationError))
    } finally {
      setEligibilityLoading(false)
    }
  }

  const basePath = pendingMode ? '/admin/pendencias' : '/admin/pedidos'

  return (
    <AdminLayout pageTitle="Detalhe do pedido" heading={{ description: 'Consulte o agendamento, o responsável e o histórico.' }} userName={user?.displayName || user?.email || 'Administrador ProFind'} activeNavigationHref={basePath}>
      <div className="grid gap-6">
        <div><Button asChild variant="link"><Link to={basePath}><ChevronLeft aria-hidden="true" /> Voltar para {pendingMode ? 'pendências' : 'pedidos'}</Link></Button></div>
        {loading ? <LoadingCards /> : null}
        {!loading && error ? (
          <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>Não foi possível carregar o pedido</AlertTitle><AlertDescription><p>{error}</p><Button className="mt-4" variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription></Alert>
        ) : null}
        {!loading && detail ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{specialtyName || detail.request.specialtyId}</CardTitle>
                <RequestStatus request={detail.request} />
              </CardHeader>
              <CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted-foreground">Data e período</dt><dd className="font-medium">{formatCalendarDate(detail.request.serviceDate)} · {SERVICE_PERIOD_DEFINITIONS[detail.request.period].label} ({formatServiceHours(detail.request.period)})</dd></div><div><dt className="text-muted-foreground">Criação</dt><dd className="font-medium">{formatDateTime(detail.createdAt)}</dd></div><div><dt className="text-muted-foreground">Última atualização</dt><dd className="font-medium">{formatDateTime(detail.updatedAt)}</dd></div><div><dt className="text-muted-foreground">Rodada atual</dt><dd className="font-medium">{detail.request.round}</dd></div></dl></CardContent>
            </Card>

            {detail.request.status === 'COMPLETED' ? (
              <Alert variant="success"><ShieldCheck aria-hidden="true" /><AlertTitle>Conclusão informada pelo profissional</AlertTitle><AlertDescription>A conclusão foi registrada pelo profissional e ainda não foi confirmada pelo cliente.</AlertDescription></Alert>
            ) : acceptanceExpired(detail.request) ? (
              <Alert variant="destructive"><ClockAlert aria-hidden="true" /><AlertTitle>Prazo de aceite encerrado</AlertTitle><AlertDescription>O pedido continua aberto e sem aceite. Esta sinalização não afirma ausência de profissionais elegíveis.</AlertDescription></Alert>
            ) : withoutAcceptance(detail.request) ? (
              <Alert><CalendarClock aria-hidden="true" /><AlertTitle>Pedido ainda sem aceite</AlertTitle><AlertDescription>O pedido ainda pode receber aceite. Use a verificação abaixo para saber se há profissionais elegíveis.</AlertDescription></Alert>
            ) : null}

            {periodOverdue(detail.request) ? (
              <Alert variant="destructive"><ClockAlert aria-hidden="true" /><AlertTitle>Período do atendimento vencido</AlertTitle><AlertDescription>O pedido ainda não foi concluído ou cancelado. Consulte o histórico para acompanhar o que aconteceu.</AlertDescription></Alert>
            ) : null}

            {detail.responsibleRestricted ? (
              <Alert variant="warning"><Ban aria-hidden="true" /><AlertTitle>Responsável com acesso operacional restrito</AlertTitle><AlertDescription>O atendimento continua vinculado ao profissional. Consulte os relatos antes de decidir como prosseguir.</AlertDescription></Alert>
            ) : null}

            {detail.request.status === 'OPEN' ? (
              <Card>
                <CardHeader><CardTitle>Profissionais elegíveis</CardTitle><CardDescription>Verifique quem pode aceitar este pedido agora.</CardDescription></CardHeader>
                <CardContent className="grid gap-3">
                  {eligibility?.verification === 'ELIGIBLE_FOUND' ? <Alert variant="success"><ShieldCheck aria-hidden="true" /><AlertTitle>Há profissional elegível</AlertTitle><AlertDescription>{eligibility.eligibleProfessionalIds.length} profissional(is) elegível(is) entre {eligibility.checkedProfessionals} verificado(s). Isso não garante aceite.</AlertDescription></Alert> : null}
                  {eligibility?.verification === 'NONE_FOUND' ? <Alert variant="destructive"><Ban aria-hidden="true" /><AlertTitle>Sem profissionais elegíveis</AlertTitle><AlertDescription>A ausência foi verificada entre todos os {eligibility.checkedProfessionals} perfis operacionais ativos aprovados encontrados.</AlertDescription></Alert> : null}
                  {eligibility?.verification === 'INCONCLUSIVE' ? <Alert variant="warning"><AlertTriangle aria-hidden="true" /><AlertTitle>Verificação inconclusiva</AlertTitle><AlertDescription>O limite seguro de {eligibility.checkedProfessionals} profissionais foi atingido; não é possível afirmar ausência de elegíveis.</AlertDescription></Alert> : null}
                  {eligibilityError ? <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertDescription>{eligibilityError}</AlertDescription></Alert> : null}
                  <Button type="button" variant="outline" className="w-full sm:w-fit" loading={eligibilityLoading} loadingLabel="Verificando…" onClick={() => void verifyEligibility()}>
                    <Search aria-hidden="true" /> Verificar elegibilidade agora
                  </Button>
                </CardContent>
              </Card>
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
              <CardHeader><CardTitle>Rodadas e atribuições</CardTitle><CardDescription>Veja quem recebeu ou assumiu o pedido em cada rodada.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                {detail.rounds.map((round) => <div key={round.roundId} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Rodada {round.round}</strong><Badge variant={round.status === 'OPEN' ? 'warning' : 'outline'}>{round.status === 'OPEN' ? 'Aberta' : 'Encerrada'}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{ROUND_REASON_LABELS[round.reason] || round.reason}</p><p className="mt-2 text-xs text-muted-foreground">Aberta em {formatDateTime(round.openedAt)}{round.closedAt ? ` · encerrada em ${formatDateTime(round.closedAt)}` : ''}</p></div>)}
                {detail.rounds.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma rodada registrada.</p> : null}
                {detail.assignments.map((assignment) => <div key={assignment.assignmentId} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{assignment.professionalName || assignment.professionalId}</strong><Badge variant={assignment.status === 'ACTIVE' ? 'success' : 'outline'}>{assignment.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">Rodada {assignment.round} · aceite em {formatDateTime(assignment.acceptedAt)}</p>{assignment.endedReason ? <p className="mt-2 text-sm">Encerramento: {ASSIGNMENT_END_LABELS[assignment.endedReason] || assignment.endedReason}</p> : null}</div>)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle><FileWarning className="mr-2 inline size-5" aria-hidden="true" /> Relatos e intervenções</CardTitle><CardDescription>Abra um relato para consultar a decisão ou registrar o próximo passo.</CardDescription></CardHeader>
              <CardContent className="grid gap-4">
                {detail.relatedReports.length ? (
                  <ol className="grid gap-3">
                    {detail.relatedReports.map((report) => (
                      <li key={report.reportId} className="flex flex-col justify-between gap-3 rounded-md border p-4 sm:flex-row sm:items-center">
                        <div><strong>{report.reason}</strong><p className="mt-1 text-sm text-muted-foreground">{report.status} · {formatDateTime(report.createdAt)}</p></div>
                        <Button asChild variant="outline" size="sm"><Link to={`/admin/relatos/${encodeURIComponent(report.reportId)}`}>{report.status === 'RESOLVED' ? 'Consultar resolução' : 'Analisar e resolver'}</Link></Button>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">Nenhum relato vinculado a este pedido.</p>}
                <Button asChild variant="outline" className="w-full sm:w-fit"><Link to={`/admin/relatos?pedido=${encodeURIComponent(detail.request.requestId)}`}>Consultar relatos deste pedido</Link></Button>

              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Histórico</CardTitle><CardDescription>Últimas 50 movimentações, da mais recente para a mais antiga.</CardDescription></CardHeader>
              <CardContent>
                <ActivityTimeline items={detail.history.map((event) => ({
                  id: event.eventId,
                  title: EVENT_LABELS[event.type] || event.type,
                  icon: EVENT_ICONS[event.type] || ClipboardList,
                  at: event.createdAt,
                  detail: <><p>Rodada {event.round}</p>{event.reason ? <p className="mt-2">{event.reason}</p> : null}<details className="mt-2 text-xs"><summary className="cursor-pointer">Dados do evento</summary><p className="mt-1">Autor: {event.actorId}</p></details></>,
                }))} />
              </CardContent>
            </Card>

            <details className="rounded-md border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Dados do pedido</summary>
              <p className="mt-3 text-muted-foreground">Código do pedido</p>
              <p className="mt-1 font-mono wrap-anywhere">{detail.request.requestId}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(detail.request.requestId)
                  toast.success('Código copiado.')
                } catch {
                  toast.error('Selecione o código acima para copiar.')
                }
              }}><Copy aria-hidden="true" /> Copiar código</Button>
            </details>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

export function AdminServiceRequestsPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const location = useLocation()
  const pendingMode = location.pathname.startsWith('/admin/pendencias')
  return requestId
    ? <AdminRequestDetailPage requestId={requestId} pendingMode={pendingMode} />
    : <AdminRequestsList key={pendingMode ? 'pending' : 'requests'} pendingMode={pendingMode} />
}
