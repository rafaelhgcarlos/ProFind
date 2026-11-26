import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  FileWarning,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { ConfirmationDialog } from '../../../components/ui/confirmation-dialog'
import { AppliedFilterList } from '../../../components/ui/applied-filters'
import { ActivityTimeline } from '../../../components/ui/activity-timeline'
import { formatCalendarDate, formatServiceHours, formatServiceTimestamp as formatDateTime } from '../../../utils/service-date-display'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { NativeSelect } from '../../../components/ui/native-select'
import { Skeleton } from '../../../components/ui/skeleton'
import { Textarea } from '../../../components/ui/textarea'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'
import { serviceReportService } from '../../../services/service-report.service'
import type {
  AdminServiceReportDetail,
  ServiceReport,
  ServiceReportDecision,
  ServiceReportStatus,
  ServiceReportHistoryEvent,
} from '../../../types/service-report'
import type { ServicePeriod } from '../../../types/service-request'
import { useAuth } from '../../auth/use-auth'

const STATUS_LABELS: Record<ServiceReportStatus, string> = {
  OPEN: 'Aberto',
  UNDER_REVIEW: 'Em análise',
  RESOLVED: 'Resolvido',
}

const REASON_LABELS: Record<ServiceReport['reason'], string> = {
  NO_SHOW: 'Profissional não compareceu',
  SERVICE_PROBLEM: 'Problema no atendimento',
  OTHER: 'Outro problema',
}

const DECISION_LABELS: Record<ServiceReportDecision, string> = {
  NO_OPERATIONAL_CHANGE: 'Resolver sem alterar o atendimento',
  REOPEN_CURRENT_SCHEDULE: 'Encerrar atribuição e reabrir no horário atual',
  RESCHEDULE_AND_REOPEN: 'Reagendar e reabrir após ciência do cliente',
}

function newOperationKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

const reportHistoryLabels: Record<ServiceReportHistoryEvent['type'], string> = {
  REPORT_OPENED: 'Relato aberto',
  REVIEW_STARTED: 'Análise registrada',
  RESCHEDULE_PROPOSED: 'Novo horário proposto',
  RESCHEDULE_ACKNOWLEDGED: 'Cliente ciente do novo horário',
  REPORT_RESOLVED: 'Relato resolvido',
}

const decisionConsequences: Record<ServiceReportDecision, string> = {
  NO_OPERATIONAL_CHANGE: 'A justificativa ficará visível ao cliente. O agendamento e o responsável permanecem os mesmos.',
  REOPEN_CURRENT_SCHEDULE: 'A atribuição atual será encerrada. O pedido voltará à procura mantendo o horário atual.',
  RESCHEDULE_AND_REOPEN: 'A atribuição atual será encerrada e a procura reaberta para o horário da proposta já reconhecida pelo cliente.',
}

function statusVariant(status: ServiceReportStatus) {
  return status === 'RESOLVED' ? 'success' : status === 'UNDER_REVIEW' ? 'warning' : 'outline'
}

function Loading() {
  return <div role="status" aria-label="Carregando relatos" className="grid gap-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
}

function AdminReportsList() {
  useDocumentTitle('Relatos administrativos — ProFind')
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const requestFromUrl = searchParams.get('pedido')?.trim() ?? ''
  const latestQuery = useRef(0)
  const [items, setItems] = useState<ServiceReport[]>([])
  const [status, setStatus] = useState<ServiceReportStatus | ''>('')
  const [requestId, setRequestId] = useState(requestFromUrl)
  const [appliedStatus, setAppliedStatus] = useState<ServiceReportStatus | ''>('')
  const [appliedRequestId, setAppliedRequestId] = useState(requestFromUrl)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [cursors, setCursors] = useState<Array<null | { createdAt: Date; reportId: string }>>([null])
  const [nextCursor, setNextCursor] = useState<null | { createdAt: Date; reportId: string }>(null)

  const load = useCallback(async () => {
    const query = ++latestQuery.current
    setLoading(true)
    setError('')
    try {
      const result = await serviceReportService.listReports({
        ...(appliedStatus ? { status: appliedStatus } : {}),
        ...(appliedRequestId ? { requestId: appliedRequestId } : {}),
        cursor: cursors[page - 1],
      })
      if (query !== latestQuery.current) return
      setItems(result.items)
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      if (query === latestQuery.current) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os relatos.')
    } finally {
      if (query === latestQuery.current) setLoading(false)
    }
  }, [appliedRequestId, appliedStatus, cursors, page])

  useEffect(() => {
    let active = true
    const invalidateQuery = () => { latestQuery.current++ }
    queueMicrotask(() => { if (active) void load() })
    return () => { active = false; invalidateQuery() }
  }, [load])

  function resetPagination() {
    setPage(1)
    setCursors([null])
  }

  function applyFilters() {
    const trimmed = requestId.trim()
    setRequestId(trimmed)
    setAppliedStatus(status)
    setAppliedRequestId(trimmed)
    resetPagination()
  }

  function removeFilter(filter: 'status' | 'requestId') {
    if (filter === 'status') {
      if (status === appliedStatus) setStatus('')
      setAppliedStatus('')
    } else {
      if (requestId === appliedRequestId) setRequestId('')
      setAppliedRequestId('')
    }
    resetPagination()
    document.getElementById('admin-report-search')?.focus()
  }

  return (
    <AdminLayout pageTitle="Relatos" heading={{ title: 'Relatos de falta ou problema', description: 'Abra um relato para conferir o pedido, registrar a análise ou responder ao cliente.' }} userName={user?.displayName || user?.email || 'Administrador ProFind'} activeNavigationHref="/admin/relatos">
      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
          <CardContent className="@container grid gap-4">
            <form className="grid gap-4 @min-[35rem]:grid-cols-2" onSubmit={(event) => { event.preventDefault(); applyFilters() }}>
            <div className="grid gap-2">
              <Label htmlFor="admin-report-status">Estado</Label>
              <NativeSelect id="admin-report-status" value={status} onChange={(event) => setStatus(event.target.value as ServiceReportStatus | '')}>
                <option value="">Todos</option>
                <option value="OPEN">Aberto</option>
                <option value="UNDER_REVIEW">Em análise</option>
                <option value="RESOLVED">Resolvido</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2"><Label htmlFor="admin-report-request">Código do pedido</Label><Input id="admin-report-request" value={requestId} onChange={(event) => setRequestId(event.target.value)} /></div>
                        <div className="col-span-full flex flex-wrap gap-3">
              <Button id="admin-report-search" type="submit">Aplicar filtros</Button>
              <Button type="button" variant="outline" onClick={() => { setStatus(''); setRequestId(''); setAppliedStatus(''); setAppliedRequestId(''); resetPagination() }}>Limpar filtros</Button>
            </div>
            </form>
            <AppliedFilterList items={[
              ['status', appliedStatus && `Estado: ${STATUS_LABELS[appliedStatus]}`],
              ['requestId', appliedRequestId && `Código: ${appliedRequestId}`],
            ]} onRemove={removeFilter} />
          </CardContent>
        </Card>

        {loading ? <Loading /> : null}
        {error ? <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription><p>{error}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription></Alert> : null}
        {!loading && !error && items.length === 0 ? <Card><EmptyState icon={<FileWarning aria-hidden="true" />} title="Nenhum relato nesta consulta" description="Revise os filtros ou aguarde um novo relato." /></Card> : null}
        {!loading && !error && items.length > 0 ? (
          <div className="grid gap-4">
            {items.map((report) => (
              <Card key={report.reportId}>
                <CardContent className="flex flex-col justify-between gap-4 pt-6 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><strong>{REASON_LABELS[report.reason]}</strong><Badge variant={statusVariant(report.status)}>{STATUS_LABELS[report.status]}</Badge></div>
                    <p className="mt-2 text-xs text-muted-foreground">Código do pedido · {report.requestId.slice(-8)} · {formatDateTime(report.createdAt)}</p>
                  </div>
                  <Button asChild variant="outline"><Link to={`/admin/relatos/${encodeURIComponent(report.reportId)}`}>Ver detalhe</Link></Button>
                </CardContent>
              </Card>
            ))}
            <nav aria-label="Paginação dos relatos" className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
              <span className="text-sm text-muted-foreground">Página {page}</span>
              <Button type="button" variant="outline" disabled={!nextCursor} onClick={() => {
                if (!nextCursor) return
                setCursors((values) => [...values.slice(0, page), nextCursor])
                setPage((value) => value + 1)
              }}>Próxima</Button>
            </nav>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}

function AdminReportDetail({ reportId }: { reportId: string }) {
  useDocumentTitle('Detalhe do relato — ProFind')
  const { user } = useAuth()
  const reviewOperation = useRef(newOperationKey())
  const resolveOperation = useRef(newOperationKey())
  const [detail, setDetail] = useState<AdminServiceReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [mutating, setMutating] = useState(false)
  const [confirmResolution, setConfirmResolution] = useState(false)
  const resolutionTrigger = useRef<HTMLButtonElement>(null)
  const backToReports = useRef<HTMLAnchorElement>(null)
  const [note, setNote] = useState('')
  const [proposedDate, setProposedDate] = useState('')
  const [proposedPeriod, setProposedPeriod] = useState<ServicePeriod | ''>('')
  const [decision, setDecision] = useState<ServiceReportDecision>('NO_OPERATIONAL_CHANGE')
  const [justification, setJustification] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setDetail(await serviceReportService.getAdminDetail(reportId)) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o relato.') }
    finally { setLoading(false) }
  }, [reportId])

  useEffect(() => {
    queueMicrotask(() => { void load() })
  }, [load])

  async function review() {
    if (!detail || mutating) return
    setMutating(true)
    setMutationError('')
    try {
      await serviceReportService.reviewReport({
        reportId,
        operationKey: reviewOperation.current,
        expectedRevision: detail.report.revision,
        internalNote: note,
        ...(proposedDate && proposedPeriod ? { proposedServiceDate: proposedDate, proposedPeriod } : {}),
      })
      reviewOperation.current = newOperationKey()
      setNote('')
      setProposedDate('')
      setProposedPeriod('')
      await load()
    } catch (mutation) { setMutationError(mutation instanceof Error ? mutation.message : 'Não foi possível iniciar a análise.') }
    finally { setMutating(false) }
  }

  async function resolve() {
    if (!detail || mutating) return
    setMutating(true)
    setMutationError('')
    try {
      await serviceReportService.resolveReport({
        reportId,
        operationKey: resolveOperation.current,
        expectedRevision: detail.report.revision,
        decision,
        justification,
        internalNote: resolutionNote,
      })
      setConfirmResolution(false)
      resolveOperation.current = newOperationKey()
      setJustification('')
      setResolutionNote('')
      await load()
    } catch (mutation) { setMutationError(mutation instanceof Error ? mutation.message : 'Não foi possível resolver o relato.') }
    finally { setMutating(false) }
  }

  const canOperationallyReopen = detail?.request.request.status === 'ASSIGNED'
    && detail.request.request.currentAssignmentId === detail.report.assignmentIdAtOpen

  return (
    <AdminLayout pageTitle="Detalhe do relato" heading={{ description: 'Consulte o pedido e o histórico antes de registrar a decisão.' }} userName={user?.displayName || user?.email || 'Administrador ProFind'} activeNavigationHref="/admin/relatos">
      <div className="grid gap-6">
        <div><Button asChild variant="link"><Link ref={backToReports} to="/admin/relatos"><ChevronLeft aria-hidden="true" /> Voltar para relatos</Link></Button></div>
        {loading ? <Loading /> : null}
        {error ? <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription><p>{error}</p><Button type="button" className="mt-3" variant="outline" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription></Alert> : null}
        {detail ? (
          <>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{REASON_LABELS[detail.report.reason]}</CardTitle><Badge variant={statusVariant(detail.report.status)}>{STATUS_LABELS[detail.report.status]}</Badge></div></CardHeader>
              <CardContent className="grid gap-5">
                <p className="whitespace-pre-wrap text-sm leading-6">{detail.report.description}</p>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Estado ao abrir</dt><dd className="font-medium">{detail.report.requestStatusAtOpen}</dd></div>
                  <div><dt className="text-muted-foreground">Rodada vinculada</dt><dd className="font-medium">{detail.report.roundAtOpen}</dd></div>
                </dl>
                <details className="rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-ring">Referências do relato</summary>
                  <dl className="mt-3 grid gap-3 wrap-anywhere sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Código do pedido</dt><dd className="font-mono">{detail.report.requestId}</dd></div>
                    <div><dt className="text-muted-foreground">Código do relato</dt><dd className="font-mono">{detail.report.reportId}</dd></div>
                    <div><dt className="text-muted-foreground">Atribuição vinculada</dt><dd>{detail.report.assignmentIdAtOpen || 'Sem atribuição'}</dd></div>
                  </dl>
                </details>
                {detail.report.resolutionJustification ? <Alert variant="success"><ShieldCheck aria-hidden="true" /><AlertTitle>Resposta ao cliente</AlertTitle><AlertDescription>{detail.report.resolutionJustification}</AlertDescription></Alert> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle><ClipboardList className="mr-2 inline size-5" aria-hidden="true" /> Situação atual do pedido</CardTitle><CardDescription>Confira o agendamento e o profissional responsável antes de registrar a decisão.</CardDescription></CardHeader>
              <CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted-foreground">Estado atual</dt><dd className="font-medium">{detail.request.request.status}</dd></div><div><dt className="text-muted-foreground">Data e período</dt><dd className="font-medium">{formatCalendarDate(detail.request.request.serviceDate)} · {SERVICE_PERIOD_DEFINITIONS[detail.request.request.period].label} ({formatServiceHours(detail.request.request.period)})</dd></div><div><dt className="text-muted-foreground">Rodada atual</dt><dd className="font-medium">{detail.request.request.round}</dd></div><div><dt className="text-muted-foreground">Profissional responsável</dt><dd className="font-medium">{detail.request.responsibleName || 'Não definido'}</dd></div></dl></CardContent>
            </Card>

            {mutationError && !confirmResolution ? <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>A operação não foi confirmada</AlertTitle><AlertDescription>{mutationError} Os campos foram preservados.</AlertDescription></Alert> : null}

            {detail.report.status !== 'RESOLVED' ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Iniciar ou atualizar análise</CardTitle><CardDescription>A nota abaixo é interna. Data e período criam uma proposta visível para ciência do cliente.</CardDescription></CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2"><Label htmlFor="report-note">Nota interna</Label><Textarea id="report-note" value={note} maxLength={1000} rows={4} onChange={(event) => setNote(event.target.value)} /></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="proposal-date">Nova data (opcional)</Label><Input id="proposal-date" type="date" value={proposedDate} onChange={(event) => setProposedDate(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="proposal-period">Novo período</Label><NativeSelect id="proposal-period" value={proposedPeriod} onChange={(event) => setProposedPeriod(event.target.value as ServicePeriod | '')}><option value="">Selecione</option><option value="MORNING">Manhã</option><option value="AFTERNOON">Tarde</option><option value="EVENING">Noite</option></NativeSelect></div></div>
                    <Button type="button" loading={mutating} loadingLabel="Salvando…" disabled={note.trim().length < 10 || Boolean(proposedDate) !== Boolean(proposedPeriod)} onClick={() => void review()}>Registrar análise</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Resolver relato</CardTitle><CardDescription>A justificativa será enviada ao cliente. Use a nota interna para informações privadas.</CardDescription></CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2"><Label htmlFor="report-decision">Decisão</Label><NativeSelect id="report-decision" value={decision} onChange={(event) => setDecision(event.target.value as ServiceReportDecision)}><option value="NO_OPERATIONAL_CHANGE">{DECISION_LABELS.NO_OPERATIONAL_CHANGE}</option><option value="REOPEN_CURRENT_SCHEDULE" disabled={!canOperationallyReopen}>{DECISION_LABELS.REOPEN_CURRENT_SCHEDULE}</option><option value="RESCHEDULE_AND_REOPEN" disabled={!canOperationallyReopen}>{DECISION_LABELS.RESCHEDULE_AND_REOPEN}</option></NativeSelect></div>
                    {decision === 'RESCHEDULE_AND_REOPEN' ? <Alert variant={detail.report.clientAcknowledgedProposalRevision === detail.report.proposalRevision && detail.report.proposalRevision > 0 ? 'success' : 'warning'}><ShieldCheck aria-hidden="true" /><AlertTitle>Ciência do cliente</AlertTitle><AlertDescription>{detail.report.clientAcknowledgedProposalRevision === detail.report.proposalRevision && detail.report.proposalRevision > 0 ? 'Registrada para a proposta vigente.' : 'Ainda necessária antes de resolver com reagendamento.'}</AlertDescription></Alert> : null}
                    <div className="grid gap-2"><Label htmlFor="resolution-justification">Justificativa ao cliente</Label><Textarea id="resolution-justification" value={justification} maxLength={1000} rows={4} onChange={(event) => setJustification(event.target.value)} /></div>
                    <div className="grid gap-2"><Label htmlFor="resolution-note">Nota interna adicional (opcional)</Label><Textarea id="resolution-note" value={resolutionNote} maxLength={1000} rows={3} onChange={(event) => setResolutionNote(event.target.value)} /></div>
                    <Button ref={resolutionTrigger} type="button" disabled={mutating || justification.trim().length < 10} onClick={() => { setMutationError(''); setConfirmResolution(true) }}>Revisar resolução</Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            <ConfirmationDialog open={confirmResolution}
              title="Resolver relato?"
              description={decisionConsequences[decision]}
              confirmLabel="Resolver relato" cancelLabel="Voltar à análise"
              busy={mutating} busyLabel="Resolvendo…" error={mutationError}
              returnFocusTo={detail.report.status === 'RESOLVED' ? backToReports : resolutionTrigger}
              onCancel={() => setConfirmResolution(false)} onConfirm={() => void resolve()} />
            <div className="grid gap-6 xl:grid-cols-2">
              <Card><CardHeader><CardTitle>Histórico do relato</CardTitle><CardDescription>Eventos visíveis ao cliente, sem notas privadas.</CardDescription></CardHeader><CardContent><ActivityTimeline items={detail.history.map((event) => ({
    id: event.eventId,
    title: reportHistoryLabels[event.type],
    icon: event.type === 'RESCHEDULE_PROPOSED' || event.type === 'RESCHEDULE_ACKNOWLEDGED' ? CalendarClock : FileWarning,
    at: event.createdAt,
    detail: <><p>{event.actorRole} · {event.actorId}</p>{event.justification ? <p className="mt-2">{event.justification}</p> : null}</>,
  }))} /></CardContent></Card>
              <Card><CardHeader><CardTitle>Notas internas</CardTitle><CardDescription>Somente administradores autorizados podem ler estas notas.</CardDescription></CardHeader><CardContent>{detail.internalNotes.length ? <ol className="grid gap-3">{detail.internalNotes.map((noteItem) => <li key={noteItem.noteId} className="rounded-md border p-3 text-sm"><p className="whitespace-pre-wrap">{noteItem.text}</p><p className="mt-2 text-xs text-muted-foreground">{noteItem.authorId} · {formatDateTime(noteItem.createdAt)}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">Nenhuma nota interna.</p>}</CardContent></Card>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

export function AdminServiceReportsPage() {
  const { reportId } = useParams<{ reportId: string }>()
  return reportId ? <AdminReportDetail reportId={reportId} /> : <AdminReportsList />
}
