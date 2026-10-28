import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ImageIcon,
  Maximize2,
  MapPin,
  Phone,
  RefreshCw,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Badge, type BadgeProps } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Checkbox } from '../../../components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { EmptyState } from '../../../components/ui/empty-state'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Skeleton } from '../../../components/ui/skeleton'
import { Textarea } from '../../../components/ui/textarea'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { professionalReviewService } from '../../../services/professional-review.service'
import { listAvailableCatalog } from '../../../services/catalog.service'
import type {
  AdminProfessionalReviewDetail,
  ProfessionalReviewQueueItem,
} from '../../../repositories/professional-review.repository'
import {
  PROFESSIONAL_REVIEW_STATUSES,
  type ProfessionalReviewAction,
  type ProfessionalReviewError,
  type ProfessionalReviewStatus,
} from '../../../types/professional-review'
import type { ServiceCatalog } from '../../../types/catalog'
import { useAuth } from '../../auth/use-auth'
import {
  AdminImageViewer,
  type AdminReviewImage,
} from '../components/AdminImageViewer'
import { imageKitDisplayUrl } from '../components/admin-image-viewer.utils'

const STATUS_LABELS: Record<ProfessionalReviewStatus, string> = {
  DRAFT: 'Rascunho',
  UNDER_REVIEW: 'Em análise',
  CHANGES_REQUESTED: 'Ajustes solicitados',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  SUSPENDED: 'Suspenso',
}

const ACTION_LABELS: Record<ProfessionalReviewAction, string> = {
  PROFILE_UPDATED: 'Cadastro atualizado',
  PROFILE_SUBMITTED: 'Enviado para análise',
  PROFILE_RESUBMITTED: 'Enviado novamente',
  REANALYSIS_REQUIRED: 'Atualização enviada para análise',
  APPROVED: 'Cadastro aprovado',
  APPROVED_AND_ACTIVATED: 'Cadastro aprovado e ativado',
  CHANGES_REQUESTED: 'Ajustes solicitados',
  REJECTED: 'Cadastro rejeitado',
  SUSPENDED: 'Cadastro suspenso',
  ACTIVATED: 'Cadastro ativado',
  DEACTIVATED: 'Cadastro desativado',
}

const PERIOD_LABELS: Record<string, string> = {
  MORNING: 'Manhã',
  AFTERNOON: 'Tarde',
  EVENING: 'Noite',
}

const AVAILABILITY_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponível para novos atendimentos',
  LIMITED: 'Disponibilidade limitada',
  UNAVAILABLE: 'Indisponível no momento',
}

const SERVICE_MODE_LABELS: Record<string, string> = {
  CITY_ONLY: 'Atende no município base',
  RADIUS: 'Atende por raio de distância',
  SELECTED_CITIES: 'Atende municípios selecionados',
}

type AdminAction =
  | 'approve'
  | 'changes'
  | 'reject'
  | 'suspend'
  | 'deactivate'
  | 'reactivate'
  | 'assist'

function statusVariant(status: ProfessionalReviewStatus): BadgeProps['variant'] {
  if (status === 'APPROVED') return 'success'
  if (status === 'UNDER_REVIEW' || status === 'CHANGES_REQUESTED') return 'warning'
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'destructive'
  return 'outline'
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value)
}

function formatServiceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Data não informada'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  )
}

function formatPhone(value: string | null) {
  if (!value) return 'Não publicado'
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return value
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a operação. Tente novamente.'
}

function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <span className="sr-only">Carregando cadastros profissionais…</span>
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  )
}

interface QueueCardProps {
  item: ProfessionalReviewQueueItem
}

function QueueCard({ item }: QueueCardProps) {
  const { operational } = item
  const initials = item.publicName.slice(0, 2).toUpperCase()
  return (
    <Card className="h-full">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12 border">
            {item.profileImageUrl ? <AvatarImage src={item.profileImageUrl} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">{item.publicName}</CardTitle>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {item.headline || 'Apresentação ainda não preenchida'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(operational.reviewStatus)}>
            {STATUS_LABELS[operational.reviewStatus]}
          </Badge>
          <Badge variant={operational.active ? 'success' : 'outline'}>
            {operational.active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Versão enviada: {operational.submittedVersion ?? '—'}
        </p>
        <Button asChild size="sm">
          <Link to={`/admin/profissionais/${operational.professionalId}`}>
            Analisar cadastro
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function AdminProfessionalQueue() {
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProfessionalReviewStatus>('ALL')
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [items, setItems] = useState<ProfessionalReviewQueueItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSequence, setReloadSequence] = useState(0)

  useDocumentTitle('Análise de profissionais — ProFind')

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setLoading(true)
      setError(null)
      return professionalReviewService
        .listQueue({
          statuses: statusFilter === 'ALL' ? undefined : [statusFilter],
          active:
            activeFilter === 'ALL' ? undefined : activeFilter === 'ACTIVE',
          cursor,
          pageSize: 12,
        })
        .then((page) => {
          if (!active) return
          setItems(page.items)
          setNextCursor(page.nextCursor)
        })
        .catch((loadError: unknown) => {
          if (active) setError(errorMessage(loadError))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    })
    return () => {
      active = false
    }
  }, [activeFilter, cursor, reloadSequence, statusFilter])

  function resetPagination() {
    setCursor(null)
    setPreviousCursors([])
  }

  return (
    <AdminLayout
      pageTitle="Análise de profissionais"
      userName={user?.displayName || user?.email || 'Administrador ProFind'}
      activeNavigationHref="/admin/profissionais"
    >
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-semibold text-primary">Cadastros profissionais</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Fila de análise</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Confira a versão enviada, registre sua decisão e mantenha separado o retorno ao profissional das notas internas.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="review-status-filter">Estado da análise</Label>
              <select
                id="review-status-filter"
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as typeof statusFilter)
                  resetPagination()
                }}
              >
                <option value="ALL">Todos os estados</option>
                {PROFESSIONAL_REVIEW_STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="review-active-filter">Ativação</Label>
              <select
                id="review-active-filter"
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={activeFilter}
                onChange={(event) => {
                  setActiveFilter(event.target.value as typeof activeFilter)
                  resetPagination()
                }}
              >
                <option value="ALL">Ativos e inativos</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativos</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {loading ? <PageLoading /> : null}
        {!loading && error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Não foi possível carregar a fila</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button className="mt-4" variant="outline" onClick={() => setReloadSequence((value) => value + 1)}>
                <RefreshCw aria-hidden="true" /> Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardCheck aria-hidden="true" />}
              title="Nenhum cadastro nesta seleção"
              description="Altere os filtros ou aguarde novos envios para análise."
            />
          </Card>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <>
            <section aria-label="Cadastros profissionais" className="grid gap-4 lg:grid-cols-2">
              {items.map((item) => <QueueCard key={item.operational.professionalId} item={item} />)}
            </section>
            <nav aria-label="Paginação da fila" className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={previousCursors.length === 0}
                onClick={() => {
                  const history = [...previousCursors]
                  const previous = history.pop() ?? null
                  setPreviousCursors(history)
                  setCursor(previous)
                }}
              >
                <ChevronLeft aria-hidden="true" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {previousCursors.length + 1}</span>
              <Button
                variant="outline"
                disabled={!nextCursor}
                onClick={() => {
                  setPreviousCursors((history) => [...history, cursor])
                  setCursor(nextCursor)
                }}
              >
                Próxima <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

interface DecisionDialogProps {
  action: AdminAction | null
  detail: AdminProfessionalReviewDetail
  busy: boolean
  error: string | null
  onClose(): void
  onSubmit(input: {
    feedback: string
    internalNote: string
    activateOnApproval: boolean
  }): void
}

function DecisionDialog({ action, detail, busy, error, onClose, onSubmit }: DecisionDialogProps) {
  const [feedback, setFeedback] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [activateOnApproval, setActivateOnApproval] = useState(true)
  const restricting = action === 'changes' || action === 'reject' || action === 'suspend' || action === 'deactivate'
  const requiresFeedback = action !== 'approve'
  const titles: Partial<Record<AdminAction, string>> = {
    approve: 'Aprovar cadastro',
    changes: 'Solicitar ajustes',
    reject: 'Rejeitar cadastro',
    suspend: 'Suspender profissional',
    deactivate: 'Desativar profissional',
    reactivate: 'Reativar profissional',
  }

  return (
    <Dialog open={action !== null && action !== 'assist'} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action ? titles[action] : ''}</DialogTitle>
          <DialogDescription>
            A decisão será aplicada somente à versão {detail.operational.submittedVersion ?? detail.operational.profileVersion}. Se o cadastro tiver mudado, os dados precisarão ser recarregados.
          </DialogDescription>
        </DialogHeader>
        {restricting && detail.confirmedEngagements.length > 0 ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Há atendimentos confirmados</AlertTitle>
            <AlertDescription>
              Esta restrição não cancela {detail.confirmedEngagements.length} atendimento(s) existente(s). O acompanhamento deve continuar pelo fluxo operacional.
            </AlertDescription>
          </Alert>
        ) : null}
        {action === 'approve' ? (
          <label className="flex min-h-11 items-start gap-3 rounded-md border p-3 text-sm">
            <Checkbox checked={activateOnApproval} onCheckedChange={(checked) => setActivateOnApproval(checked === true)} />
            <span>
              <strong className="block">Ativar ao aprovar</strong>
              <span className="text-muted-foreground">Libera novas oportunidades na mesma operação administrativa.</span>
            </span>
          </label>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="professional-feedback">
            {action === 'approve' ? 'Mensagem ao profissional (opcional)' : 'Mensagem ao profissional'}
          </Label>
          <Textarea
            id="professional-feedback"
            value={feedback}
            maxLength={1200}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Escreva uma orientação clara, sem incluir notas internas."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="internal-note">Nota interna (opcional)</Label>
          <Textarea
            id="internal-note"
            value={internalNote}
            maxLength={4000}
            onChange={(event) => setInternalNote(event.target.value)}
            placeholder="Visível somente para administradores."
          />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || (requiresFeedback && !feedback.trim())}
            loading={busy}
            loadingLabel="Salvando decisão…"
            onClick={() => onSubmit({ feedback, internalNote, activateOnApproval })}
          >
            Confirmar decisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface AssistanceDialogProps {
  open: boolean
  detail: AdminProfessionalReviewDetail
  busy: boolean
  error: string | null
  onClose(): void
  onSubmit(input: {
    publicName: string
    headline: string
    bio: string
    experienceYears: number | null
    internalNote: string
  }): void
}

function AssistanceDialog({ open, detail, busy, error, onClose, onSubmit }: AssistanceDialogProps) {
  const [publicName, setPublicName] = useState(detail.profile.publicName)
  const [headline, setHeadline] = useState(detail.profile.headline)
  const [bio, setBio] = useState(detail.profile.bio)
  const [experienceYears, setExperienceYears] = useState(detail.profile.experienceYears?.toString() ?? '')
  const [internalNote, setInternalNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Auxiliar no preenchimento</DialogTitle>
          <DialogDescription>
            Você está atualizando o cadastro em nome da equipe, sem acessar a conta do profissional. A alteração cria uma nova versão e fica registrada no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="assist-name">Nome público</Label>
            <Input id="assist-name" value={publicName} maxLength={120} onChange={(event) => setPublicName(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assist-experience">Anos de experiência</Label>
            <Input id="assist-experience" type="number" min={0} max={80} value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="assist-headline">Apresentação curta</Label>
            <Input id="assist-headline" value={headline} maxLength={120} onChange={(event) => setHeadline(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="assist-bio">Descrição profissional</Label>
            <Textarea id="assist-bio" value={bio} maxLength={1200} onChange={(event) => setBio(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="assist-note">Motivo do auxílio</Label>
            <Textarea id="assist-note" value={internalNote} maxLength={4000} onChange={(event) => setInternalNote(event.target.value)} placeholder="Nota privada obrigatória para a trilha administrativa." />
          </div>
        </div>
        <label className="flex min-h-11 items-start gap-3 rounded-md border p-3 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
          <span>Confirmo que revisei estes dados com o profissional e que não acessei a conta dele.</span>
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || !confirmed || !internalNote.trim()}
            loading={busy}
            loadingLabel="Salvando auxílio…"
            onClick={() => onSubmit({
              publicName,
              headline,
              bio,
              experienceYears: experienceYears === '' ? null : Number(experienceYears),
              internalNote,
            })}
          >
            Salvar nova versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DecisionPanelProps {
  detail: AdminProfessionalReviewDetail
  versionBlocked: boolean
  onAction(action: AdminAction): void
}

function DecisionPanel({ detail, versionBlocked, onAction }: DecisionPanelProps) {
  const { operational } = detail
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Decisão da análise</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            A decisão será vinculada à versão {operational.submittedVersion ?? operational.profileVersion}.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {versionBlocked ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Versão divergente</AlertTitle>
              <AlertDescription>Recarregue o cadastro antes de decidir.</AlertDescription>
            </Alert>
          ) : null}

          {operational.reviewStatus === 'UNDER_REVIEW' ? (
            <>
              <Button className="w-full" disabled={versionBlocked} onClick={() => onAction('approve')}>
                Aprovar cadastro
              </Button>
              <p className="-mt-1 text-xs leading-5 text-muted-foreground">
                {operational.active
                  ? 'A aprovação mantém o profissional ativo.'
                  : 'Na confirmação, “Ativar ao aprovar” vem marcado e pode ser desmarcado.'}
              </p>
              <Button className="w-full" variant="outline" disabled={versionBlocked} onClick={() => onAction('changes')}>
                Solicitar ajustes
              </Button>
              <Button className="w-full" variant="destructive" disabled={versionBlocked} onClick={() => onAction('reject')}>
                Rejeitar cadastro
              </Button>
            </>
          ) : null}

          {operational.reviewStatus === 'APPROVED' ? (
            <>
              <Button className="w-full" variant="outline" onClick={() => onAction(operational.active ? 'deactivate' : 'reactivate')}>
                {operational.active ? 'Desativar profissional' : 'Reativar profissional'}
              </Button>
              <Button className="w-full" variant="destructive" onClick={() => onAction('suspend')}>
                Suspender profissional
              </Button>
            </>
          ) : null}

          {operational.reviewStatus === 'REJECTED' || operational.reviewStatus === 'SUSPENDED' ? (
            <Button className="w-full" variant="outline" onClick={() => onAction('changes')}>
              Permitir correções
            </Button>
          ) : null}

          {operational.reviewStatus === 'DRAFT' || operational.reviewStatus === 'CHANGES_REQUESTED' ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Aguarde o profissional enviar ou reenviar o cadastro para análise.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Auxílio no preenchimento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            Corrija dados confirmados com o profissional sem acessar a conta dele. A ação cria nova versão e nota privada.
          </p>
          <Button className="mt-4 w-full" variant="secondary" onClick={() => onAction('assist')}>
            Auxiliar no preenchimento
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

interface ReviewTimelineProps {
  detail: AdminProfessionalReviewDetail
  internalNotes: Map<string, AdminProfessionalReviewDetail['internalHistory'][number]>
}

function ReviewTimeline({ detail, internalNotes }: ReviewTimelineProps) {
  const [showAll, setShowAll] = useState(false)
  const visibleHistory = showAll ? detail.history : detail.history.slice(0, 4)
  const hiddenCount = detail.history.length - visibleHistory.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Histórico da análise</CardTitle>
          <Badge variant="outline">{detail.history.length} evento(s)</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
        ) : (
          <>
            <ol className="ml-2 border-l border-border">
              {visibleHistory.map((event) => {
                const internal = internalNotes.get(event.eventId)
                return (
                  <li key={event.eventId} className="relative pb-4 pl-5 last:pb-0">
                    <span className="absolute top-2 -left-1.5 size-3 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
                    <details className="group rounded-md border bg-card open:bg-muted/35">
                      <summary className="cursor-pointer list-none px-3 py-2.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
                          <div className="min-w-0">
                            <p className="font-semibold">{ACTION_LABELS[event.action]}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.actorRole === 'ADMIN' ? 'Equipe administrativa' : 'Profissional'} · versão {event.profileVersion}
                            </p>
                          </div>
                          <time className="shrink-0 text-xs text-muted-foreground">{formatDate(event.createdAt)}</time>
                        </div>
                      </summary>
                      <div className="grid gap-2 border-t px-3 py-3 text-sm">
                        <p>
                          <span className="text-muted-foreground">Estado:</span>{' '}
                          {STATUS_LABELS[event.fromStatus]} → {STATUS_LABELS[event.toStatus]}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Versão analisada:</span>{' '}
                          {event.reviewedVersion ?? 'Não se aplica'}
                        </p>
                        {event.reason ? <p><span className="font-medium">Feedback:</span> {event.reason}</p> : null}
                        {internal?.note ? <p className="rounded-md bg-muted p-3"><span className="font-medium">Nota interna:</span> {internal.note}</p> : null}
                        {!event.reason && !internal?.note ? <p className="text-muted-foreground">Sem observações adicionais.</p> : null}
                      </div>
                    </details>
                  </li>
                )
              })}
            </ol>
            {hiddenCount > 0 ? (
              <Button className="mt-4 w-full" variant="outline" onClick={() => setShowAll(true)}>
                Mostrar {hiddenCount} evento(s) anterior(es)
              </Button>
            ) : showAll && detail.history.length > 4 ? (
              <Button className="mt-4 w-full" variant="ghost" onClick={() => setShowAll(false)}>
                Mostrar somente os recentes
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AdminProfessionalDetail({ professionalId }: { professionalId: string }) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<AdminProfessionalReviewDetail | null>(null)
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [action, setAction] = useState<AdminAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [reloadSequence, setReloadSequence] = useState(0)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [viewerReturnFocus, setViewerReturnFocus] = useState<HTMLElement | null>(null)

  useDocumentTitle('Detalhes da análise — ProFind')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [result, loadedCatalog] = await Promise.all([
        professionalReviewService.findAdminDetail(professionalId),
        listAvailableCatalog(),
      ])
      setDetail(result)
      setCatalog(loadedCatalog)
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [professionalId])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) return load()
    })
    return () => {
      active = false
    }
  }, [load, reloadSequence])

  const internalNotes = useMemo(
    () => new Map(detail?.internalHistory.map((event) => [event.eventId, event]) ?? []),
    [detail],
  )
  const reviewImages = useMemo<AdminReviewImage[]>(() => {
    if (!detail) return []
    return [
      ...(detail.profile.profileImage
        ? [{
            url: detail.profile.profileImage.url,
            alt: detail.profile.profileImage.altText || `Foto de perfil de ${detail.profile.publicName}`,
            label: 'Foto de perfil',
          }]
        : []),
      ...detail.profile.portfolioImages.map((image, index) => ({
        url: image.url,
        alt: image.altText || `Item ${index + 1} do portfólio`,
        label: `Portfólio ${index + 1}`,
      })),
    ]
  }, [detail])

  const versionBlocked = Boolean(
    detail?.operational.reviewStatus === 'UNDER_REVIEW' &&
      detail.operational.submittedVersion !== detail.operational.profileVersion,
  )

  function openAction(nextAction: AdminAction) {
    setActionError(null)
    setAction(nextAction)
  }

  function openImage(event: ReactMouseEvent<HTMLButtonElement>, index: number) {
    setViewerReturnFocus(event.currentTarget)
    setViewerIndex(index)
  }

  async function performDecision(input: { feedback: string; internalNote: string; activateOnApproval: boolean }) {
    if (!detail || !action || action === 'assist') return
    setBusy(true)
    setActionError(null)
    const expected = {
      professionalId,
      expectedVersion: detail.operational.profileVersion,
      expectedRevision: detail.operational.revision,
    }
    try {
      if (action === 'approve' || action === 'changes' || action === 'reject') {
        await professionalReviewService.decide({
          ...expected,
          decision: action === 'approve' ? 'APPROVED' : action === 'changes' ? 'CHANGES_REQUESTED' : 'REJECTED',
          activateOnApproval: action === 'approve' ? input.activateOnApproval : undefined,
          feedback: input.feedback,
          internalNote: input.internalNote,
        })
      } else if (action === 'suspend') {
        await professionalReviewService.suspend({ ...expected, reason: input.feedback, internalNote: input.internalNote })
      } else {
        await professionalReviewService.setActive({
          ...expected,
          active: action === 'reactivate',
          reason: input.feedback,
          internalNote: input.internalNote,
        })
      }
      setAction(null)
      setSuccess('Decisão registrada com sucesso.')
      await load()
    } catch (error) {
      const reviewError = error as ProfessionalReviewError
      if (reviewError.code === 'stale-version' || reviewError.code === 'stale-revision') {
        setAction(null)
        setSuccess(null)
        await load()
        setLoadError('O cadastro mudou enquanto estava aberto. Os dados foram recarregados; revise a versão antes de decidir novamente.')
      } else {
        setActionError(errorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  async function performAssistance(input: {
    publicName: string
    headline: string
    bio: string
    experienceYears: number | null
    internalNote: string
  }) {
    if (!detail) return
    setBusy(true)
    setActionError(null)
    try {
      await professionalReviewService.assistProfile({
        professionalId,
        expectedVersion: detail.operational.profileVersion,
        expectedRevision: detail.operational.revision,
        changes: {
          publicName: input.publicName,
          headline: input.headline,
          bio: input.bio,
          experienceYears: input.experienceYears,
        },
        internalNote: input.internalNote,
      })
      setAction(null)
      setSuccess('Nova versão registrada com autoria administrativa.')
      await load()
    } catch (error) {
      const reviewError = error as ProfessionalReviewError
      if (reviewError.code === 'stale-version' || reviewError.code === 'stale-revision') {
        setAction(null)
        await load()
        setLoadError('O cadastro mudou durante a edição. Os dados foram recarregados e nenhuma alteração foi aplicada.')
      } else {
        setActionError(errorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminLayout
      pageTitle="Detalhes da análise"
      userName={user?.displayName || user?.email || 'Administrador ProFind'}
      activeNavigationHref="/admin/profissionais"
    >
      <div className="grid gap-6">
        <Button asChild variant="ghost" className="w-fit">
          <Link to="/admin/profissionais"><ArrowLeft aria-hidden="true" /> Voltar para a fila</Link>
        </Button>
        {loading ? <PageLoading /> : null}
        {!loading && loadError ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Atualize os dados antes de continuar</AlertTitle>
            <AlertDescription>
              <p>{loadError}</p>
              <Button className="mt-4" variant="outline" onClick={() => setReloadSequence((value) => value + 1)}>
                Recarregar cadastro
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {!loading && !loadError && !detail ? (
          <Card><EmptyState icon={<UserRound aria-hidden="true" />} title="Cadastro não encontrado" description="O cadastro pode ter sido removido da fila ou ainda não foi iniciado." /></Card>
        ) : null}
        {!loading && detail ? (
          <>
            {success ? (
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Operação concluída</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-14 shrink-0 border sm:size-16">
                      {detail.profile.profileImage ? (
                        <AvatarImage src={imageKitDisplayUrl(detail.profile.profileImage.url, 240)} alt="" />
                      ) : null}
                      <AvatarFallback>{detail.profile.publicName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h2 className="break-words text-xl font-bold tracking-tight">
                        {detail.profile.publicName || 'Cadastro profissional'}
                      </h2>
                      <p className="mt-0.5 break-words text-sm text-muted-foreground">
                        {detail.profile.headline || 'Profissão não informada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge variant={statusVariant(detail.operational.reviewStatus)}>
                      {STATUS_LABELS[detail.operational.reviewStatus]}
                    </Badge>
                    <Badge variant={detail.operational.active ? 'success' : 'outline'}>
                      {detail.operational.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>Cadastro <strong className="text-foreground">v{detail.operational.profileVersion}</strong></span>
                  <span>Enviado <strong className={versionBlocked ? 'text-destructive' : 'text-foreground'}>v{detail.operational.submittedVersion ?? '—'}</strong></span>
                  <span>Aprovado <strong className="text-foreground">v{detail.operational.approvedVersion ?? '—'}</strong></span>
                  {versionBlocked ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                      <AlertTriangle className="size-3.5" aria-hidden="true" /> Divergência impede a decisão
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {detail.confirmedEngagements.length > 0 ? (
              <Alert>
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Atendimentos confirmados devem ser preservados</AlertTitle>
                <AlertDescription>
                  <p>Restringir este profissional impede novas oportunidades, mas não cancela os atendimentos abaixo.</p>
                  <ul className="mt-3 grid gap-1">
                    {detail.confirmedEngagements.map((engagement) => (
                      <li key={engagement.requestId}>
                        {formatServiceDate(engagement.serviceDate)} · {PERIOD_LABELS[engagement.period] ?? engagement.period} · {engagement.status === 'IN_PROGRESS' ? 'Em andamento' : 'Confirmado'}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-start">
              <div className="grid min-w-0 gap-5">
                {detail.operational.professionalFeedback ? (
                  <Alert>
                    <ClipboardCheck aria-hidden="true" />
                    <AlertTitle>Feedback visível ao profissional</AlertTitle>
                    <AlertDescription>{detail.operational.professionalFeedback}</AlertDescription>
                  </Alert>
                ) : null}

                <Card>
                  <CardHeader className="pb-3"><CardTitle>Informações profissionais</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sobre</p>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{detail.profile.bio || 'Descrição não preenchida'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Experiência</p>
                      <p className="mt-1">{detail.profile.experienceYears === null ? 'Não informada' : `${detail.profile.experienceYears} ano(s)`}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Disponibilidade</p>
                      <p className="mt-1">{AVAILABILITY_LABELS[detail.profile.availability] ?? 'Não informada'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contato público</p>
                      <p className="mt-1 inline-flex items-center gap-2"><Phone className="size-4 text-muted-foreground" aria-hidden="true" /> {formatPhone(detail.profile.publicPhone)}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle>Serviços e especialidades</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Áreas de serviço</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {detail.profile.categoryIds.length ? detail.profile.categoryIds.map((id) => (
                          <Badge key={id} variant="secondary">{catalog?.categories.find((item) => item.id === id)?.name ?? id}</Badge>
                        )) : <span>Não informadas</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Especialidades</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {detail.profile.specialtyIds.length ? detail.profile.specialtyIds.map((id) => (
                          <Badge key={id} variant="outline">{catalog?.specialties.find((item) => item.id === id)?.name ?? id}</Badge>
                        )) : <span>Não informadas</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle>Região atendida</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Município base</p>
                      <p className="mt-1 inline-flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> {[detail.profile.baseLocation.city, detail.profile.baseLocation.stateCode].filter(Boolean).join(' / ') || 'Não informado'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Forma de atendimento</p>
                      <p className="mt-1">{detail.profile.serviceMode ? SERVICE_MODE_LABELS[detail.profile.serviceMode] ?? detail.profile.serviceMode : 'Não informada'}</p>
                      {detail.profile.serviceMode === 'RADIUS' && detail.profile.serviceRadiusKm !== null ? <p className="mt-1 text-muted-foreground">Até {detail.profile.serviceRadiusKm} km do município base</p> : null}
                    </div>
                    {detail.profile.serviceMode === 'SELECTED_CITIES' ? (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Municípios selecionados</p>
                        <p className="mt-1">{detail.profile.selectedCities.map((city) => `${city.city} / ${city.stateCode}`).join(', ') || 'Nenhum município informado'}</p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="grid items-start gap-5 md:grid-cols-[minmax(12rem,0.75fr)_minmax(0,1.25fr)]">
                  <Card>
                    <CardHeader className="pb-3"><CardTitle>Foto de perfil</CardTitle></CardHeader>
                    <CardContent>
                      {detail.profile.profileImage ? (
                        <button
                          type="button"
                          className="group relative block w-full overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                          aria-label="Ampliar foto de perfil"
                          onClick={(event) => openImage(event, 0)}
                        >
                          <img src={imageKitDisplayUrl(detail.profile.profileImage.url, 640)} alt={detail.profile.profileImage.altText || `Foto de perfil de ${detail.profile.publicName}`} className="aspect-[4/3] w-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/65 px-2 py-2 text-xs font-semibold text-white"><Maximize2 className="size-4" aria-hidden="true" /> Ampliar</span>
                        </button>
                      ) : (
                        <EmptyState icon={<UserRound aria-hidden="true" />} title="Sem foto" description="Nenhuma foto de perfil foi enviada." className="py-5" />
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3"><CardTitle>Portfólio</CardTitle></CardHeader>
                    <CardContent>
                      {detail.profile.portfolioImages.length === 0 ? (
                        <EmptyState icon={<ImageIcon aria-hidden="true" />} title="Portfólio vazio" description="O profissional ainda não enviou imagens." className="py-5" />
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {detail.profile.portfolioImages.map((image, index) => {
                            const viewerImageIndex = index + (detail.profile.profileImage ? 1 : 0)
                            const alt = image.altText || `Item ${index + 1} do portfólio`
                            return (
                              <button
                                key={`${image.url}-${index}`}
                                type="button"
                                className="group relative overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                                aria-label={`Ampliar ${alt}`}
                                onClick={(event) => openImage(event, viewerImageIndex)}
                              >
                                <img src={imageKitDisplayUrl(image.url, 480)} alt={alt} className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]" />
                                <span className="absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-full bg-black/70 text-white" aria-hidden="true"><Maximize2 className="size-4" /></span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <aside aria-label="Decisões administrativas" className="min-w-0 lg:sticky lg:top-24">
                <DecisionPanel detail={detail} versionBlocked={versionBlocked} onAction={openAction} />
              </aside>

              <div className="min-w-0 lg:col-start-1">
                <ReviewTimeline detail={detail} internalNotes={internalNotes} />
              </div>
            </div>

            <DecisionDialog key={action ?? 'closed'} action={action} detail={detail} busy={busy} error={actionError} onClose={() => setAction(null)} onSubmit={(input) => void performDecision(input)} />
            <AssistanceDialog key={`assist-${action ?? 'closed'}-${detail.operational.revision}`} open={action === 'assist'} detail={detail} busy={busy} error={actionError} onClose={() => setAction(null)} onSubmit={(input) => void performAssistance(input)} />
            <AdminImageViewer images={reviewImages} index={viewerIndex} returnFocusTo={viewerReturnFocus} onIndexChange={setViewerIndex} />
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}

export function AdminProfessionalReviewPage() {
  const { professionalId } = useParams<{ professionalId?: string }>()
  return professionalId
    ? <AdminProfessionalDetail professionalId={professionalId} />
    : <AdminProfessionalQueue />
}
