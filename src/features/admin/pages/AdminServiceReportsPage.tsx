import {
  AlertTriangle,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
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

function formatDateTime(date: Date | null) {
  return date
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : 'Não registrado'
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
    setLoading(true)
    setError('')
    try {
      const result = await serviceReportService.listReports({
        ...(appliedStatus ? { status: appliedStatus } : {}),
        ...(appliedRequestId ? { requestId: appliedRequestId } : {}),
        cursor: cursors[page - 1],
      })
      setItems(result.items)
      setNextCursor(result.nextCursor)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os relatos.')
    } finally {
      setLoading(false)
    }
  }, [appliedRequestId, appliedStatus, cursors, page])

  useEffect(() => {
    queueMicrotask(() => { void load() })
  }, [load])

  function applyFilters() {
    setAppliedStatus(status)
    setAppliedRequestId(requestId.trim())
    setPage(1)
    setCursors([null])
  }

  return (
    <AdminLayout pageTitle="Relatos" userName={user?.displayName || user?.email || 'Administrador ProFind'} activeNavigationHref="/admin/relatos">
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-semibold text-primary">Intervenção administrativa</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Relatos de falta ou problema</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Consulte relatos paginados sem presumir falta, punição ou alteração automática do atendimento.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Filtros</CardTitle><CardDescription>Até 12 relatos por página.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="admin-report-status">Estado</Label>
              <select id="admin-report-status" value={status} className="min-h-11 rounded-md border bg-background px-3 text-sm" onChange={(event) => setStatus(event.target.value as ServiceReportStatus | '')}>
                <option value="">Todos</option>
                <option value="OPEN">Aberto</option>
                <option value="UNDER_REVIEW">Em análise</option>
                <option value="RESOLVED">Resolvido</option>
              </select>
            </div>
            <div className="grid gap-2"><Label htmlFor="admin-report-request">Código do pedido</Label><Input id="admin-report-request" value={requestId} onChange={(event) => setRequestId(event.target.value)} /></div>
            <Button type="button" onClick={applyFilters}>Aplicar filtros</Button>
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
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{report.description}</p>
                    <p className="mt-2 break-all text-xs text-muted-foreground">Pedido {report.requestId} · rodada {report.roundAtOpen} · {formatDateTime(report.createdAt)}</p>
                  </div>
                  <Button asChild variant="outline"><Link to={`/admin/relatos/${encodeURIComponent(report.reportId)}`}>Ver detalhe</Link></Button>
                </CardContent>
              </Card>
            ))}
            <nav aria-label="Paginação dos relatos" className="flex items-center justify-between gap-3">
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
    if (!detail) return
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
    if (!detail) return
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
    <AdminLayout pageTitle="Detalhe do relato" userName={user?.displayName || user?.email || 'Administrador ProFind'} activeNavigationHref="/admin/relatos">
      <div className="grid gap-6">
        <div><Button asChild variant="link"><Link to="/admin/relatos"><ChevronLeft aria-hidden="true" /> Voltar para relatos</Link></Button></div>
        {loading ? <Loading /> : null}
        {error ? <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription><p>{error}</p><Button type="button" className="mt-3" variant="outline" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Tentar novamente</Button></AlertDescription></Alert> : null}
        {detail ? (
          <>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{REASON_LABELS[detail.report.reason]}</CardTitle><Badge variant={statusVariant(detail.report.status)}>{STATUS_LABELS[detail.report.status]}</Badge></div><CardDescription>Relato {detail.report.reportId}</CardDescription></CardHeader>
              <CardContent className="grid gap-5">
                <p className="whitespace-pre-wrap text-sm leading-6">{detail.report.description}</p>
                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-muted-foreground">Pedido</dt><dd className="break-all font-medium">{detail.report.requestId}</dd></div>
                  <div><dt className="text-muted-foreground">Estado ao abrir</dt><dd className="font-medium">{detail.report.requestStatusAtOpen}</dd></div>
                  <div><dt className="text-muted-foreground">Rodada vinculada</dt><dd className="font-medium">{detail.report.roundAtOpen}</dd></div>
                  <div><dt className="text-muted-foreground">Atribuição vinculada</dt><dd className="break-all font-medium">{detail.report.assignmentIdAtOpen || 'Sem atribuição'}</dd></div>
                </dl>
                {detail.report.resolutionJustification ? <Alert variant="success"><ShieldCheck aria-hidden="true" /><AlertTitle>Resposta ao cliente</AlertTitle><AlertDescription>{detail.report.resolutionJustification}</AlertDescription></Alert> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle><ClipboardList className="mr-2 inline size-5" aria-hidden="true" /> Contexto atual do pedido</CardTitle><CardDescription>A consulta administrativa existente foi reutilizada para revalidar pedido, rodadas, atribuições, reserva e histórico.</CardDescription></CardHeader>
              <CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted-foreground">Estado atual</dt><dd className="font-medium">{detail.request.request.status}</dd></div><div><dt className="text-muted-foreground">Data e período</dt><dd className="font-medium">{detail.request.request.serviceDate} · {SERVICE_PERIOD_DEFINITIONS[detail.request.request.period].label}</dd></div><div><dt className="text-muted-foreground">Rodada atual</dt><dd className="font-medium">{detail.request.request.round}</dd></div><div><dt className="text-muted-foreground">Responsável</dt><dd className="font-medium">{detail.request.responsibleName || 'Não definido'}</dd></div></dl></CardContent>
            </Card>

            {mutationError ? <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>A operação não foi confirmada</AlertTitle><AlertDescription>{mutationError} Os campos foram preservados.</AlertDescription></Alert> : null}

            {detail.report.status !== 'RESOLVED' ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Iniciar ou atualizar análise</CardTitle><CardDescription>A nota abaixo é interna. Data e período criam uma proposta visível para ciência do cliente.</CardDescription></CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2"><Label htmlFor="report-note">Nota interna</Label><Textarea id="report-note" value={note} maxLength={1000} rows={4} onChange={(event) => setNote(event.target.value)} /></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="proposal-date">Nova data (opcional)</Label><Input id="proposal-date" type="date" value={proposedDate} onChange={(event) => setProposedDate(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="proposal-period">Novo período</Label><select id="proposal-period" value={proposedPeriod} className="min-h-11 rounded-md border bg-background px-3 text-sm" onChange={(event) => setProposedPeriod(event.target.value as ServicePeriod | '')}><option value="">Selecione</option><option value="MORNING">Manhã</option><option value="AFTERNOON">Tarde</option><option value="EVENING">Noite</option></select></div></div>
                    <Button type="button" loading={mutating} loadingLabel="Salvando…" disabled={note.trim().length < 10 || Boolean(proposedDate) !== Boolean(proposedPeriod)} onClick={() => void review()}>Registrar análise</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Resolver relato</CardTitle><CardDescription>A justificativa é a resposta visível ao cliente. Intervenções operacionais são transacionais.</CardDescription></CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2"><Label htmlFor="report-decision">Decisão</Label><select id="report-decision" value={decision} className="min-h-11 rounded-md border bg-background px-3 text-sm" onChange={(event) => setDecision(event.target.value as ServiceReportDecision)}><option value="NO_OPERATIONAL_CHANGE">{DECISION_LABELS.NO_OPERATIONAL_CHANGE}</option><option value="REOPEN_CURRENT_SCHEDULE" disabled={!canOperationallyReopen}>{DECISION_LABELS.REOPEN_CURRENT_SCHEDULE}</option><option value="RESCHEDULE_AND_REOPEN" disabled={!canOperationallyReopen}>{DECISION_LABELS.RESCHEDULE_AND_REOPEN}</option></select></div>
                    {decision === 'RESCHEDULE_AND_REOPEN' ? <Alert variant={detail.report.clientAcknowledgedProposalRevision === detail.report.proposalRevision && detail.report.proposalRevision > 0 ? 'success' : 'warning'}><ShieldCheck aria-hidden="true" /><AlertTitle>Ciência do cliente</AlertTitle><AlertDescription>{detail.report.clientAcknowledgedProposalRevision === detail.report.proposalRevision && detail.report.proposalRevision > 0 ? 'Registrada para a proposta vigente.' : 'Ainda necessária antes de resolver com reagendamento.'}</AlertDescription></Alert> : null}
                    <div className="grid gap-2"><Label htmlFor="resolution-justification">Justificativa ao cliente</Label><Textarea id="resolution-justification" value={justification} maxLength={1000} rows={4} onChange={(event) => setJustification(event.target.value)} /></div>
                    <div className="grid gap-2"><Label htmlFor="resolution-note">Nota interna adicional (opcional)</Label><Textarea id="resolution-note" value={resolutionNote} maxLength={1000} rows={3} onChange={(event) => setResolutionNote(event.target.value)} /></div>
                    <Button type="button" loading={mutating} loadingLabel="Resolvendo…" disabled={justification.trim().length < 10} onClick={() => void resolve()}>Confirmar resolução</Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-2">
              <Card><CardHeader><CardTitle>Histórico do relato</CardTitle><CardDescription>Eventos visíveis ao cliente, sem notas privadas.</CardDescription></CardHeader><CardContent><ol className="grid gap-3">{detail.history.map((event) => <li key={event.eventId} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{event.type}</strong><time className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</time></div><p className="mt-1 text-muted-foreground">{event.actorRole} · {event.actorId}</p>{event.justification ? <p className="mt-2">{event.justification}</p> : null}</li>)}</ol></CardContent></Card>
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
