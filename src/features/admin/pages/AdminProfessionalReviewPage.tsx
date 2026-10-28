import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ImageIcon,
  RefreshCw,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar className="size-16 border">
                    {detail.profile.profileImage ? <AvatarImage src={detail.profile.profileImage.url} alt="" /> : null}
                    <AvatarFallback>{detail.profile.publicName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <CardTitle className="text-xl">{detail.profile.publicName || 'Cadastro profissional'}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{detail.profile.headline || 'Apresentação não preenchida'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(detail.operational.reviewStatus)}>{STATUS_LABELS[detail.operational.reviewStatus]}</Badge>
                  <Badge variant={detail.operational.active ? 'success' : 'outline'}>{detail.operational.active ? 'Ativo' : 'Inativo'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 border-t pt-5 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Versão do cadastro</p><p className="font-semibold">{detail.operational.profileVersion}</p></div>
                <div><p className="text-xs text-muted-foreground">Versão enviada</p><p className="font-semibold">{detail.operational.submittedVersion ?? '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Versão aprovada</p><p className="font-semibold">{detail.operational.approvedVersion ?? '—'}</p></div>
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

            <section aria-labelledby="admin-actions-title">
              <h2 id="admin-actions-title" className="text-lg font-bold">Ações administrativas</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.operational.reviewStatus === 'UNDER_REVIEW' ? (
                  <>
                    <Button onClick={() => { setActionError(null); setAction('approve') }}>Aprovar</Button>
                    <Button variant="outline" onClick={() => { setActionError(null); setAction('changes') }}>Solicitar ajustes</Button>
                    <Button variant="destructive" onClick={() => { setActionError(null); setAction('reject') }}>Rejeitar</Button>
                  </>
                ) : null}
                {detail.operational.reviewStatus === 'APPROVED' ? (
                  <>
                    <Button variant="destructive" onClick={() => { setActionError(null); setAction('suspend') }}>Suspender</Button>
                    <Button variant="outline" onClick={() => { setActionError(null); setAction(detail.operational.active ? 'deactivate' : 'reactivate') }}>
                      {detail.operational.active ? 'Desativar' : 'Reativar'}
                    </Button>
                  </>
                ) : null}
                {detail.operational.reviewStatus === 'REJECTED' || detail.operational.reviewStatus === 'SUSPENDED' ? (
                  <Button variant="outline" onClick={() => { setActionError(null); setAction('changes') }}>Permitir correções</Button>
                ) : null}
                <Button variant="secondary" onClick={() => { setActionError(null); setAction('assist') }}>Auxiliar no preenchimento</Button>
              </div>
            </section>

            {detail.operational.professionalFeedback ? (
              <Alert>
                <ClipboardCheck aria-hidden="true" />
                <AlertTitle>Feedback visível ao profissional</AlertTitle>
                <AlertDescription>{detail.operational.professionalFeedback}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
              <Card>
                <CardHeader><CardTitle>Dados do cadastro</CardTitle></CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="sm:col-span-2"><p className="text-muted-foreground">Descrição</p><p className="mt-1 whitespace-pre-wrap">{detail.profile.bio || 'Não preenchida'}</p></div>
                  <div><p className="text-muted-foreground">Experiência</p><p>{detail.profile.experienceYears === null ? 'Não informada' : `${detail.profile.experienceYears} ano(s)`}</p></div>
                  <div><p className="text-muted-foreground">Localidade</p><p>{[detail.profile.baseLocation.city, detail.profile.baseLocation.stateCode].filter(Boolean).join(' / ') || 'Não informada'}</p></div>
                  <div><p className="text-muted-foreground">Categorias</p><p>{detail.profile.categoryIds.map((id) => catalog?.categories.find((item) => item.id === id)?.name ?? id).join(', ') || 'Não informadas'}</p></div>
                  <div><p className="text-muted-foreground">Especialidades</p><p>{detail.profile.specialtyIds.map((id) => catalog?.specialties.find((item) => item.id === id)?.name ?? id).join(', ') || 'Não informadas'}</p></div>
                  <div><p className="text-muted-foreground">Disponibilidade</p><p>{detail.profile.availability || 'Não informada'}</p></div>
                  <div><p className="text-muted-foreground">Telefone público</p><p>{detail.profile.publicPhone || 'Não publicado'}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Foto e portfólio</CardTitle></CardHeader>
                <CardContent>
                  {detail.profile.portfolioImages.length === 0 ? (
                    <EmptyState icon={<ImageIcon aria-hidden="true" />} title="Portfólio vazio" description="O profissional ainda não enviou imagens para o portfólio." />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {detail.profile.portfolioImages.map((image, index) => (
                        <img key={`${image.url}-${index}`} src={image.url} alt={image.altText || `Item ${index + 1} do portfólio`} className="aspect-square w-full rounded-md border object-cover" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Histórico da análise</CardTitle></CardHeader>
              <CardContent>
                {detail.history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p> : (
                  <ol className="grid gap-4">
                    {detail.history.map((event) => {
                      const internal = internalNotes.get(event.eventId)
                      return (
                        <li key={event.eventId} className="rounded-md border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div><p className="font-semibold">{ACTION_LABELS[event.action]}</p><p className="text-xs text-muted-foreground">{event.actorRole === 'ADMIN' ? 'Ação administrativa' : 'Ação do profissional'} · versão {event.profileVersion}</p></div>
                            <time className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</time>
                          </div>
                          {event.reason ? <p className="mt-3 text-sm"><span className="font-medium">Feedback:</span> {event.reason}</p> : null}
                          {internal?.note ? <p className="mt-2 rounded-md bg-muted p-3 text-sm"><span className="font-medium">Nota interna:</span> {internal.note}</p> : null}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            <DecisionDialog key={action ?? 'closed'} action={action} detail={detail} busy={busy} error={actionError} onClose={() => setAction(null)} onSubmit={(input) => void performDecision(input)} />
            <AssistanceDialog key={`assist-${action ?? 'closed'}-${detail.operational.revision}`} open={action === 'assist'} detail={detail} busy={busy} error={actionError} onClose={() => setAction(null)} onSubmit={(input) => void performAssistance(input)} />
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
