import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ImagePlus,
  Images,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { getImageProvider } from '../../../providers/image-provider.factory'
import { listAvailableCatalog } from '../../../services/catalog.service'
import {
  PROFESSIONAL_IMAGE_ACCEPTED_TYPES,
  PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH,
  PROFESSIONAL_IMAGE_MAX_SIZE_BYTES,
  PROFESSIONAL_PORTFOLIO_MAX_IMAGES,
  ProfessionalImageError,
  prepareImageRemoval,
  removeProfessionalImage,
  uploadProfessionalImage,
  validateProfessionalImageFile,
} from '../../../services/professional-images.service'
import {
  loadProfessionalProfile,
  ProfessionalProfileError,
  saveProfessionalProfile,
  type EditableProfessionalProfileStatus,
} from '../../../services/professional-profile.service'
import type { ServiceCatalog } from '../../../types/catalog'
import type {
  ProfessionalImageMetadata,
  ProfessionalProfile,
  ProfessionalProfileInput,
} from '../../../types/professional-profile'
import { useAuth } from '../../auth/use-auth'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

type UploadStatus = 'uploading' | 'error' | 'success'

interface PortfolioUploadTask {
  id: string
  file: File
  order: number
  previewUrl: string | null
  progress: number
  status: UploadStatus
  error?: string
  providerId?: string
  previousReference?: ProfessionalImageMetadata
  altText: string
}

interface SelectionError {
  order: number
  message: string
}

function taskId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function profileInput(
  profile: ProfessionalProfile | null,
  fallbackName: string,
  portfolioImages: ProfessionalImageMetadata[],
): ProfessionalProfileInput {
  return {
    publicName: profile?.publicName ?? fallbackName,
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    categoryIds: [...(profile?.categoryIds ?? [])],
    specialtyIds: [...(profile?.specialtyIds ?? [])],
    experienceYears: profile?.experienceYears ?? null,
    baseLocation: profile
      ? { ...profile.baseLocation }
      : { city: '', stateCode: '', ibgeCode: '' },
    serviceMode: profile?.serviceMode ?? 'CITY_ONLY',
    serviceRadiusKm: profile?.serviceRadiusKm ?? null,
    selectedCities: (profile?.selectedCities ?? []).map((location) => ({
      ...location,
    })),
    availability: profile?.availability ?? 'AVAILABLE',
    phone: profile?.phone ?? '',
    contactVisibility: profile?.contactVisibility ?? 'PRIVATE',
    privateLocation: { ...(profile?.privateLocation ?? { postalCode: '' }) },
    profileImage: profile?.profileImage ? { ...profile.profileImage } : null,
    portfolioImages,
  }
}

function PortfolioLoading() {
  return (
    <div role="status" aria-label="Carregando portfólio" className="space-y-6">
      <Skeleton className="h-24" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  )
}

function UploadTaskFeedback({
  task,
  onRetry,
  onDiscard,
}: {
  task: PortfolioUploadTask
  onRetry: () => void
  onDiscard: () => void
}) {
  return (
    <div
      className="w-full min-w-0 max-w-full space-y-2 rounded-md bg-muted/40 p-3 [contain:inline-size]"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium" title={task.file.name}>
          {task.file.name}
        </p>
        {task.status === 'success' ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> Enviado
          </span>
        ) : null}
      </div>
      {task.status === 'uploading' ? (
        <>
          <progress
            value={task.progress}
            max={100}
            aria-label={`Enviando ${task.file.name}: ${task.progress}%`}
            className="block h-2 w-full min-w-0 max-w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            Enviando… {task.progress}%
          </p>
        </>
      ) : null}
      {task.status === 'error' ? (
        <>
          <p role="alert" className="max-w-full break-words text-xs text-destructive">
            {task.error}
          </p>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden="true" /> Tentar novamente
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              <X aria-hidden="true" /> Descartar
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function ProfessionalPortfolioPage() {
  useDocumentTitle('Portfólio profissional — ProFind')
  const { user } = useAuth()
  const { profile: userProfile, syncProfessionalProfile } = useProfile()
  const userId = user?.uid
  const imageProvider = useMemo(() => getImageProvider(), [])
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null)
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null)
  const [images, setImages] = useState<ProfessionalImageMetadata[]>([])
  const [tasks, setTasks] = useState<PortfolioUploadTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<SelectionError | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [cleanupErrors, setCleanupErrors] = useState<
    Record<string, string | undefined>
  >({})
  const [pendingCleanup, setPendingCleanup] = useState<
    ProfessionalImageMetadata[]
  >([])
  const [saving, setSaving] = useState(false)
  const [imagePendingRemoval, setImagePendingRemoval] =
    useState<ProfessionalImageMetadata | null>(null)
  const [attempt, setAttempt] = useState(0)
  const previews = useRef(new Set<string>())

  useEffect(
    () => () => {
      for (const previewUrl of previews.current) URL.revokeObjectURL(previewUrl)
    },
    [],
  )

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setLoadError(null)
    void Promise.all([loadProfessionalProfile(userId), listAvailableCatalog()])
      .then(([loadedProfile, loadedCatalog]) => {
        if (!active) return
        setProfile(loadedProfile)
        setCatalog(loadedCatalog)
        setImages(
          (loadedProfile?.portfolioImages ?? []).map((image) => ({ ...image })),
        )
        setTasks([])
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o portfólio.',
        )
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attempt, userId])

  const persistedImages = profile?.portfolioImages ?? []
  const hasUnsavedChanges =
    JSON.stringify(images) !== JSON.stringify(persistedImages)
  const uploading = tasks.some((task) => task.status === 'uploading')
  const isSuspended = profile?.status === 'SUSPENDED'
  const isBusy = saving || uploading
  const remainingSlots = Math.max(
    0,
    PROFESSIONAL_PORTFOLIO_MAX_IMAGES - images.length,
  )
  const gallerySlots = Array.from(
    { length: PROFESSIONAL_PORTFOLIO_MAX_IMAGES },
    (_, order) => {
      const image = images[order]
      const task = image
        ? tasks.find(
            (item) =>
              item.status !== 'success' &&
              item.previousReference?.providerId === image.providerId,
          ) ?? tasks.find((item) => item.providerId === image.providerId)
        : tasks.find(
            (item) =>
              !item.previousReference &&
              item.order === order &&
              item.status !== 'success',
          )
      return { order, image, task }
    },
  )

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  function releasePreview(previewUrl: string | null) {
    if (!previewUrl) return
    URL.revokeObjectURL(previewUrl)
    previews.current.delete(previewUrl)
  }

  function discardTask(task: PortfolioUploadTask) {
    releasePreview(task.previewUrl)
    setTasks((current) => current.filter((item) => item.id !== task.id))
    setSelectionError(null)
  }

  async function runUpload(task: PortfolioUploadTask, retry = false) {
    if (!userId) return
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: 'uploading', progress: 0, error: undefined }
          : item,
      ),
    )
    try {
      const uploaded = await uploadProfessionalImage(
        imageProvider,
        {
          ownerId: userId,
          purpose: 'PROFESSIONAL_PORTFOLIO',
          file: task.file,
          previousReference: task.previousReference,
          onProgress: (progress) =>
            setTasks((current) =>
              current.map((item) =>
                item.id === task.id ? { ...item, progress } : item,
              ),
            ),
        },
        {
          retry,
          order: task.order,
          altText: task.altText,
          currentPortfolioCount: task.previousReference
            ? images.length - 1
            : images.length,
        },
      )
      setImages((current) => {
        const next = task.previousReference
          ? current.map((image) =>
              image.providerId === task.previousReference?.providerId
                ? uploaded
                : image,
            )
          : [...current, uploaded]
        return next.map((image, order) => ({ ...image, order }))
      })
      releasePreview(task.previewUrl)
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: 'success',
                progress: 100,
                providerId: uploaded.providerId,
                previewUrl: null,
                error: undefined,
              }
            : item,
        ),
      )
      setSelectionError(null)
    } catch (error) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: 'error',
                error:
                  error instanceof ProfessionalImageError
                    ? error.message
                    : 'Não foi possível enviar a imagem. Tente novamente.',
              }
            : item,
        ),
      )
    }
  }

  async function selectFiles(
    files: FileList | null,
    previousReference?: ProfessionalImageMetadata,
  ) {
    if (!files?.length || isSuspended) return
    const selected = previousReference
      ? Array.from(files).slice(0, 1)
      : Array.from(files)
    const pendingAdds = tasks.filter(
      (task) =>
        !task.previousReference &&
        task.status !== 'success' &&
        !images.some((image) => image.providerId === task.providerId),
    ).length
    const targetOrder = previousReference?.order ?? images.length + pendingAdds
    if (!previousReference && selected.length > remainingSlots - pendingAdds) {
      setSelectionError({
        order: Math.min(targetOrder, PROFESSIONAL_PORTFOLIO_MAX_IMAGES - 1),
        message: `Adicione no máximo ${PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens ao portfólio.`,
      })
      return
    }
    try {
      selected.forEach((file, index) =>
        validateProfessionalImageFile(
          file,
          'PROFESSIONAL_PORTFOLIO',
          previousReference ? images.length - 1 : images.length + pendingAdds + index,
        ),
      )
    } catch (error) {
      setSelectionError({
        order: Math.min(targetOrder, PROFESSIONAL_PORTFOLIO_MAX_IMAGES - 1),
        message: error instanceof ProfessionalImageError
          ? error.message
          : 'Revise as imagens selecionadas.',
      })
      return
    }

    setSelectionError(null)
    for (const [index, file] of selected.entries()) {
      const previewUrl =
        typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
      if (previewUrl) previews.current.add(previewUrl)
      const task: PortfolioUploadTask = {
        id: taskId(),
        file,
        order: previousReference
          ? previousReference.order
          : images.length + pendingAdds + index,
        previewUrl,
        progress: 0,
        status: 'uploading',
        previousReference,
        altText: previousReference?.altText ?? '',
      }
      setTasks((current) => [...current, task])
      await runUpload(task)
    }
  }

  function updateAltText(image: ProfessionalImageMetadata, altText: string) {
    const accessibleDescription = altText.slice(
      0,
      PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH,
    )
    setImages((current) =>
      current.map((item) =>
        item.providerId === image.providerId
          ? { ...item, altText: accessibleDescription, updatedAt: Date.now() }
          : item,
      ),
    )
    setSaveError(null)
  }

  function removeImage(image: ProfessionalImageMetadata) {
    setImages((current) =>
      current
        .filter((item) => item.providerId !== image.providerId)
        .map((item, order) => ({ ...item, order })),
    )
    setTasks((current) =>
      current.filter(
        (task) =>
          task.providerId !== image.providerId &&
          task.previousReference?.providerId !== image.providerId,
      ),
    )
    setImagePendingRemoval(null)
    setSaveError(null)
  }

  async function cleanRemovedImages(
    previous: ProfessionalImageMetadata[],
    saved: ProfessionalImageMetadata[],
  ) {
    if (!userId) return
    const savedIds = new Set(saved.map((image) => image.providerId))
    const removed = previous.filter(
      (image) => image.provider !== 'LEGACY' && !savedIds.has(image.providerId),
    )
    await Promise.all(
      removed.map(async (image) => {
        try {
          await removeProfessionalImage(
            imageProvider,
            image,
            userId,
            'PROFESSIONAL_PORTFOLIO',
          )
          setCleanupErrors((current) => ({
            ...current,
            [image.providerId]: undefined,
          }))
          setPendingCleanup((current) =>
            current.filter((item) => item.providerId !== image.providerId),
          )
        } catch (error) {
          setCleanupErrors((current) => ({
            ...current,
            [image.providerId]:
              error instanceof Error
                ? error.message
              : 'Não foi possível remover o arquivo anterior.',
          }))
          setPendingCleanup((current) =>
            current.some((item) => item.providerId === image.providerId)
              ? current
              : [...current, image],
          )
        }
      }),
    )
  }

  async function savePortfolio() {
    if (!userId || !catalog || saving || uploading || isSuspended) return
    setSaving(true)
    setSaveError(null)
    const previous = persistedImages.map((image) => ({ ...image }))
    try {
      const nextIds = new Set(images.map((image) => image.providerId))
      const pendingRemovals = previous.filter(
        (image) => image.provider !== 'LEGACY' && !nextIds.has(image.providerId),
      )
      await Promise.all(
        pendingRemovals.map((image) =>
          prepareImageRemoval(
            imageProvider,
            image,
            userId,
            'PROFESSIONAL_PORTFOLIO',
          ),
        ),
      )
      const status: EditableProfessionalProfileStatus =
        profile?.status === 'PUBLISHED' || profile?.status === 'PAUSED'
          ? profile.status
          : 'DRAFT'
      const saved = await saveProfessionalProfile(
        userId,
        profileInput(profile, userProfile?.name ?? '', images),
        status,
        catalog,
        profile,
      )
      setProfile(saved)
      setImages(saved.portfolioImages.map((image) => ({ ...image })))
      syncProfessionalProfile(saved)
      for (const task of tasks) releasePreview(task.previewUrl)
      setTasks([])
      toast.success('Portfólio salvo com sucesso.')
      await cleanRemovedImages(previous, saved.portfolioImages)
    } catch (error) {
      const message =
        error instanceof ProfessionalProfileError
          ? error.fieldErrors.portfolioImages ?? error.message
          : 'Não foi possível salvar o portfólio agora.'
      setSaveError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const layout = (content: React.ReactNode) => (
    <ProfessionalLayout
      pageTitle="Portfólio"
      activeNavigationHref="/profissional/portfolio"
      userName={userProfile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      {content}
    </ProfessionalLayout>
  )

  if (loading) return layout(<PortfolioLoading />)

  if (loadError || !catalog) {
    return layout(
      <Alert variant="destructive" className="mx-auto max-w-2xl">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Não foi possível carregar o portfólio</AlertTitle>
        <AlertDescription>
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>,
    )
  }

  return layout(
    <div
      className={`min-w-0 max-w-full space-y-6 ${
        hasUnsavedChanges ? 'pb-24 md:pb-0' : ''
      }`}
    >
      <header className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-3">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link to="/profissional/perfil">
              <ArrowLeft aria-hidden="true" /> Voltar ao perfil profissional
            </Link>
          </Button>
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Trabalhos realizados
              </h2>
              <Badge variant="outline" className="shrink-0">
                {images.length} de {PROFESSIONAL_PORTFOLIO_MAX_IMAGES}{' '}
                trabalhos adicionados
              </Badge>
            </div>
            <p className="max-w-2xl break-words text-sm leading-6 text-muted-foreground">
              Mostre serviços reais e ajude clientes a conhecer a qualidade do seu trabalho.
            </p>
          </div>
        </div>

        <div
          className={
            hasUnsavedChanges
              ? 'fixed right-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 z-[35] flex w-full min-w-0 max-w-[100dvw] items-center justify-between gap-3 border-t bg-background/95 p-3 shadow-soft backdrop-blur supports-[backdrop-filter]:bg-background/90 md:static md:z-auto md:w-auto md:shrink-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none'
              : 'hidden min-w-0 items-center gap-3 md:flex md:shrink-0'
          }
          aria-live="polite"
        >
          <p className="min-w-0 break-words text-xs font-medium text-warning md:text-sm">
            {hasUnsavedChanges ? 'Alterações não salvas' : 'Tudo salvo'}
          </p>
          <Button
            type="button"
            className="shrink-0"
            loading={saving}
            loadingLabel="Salvando…"
            disabled={!hasUnsavedChanges || isBusy || isSuspended}
            onClick={() => void savePortfolio()}
          >
            <Save aria-hidden="true" /> Salvar portfólio
          </Button>
        </div>
      </header>

      {isSuspended ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Perfil suspenso</AlertTitle>
          <AlertDescription>
            O portfólio não pode ser alterado enquanto a suspensão estiver ativa.
          </AlertDescription>
        </Alert>
      ) : null}

      {!imageProvider.configured ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Envio de imagens indisponível</AlertTitle>
          <AlertDescription>
            O provedor de imagens não está configurado.
          </AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Não foi possível salvar</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      {Object.values(cleanupErrors).some(Boolean) ? (
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Portfólio salvo com limpeza pendente</AlertTitle>
          <AlertDescription>
            <p>
              A nova seleção está salva, mas um arquivo anterior ainda não pôde ser removido do provedor.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={isBusy || pendingCleanup.length === 0}
              onClick={() => void cleanRemovedImages(pendingCleanup, [])}
            >
              <RotateCcw aria-hidden="true" /> Tentar limpeza novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="portfolio-gallery-title" className="min-w-0 max-w-full space-y-4">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h3 id="portfolio-gallery-title" className="text-lg font-bold tracking-tight">
              Sua galeria
            </h3>
            <p className="break-words text-sm text-muted-foreground">
              {images.length === 0
                ? 'Seu portfólio ainda está vazio. Escolha uma posição para adicionar a primeira foto.'
                : `${remainingSlots} ${remainingSlots === 1 ? 'posição disponível' : 'posições disponíveis'}.`}
            </p>
          </div>
          <p className="min-w-0 break-words text-xs text-muted-foreground">
            JPEG, PNG ou WebP · até {PROFESSIONAL_IMAGE_MAX_SIZE_BYTES / 1024 / 1024} MB
          </p>
        </div>

        <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] items-start gap-5 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          {gallerySlots.map(({ order, image, task }) => {
            const position = order + 1
            const errorForSlot = selectionError?.order === order ? selectionError.message : null

            if (image) {
              const helpId = `professional-portfolio-alt-help-${order}`
              return (
                <article
                  key={image.providerId}
                  className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border bg-card shadow-soft [contain:inline-size]"
                >
                  <div className="relative aspect-[4/3] w-full min-w-0 max-w-full overflow-hidden bg-muted">
                    <img
                      src={image.url}
                      alt={image.altText || `Prévia do trabalho ${position} do portfólio`}
                      className="block h-full w-full min-w-0 max-w-full object-cover"
                    />
                    <Badge className="absolute top-3 left-3 shadow-sm">
                      Trabalho {position}
                    </Badge>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`professional-portfolio-alt-${order}`}>
                        Texto alternativo da imagem {position}
                      </Label>
                      <Input
                        id={`professional-portfolio-alt-${order}`}
                        value={image.altText}
                        maxLength={PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH}
                        placeholder="Ex.: Cozinha planejada finalizada"
                        aria-describedby={helpId}
                        disabled={isBusy || isSuspended}
                        onChange={(event) => updateAltText(image, event.target.value)}
                      />
                      <div
                        id={helpId}
                        className="flex min-w-0 items-start justify-between gap-3 text-xs text-muted-foreground"
                      >
                        <p className="min-w-0 break-words">
                          Ajuda pessoas que usam leitores de tela.
                        </p>
                        <span className="shrink-0 tabular-nums">
                          {image.altText.length}/{PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH}
                        </span>
                      </div>
                    </div>

                    {task ? (
                      <UploadTaskFeedback
                        task={task}
                        onRetry={() => void runUpload(task, true)}
                        onDiscard={() => discardTask(task)}
                      />
                    ) : null}
                    {errorForSlot ? (
                      <p
                        role="alert"
                        className="max-w-full break-words rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      >
                        {errorForSlot}
                      </p>
                    ) : null}

                    <div className="mt-auto grid min-w-0 grid-cols-2 gap-2">
                      <Label
                        htmlFor={`professional-portfolio-replace-${order}`}
                        className="inline-flex min-h-11 min-w-0 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-center text-sm font-semibold break-words transition-colors hover:bg-accent"
                      >
                        <Upload className="size-4 shrink-0" aria-hidden="true" /> Substituir
                      </Label>
                      <input
                        id={`professional-portfolio-replace-${order}`}
                        type="file"
                        accept={PROFESSIONAL_IMAGE_ACCEPTED_TYPES.join(',')}
                        className="sr-only"
                        disabled={!imageProvider.configured || isBusy || isSuspended}
                        onChange={(event) => {
                          void selectFiles(event.currentTarget.files, image)
                          event.currentTarget.value = ''
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-w-0 px-3"
                        aria-label={`Remover trabalho ${position}`}
                        disabled={isBusy || isSuspended}
                        onClick={() => setImagePendingRemoval(image)}
                      >
                        <Trash2 aria-hidden="true" /> Remover
                      </Button>
                    </div>
                  </div>
                </article>
              )
            }

            if (task) {
              return (
                <article
                  key={task.id}
                  className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border bg-card shadow-soft [contain:inline-size]"
                >
                  <div className="relative aspect-[4/3] w-full min-w-0 max-w-full overflow-hidden bg-muted">
                    {task.previewUrl ? (
                      <img
                        src={task.previewUrl}
                        alt={`Prévia temporária do trabalho ${position}`}
                        className="block h-full w-full min-w-0 max-w-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Images className="size-8 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <Badge className="absolute top-3 left-3 shadow-sm">
                      Trabalho {position}
                    </Badge>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-end gap-3 p-4">
                    <UploadTaskFeedback
                      task={task}
                      onRetry={() => void runUpload(task, true)}
                      onDiscard={() => discardTask(task)}
                    />
                    {errorForSlot ? (
                      <p
                        role="alert"
                        className="max-w-full break-words text-xs text-destructive"
                      >
                        {errorForSlot}
                      </p>
                    ) : null}
                  </div>
                </article>
              )
            }

            return (
              <div
                key={`empty-${order}`}
                className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-dashed border-primary/40 bg-primary/[0.025] [contain:inline-size]"
              >
                <Label
                  htmlFor={`professional-portfolio-add-${order}`}
                  className="flex aspect-[4/3] min-h-44 w-full min-w-0 max-w-full cursor-pointer flex-col items-center justify-center gap-2 px-5 py-6 text-center transition-colors hover:bg-primary/5 focus-within:ring-[3px] focus-within:ring-ring/25"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <ImagePlus className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-semibold text-foreground">Adicionar trabalho</span>
                  <span className="max-w-full break-words text-xs font-normal text-muted-foreground">
                    JPEG, PNG ou WebP · até {PROFESSIONAL_IMAGE_MAX_SIZE_BYTES / 1024 / 1024} MB
                  </span>
                  <input
                    id={`professional-portfolio-add-${order}`}
                    type="file"
                    accept={PROFESSIONAL_IMAGE_ACCEPTED_TYPES.join(',')}
                    className="sr-only"
                    aria-label={
                      images.length === 0 && order === 0
                        ? 'Adicionar primeira foto'
                        : `Adicionar trabalho ${position}`
                    }
                    disabled={!imageProvider.configured || isBusy || isSuspended}
                    onChange={(event) => {
                      void selectFiles(event.currentTarget.files)
                      event.currentTarget.value = ''
                    }}
                  />
                </Label>
                {errorForSlot ? (
                  <p
                    role="alert"
                    className="mx-4 mb-4 max-w-full break-words rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    {errorForSlot}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <PrivacyNotice
        title="Privacidade das imagens"
        className="border-border/70 bg-muted/20 p-3 text-xs"
      >
        Enviamos o arquivo apenas ao provedor configurado e salvamos somente a URL HTTPS, o identificador, a ordem e o texto alternativo.
      </PrivacyNotice>

      <Dialog
        open={Boolean(imagePendingRemoval)}
        onOpenChange={(open) => {
          if (!open) setImagePendingRemoval(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover este trabalho?</DialogTitle>
            <DialogDescription>
              A imagem sairá da galeria quando você salvar o portfólio. Esta ação pode ser cancelada antes do salvamento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImagePendingRemoval(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (imagePendingRemoval) removeImage(imagePendingRemoval)
              }}
            >
              <Trash2 aria-hidden="true" /> Remover trabalho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>,
  )
}
