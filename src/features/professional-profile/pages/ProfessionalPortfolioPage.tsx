import {
  AlertTriangle,
  ArrowLeft,
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
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
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

function UploadTaskStatus({
  task,
  onRetry,
  onDiscard,
}: {
  task: PortfolioUploadTask
  onRetry: () => void
  onDiscard: () => void
}) {
  return (
    <div className="grid w-full min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border bg-muted/20 p-3 sm:grid-cols-[5rem_minmax(0,1fr)]" aria-live="polite">
      {task.previewUrl ? (
        <img
          src={task.previewUrl}
          alt="Prévia da imagem selecionada"
          className="aspect-square block w-20 max-w-full rounded-md bg-muted object-cover"
        />
      ) : (
        <div className="flex aspect-square w-20 max-w-full items-center justify-center rounded-md bg-muted">
          <Images className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 max-w-full space-y-2">
        <p className="truncate text-sm font-medium">{task.file.name}</p>
        {task.status === 'uploading' ? (
          <>
            <progress
              value={task.progress}
              max={100}
              aria-label={`Enviando ${task.file.name}: ${task.progress}%`}
              className="block h-2 w-full min-w-0 max-w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">Enviando… {task.progress}%</p>
          </>
        ) : null}
        {task.status === 'error' ? (
          <>
            <p role="alert" className="break-words text-sm text-destructive">{task.error}</p>
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
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [cleanupErrors, setCleanupErrors] = useState<
    Record<string, string | undefined>
  >({})
  const [pendingCleanup, setPendingCleanup] = useState<
    ProfessionalImageMetadata[]
  >([])
  const [saving, setSaving] = useState(false)
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
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: 'success',
                progress: 100,
                providerId: uploaded.providerId,
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
    if (!previousReference && selected.length > remainingSlots - pendingAdds) {
      setSelectionError(
        `Adicione no máximo ${PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens ao portfólio.`,
      )
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
      setSelectionError(
        error instanceof ProfessionalImageError
          ? error.message
          : 'Revise as imagens selecionadas.',
      )
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
    setImages((current) =>
      current.map((item) =>
        item.providerId === image.providerId
          ? { ...item, altText, updatedAt: Date.now() }
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
    setSaveError(null)
  }

  function previewFor(image: ProfessionalImageMetadata) {
    return (
      tasks.find((task) => task.providerId === image.providerId)?.previewUrl ??
      image.url
    )
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
      activeNavigationHref="/profissional/perfil"
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
    <div className="min-w-0 max-w-full space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link to="/profissional/perfil">
              <ArrowLeft aria-hidden="true" /> Voltar ao perfil profissional
            </Link>
          </Button>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Trabalhos realizados</h2>
            <p className="mt-1 max-w-2xl break-words text-sm leading-6 text-muted-foreground">
              Mostre até {PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens reais do seu trabalho. Use textos alternativos objetivos para tornar o conteúdo acessível.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="w-full shrink-0 sm:w-auto"
          loading={saving}
          loadingLabel="Salvando…"
          disabled={!hasUnsavedChanges || isBusy || isSuspended}
          onClick={() => void savePortfolio()}
        >
          <Save aria-hidden="true" /> Salvar portfólio
        </Button>
      </div>

      {isSuspended ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Perfil suspenso</AlertTitle>
          <AlertDescription>O portfólio não pode ser alterado enquanto a suspensão estiver ativa.</AlertDescription>
        </Alert>
      ) : null}

      {!imageProvider.configured ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Envio de imagens indisponível</AlertTitle>
          <AlertDescription>O provedor de imagens não está configurado.</AlertDescription>
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
            <p>A nova seleção está salva, mas um arquivo anterior ainda não pôde ser removido do provedor.</p>
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

      <Card>
        <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Imagens do portfólio</CardTitle>
            <CardDescription>
              {images.length === 0
                ? 'Nenhuma imagem adicionada'
                : `${images.length} de ${PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens`}
            </CardDescription>
          </div>
          <p className="break-words text-xs text-muted-foreground">
            JPEG, PNG ou WebP · até {PROFESSIONAL_IMAGE_MAX_SIZE_BYTES / 1024 / 1024} MB por imagem
          </p>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          {images.length === 0 && tasks.length === 0 ? (
            <div className="flex min-w-0 flex-col items-center rounded-lg border border-dashed bg-muted/20 px-4 py-10 text-center">
              <ImagePlus className="size-10 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-semibold">Seu portfólio ainda está vazio</h3>
              <p className="mt-2 max-w-md break-words text-sm text-muted-foreground">
                Adicione fotos que ajudem clientes a entender a qualidade e o tipo de serviço realizado.
              </p>
              <Label
                htmlFor="professional-portfolio-empty-file"
                className="mt-5 inline-flex min-h-11 max-w-full cursor-pointer flex-wrap items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium break-words text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <Upload className="size-4" aria-hidden="true" /> Adicionar primeira foto
              </Label>
              <Input
                id="professional-portfolio-empty-file"
                type="file"
                accept={PROFESSIONAL_IMAGE_ACCEPTED_TYPES.join(',')}
                className="sr-only"
                disabled={!imageProvider.configured || isBusy || isSuspended}
                onChange={(event) => {
                  void selectFiles(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
              />
            </div>
          ) : (
            <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
              {images.map((image, index) => (
                <article key={image.providerId} className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-lg border bg-card">
                  <img
                    src={previewFor(image)}
                    alt={image.altText || `Prévia da imagem ${index + 1} do portfólio`}
                    className="aspect-[4/3] block w-full min-w-0 max-w-full bg-muted object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`professional-portfolio-alt-${index}`}>
                        Texto alternativo da imagem {index + 1}
                      </Label>
                      <Input
                        id={`professional-portfolio-alt-${index}`}
                        value={image.altText}
                        maxLength={PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH}
                        placeholder="Descreva o serviço mostrado"
                        disabled={isBusy || isSuspended}
                        onChange={(event) => updateAltText(image, event.target.value)}
                      />
                      <p className="break-words text-xs text-muted-foreground">
                        {image.altText.length}/{PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH} caracteres
                      </p>
                    </div>
                    <div className="mt-auto flex min-w-0 flex-wrap gap-2">
                      <Label
                        htmlFor={`professional-portfolio-replace-${index}`}
                        className="inline-flex min-h-11 max-w-full cursor-pointer flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium break-words shadow-xs hover:bg-accent"
                      >
                        <Upload className="size-4" aria-hidden="true" /> Substituir
                      </Label>
                      <Input
                        id={`professional-portfolio-replace-${index}`}
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
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        disabled={isBusy || isSuspended}
                        onClick={() => removeImage(image)}
                      >
                        <Trash2 aria-hidden="true" /> Remover
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {tasks
            .filter((task) => task.status !== 'success')
            .map((task) => (
              <UploadTaskStatus
                key={task.id}
                task={task}
                onRetry={() => void runUpload(task, true)}
                onDiscard={() => discardTask(task)}
              />
            ))}

          {selectionError ? (
            <p role="alert" className="max-w-full break-words rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {selectionError}
            </p>
          ) : null}

          {images.length > 0 && remainingSlots > 0 ? (
            <div className="min-w-0 space-y-2">
              <Label
                htmlFor="professional-portfolio-files"
                className="inline-flex min-h-11 max-w-full cursor-pointer flex-wrap items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium break-words shadow-xs hover:bg-accent"
              >
                <Upload className="size-4" aria-hidden="true" /> Adicionar imagens
              </Label>
              <Input
                id="professional-portfolio-files"
                type="file"
                accept={PROFESSIONAL_IMAGE_ACCEPTED_TYPES.join(',')}
                multiple
                className="sr-only"
                disabled={!imageProvider.configured || isBusy || isSuspended}
                onChange={(event) => {
                  void selectFiles(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
              />
              <p className="break-words text-xs text-muted-foreground">
                {remainingSlots} {remainingSlots === 1 ? 'espaço disponível' : 'espaços disponíveis'}.
              </p>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words text-sm text-muted-foreground">
            {hasUnsavedChanges ? 'Há alterações ainda não salvas.' : 'Todas as alterações estão salvas.'}
          </p>
          <Button
            type="button"
            className="w-full sm:w-auto"
            loading={saving}
            loadingLabel="Salvando…"
            disabled={!hasUnsavedChanges || isBusy || isSuspended}
            onClick={() => void savePortfolio()}
          >
            <Save aria-hidden="true" /> Salvar portfólio
          </Button>
        </CardFooter>
      </Card>

      <PrivacyNotice>
        O arquivo é enviado somente ao provedor configurado. O perfil armazena apenas URLs HTTPS, identificadores, ordem e texto alternativo — nunca blob, base64 ou o arquivo bruto.
      </PrivacyNotice>
    </div>,
  )
}
