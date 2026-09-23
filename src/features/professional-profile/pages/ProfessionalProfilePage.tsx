import {
  AlertTriangle,
  Check,
  Circle,
  CircleAlert,
  Eye,
  EyeOff,
  Images,
  MapPin,
  PauseCircle,
  Phone,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { Checkbox } from '../../../components/ui/checkbox'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import { Skeleton } from '../../../components/ui/skeleton'
import { Textarea } from '../../../components/ui/textarea'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { getImageProvider } from '../../../providers/image-provider.factory'
import type { ImagePurpose } from '../../../types/image'
import { listAvailableCatalog } from '../../../services/catalog.service'
import { toProfessionalBaseLocation } from '../../../services/ibge-localities.service'
import {
  formatPostalCode,
  lookupPostalCode,
  normalizePostalCode,
  PostalCodeError,
} from '../../../services/postal-code.service'
import {
  PROFESSIONAL_IMAGE_ACCEPTED_TYPES,
  PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH,
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
  updateProfessionalAvailability,
  normalizeProfessionalProfileInput,
  userProfileStatusForProfessionalProfile,
  validateProfessionalProfile,
  type EditableProfessionalProfileStatus,
  type ProfessionalProfileFieldErrors,
} from '../../../services/professional-profile.service'
import type { ServiceCatalog } from '../../../types/catalog'
import type {
  ProfessionalAvailability,
  ProfessionalBaseLocation,
  ProfessionalContactVisibility,
  ProfessionalProfile,
  ProfessionalProfileInput,
  ProfessionalImageMetadata,
  ProfessionalProfileStatus,
  ProfessionalServiceMode,
} from '../../../types/professional-profile'
import {
  BRAZILIAN_STATE_CODES,
  PROFESSIONAL_SERVICE_RADIUS_OPTIONS,
} from '../../../types/professional-profile'
import { useAuth } from '../../auth/use-auth'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'
import { MunicipalityCombobox } from '../components/MunicipalityCombobox'

interface ProfessionalProfileFormState {
  publicName: string
  headline: string
  bio: string
  categoryIds: string[]
  specialtyIds: string[]
  experienceYears: string
  baseLocation: ProfessionalBaseLocation
  serviceMode: ProfessionalServiceMode | ''
  serviceRadiusKm: string
  selectedCities: ProfessionalBaseLocation[]
  availability: ProfessionalAvailability
  phone: string
  contactVisibility: ProfessionalContactVisibility
  privateLocation: {
    postalCode: string
    neighborhood: string
  }
  profileImage: ProfessionalImageMetadata | null
  portfolioImages: ProfessionalImageMetadata[]
}

type ProfessionalImagePurpose = Exclude<ImagePurpose, 'CLIENT_AVATAR'>

type ImageUploadStatus = 'uploading' | 'success' | 'error'

interface ImageUploadTask {
  id: string
  file: File
  purpose: ProfessionalImagePurpose
  order: number
  previewUrl: string | null
  progress: number
  status: ImageUploadStatus
  error?: string
  providerId?: string
  previousReference?: ProfessionalImageMetadata | null
  altText?: string
}

function uploadTaskId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const availabilityLabels: Record<ProfessionalAvailability, string> = {
  AVAILABLE: 'Aceitando novos serviços',
  LIMITED: 'Agenda limitada',
  UNAVAILABLE: 'Temporariamente indisponível',
}

const contactVisibilityOptions: Array<{
  value: ProfessionalContactVisibility
  label: string
  description: string
}> = [
  {
    value: 'PRIVATE',
    label: 'Privado',
    description: 'Somente você e o backend autorizado podem acessar.',
  },
  {
    value: 'PUBLIC',
    label: 'Público',
    description: 'Clientes poderão ver o telefone no perfil publicado.',
  },
]

const serviceModeOptions: Array<{
  value: ProfessionalServiceMode
  label: string
  description: string
}> = [
  {
    value: 'CITY_ONLY',
    label: 'Somente na minha cidade',
    description: 'Atendimento dentro do município selecionado.',
  },
  {
    value: 'RADIUS',
    label: 'Minha cidade e regiões próximas',
    description: 'Informe uma faixa aproximada de deslocamento.',
  },
  {
    value: 'SELECTED_CITIES',
    label: 'Cidades selecionadas',
    description: 'Escolha explicitamente os municípios atendidos.',
  },
]

const statusLabels: Record<ProfessionalProfileStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  PAUSED: 'Pausado',
  SUSPENDED: 'Suspenso',
}

const statusVariants = {
  DRAFT: 'outline',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  SUSPENDED: 'destructive',
} as const

function emptyForm(publicName: string): ProfessionalProfileFormState {
  return {
    publicName,
    headline: '',
    bio: '',
    categoryIds: [],
    specialtyIds: [],
    experienceYears: '',
    baseLocation: { city: '', stateCode: '', ibgeCode: '' },
    serviceMode: 'CITY_ONLY',
    serviceRadiusKm: '',
    selectedCities: [],
    availability: 'AVAILABLE',
    phone: '',
    contactVisibility: 'PRIVATE',
    privateLocation: { postalCode: '', neighborhood: '' },
    profileImage: null,
    portfolioImages: [],
  }
}

function formFromProfile(
  profile: ProfessionalProfile | null,
  fallbackName: string,
): ProfessionalProfileFormState {
  if (!profile) return emptyForm(fallbackName)

  return {
    publicName: profile.publicName,
    headline: profile.headline,
    bio: profile.bio ?? '',
    categoryIds: [...profile.categoryIds],
    specialtyIds: [...profile.specialtyIds],
    experienceYears:
      profile.experienceYears === null ? '' : String(profile.experienceYears),
    baseLocation: { ...profile.baseLocation },
    serviceMode: profile.serviceMode ?? '',
    serviceRadiusKm:
      profile.serviceRadiusKm === null ? '' : String(profile.serviceRadiusKm),
    selectedCities: profile.selectedCities.map((location) => ({ ...location })),
    availability: profile.availability,
    phone: formatPhone(profile.phone),
    contactVisibility: profile.contactVisibility,
    privateLocation: {
      postalCode: formatPostalCode(profile.privateLocation.postalCode),
      neighborhood: profile.privateLocation.neighborhood ?? '',
    },
    profileImage: profile.profileImage ? { ...profile.profileImage } : null,
    portfolioImages: profile.portfolioImages.map((image) => ({ ...image })),
  }
}

function nullableInteger(value: string) {
  if (!value.trim()) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : Number.NaN
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function inputFromForm(form: ProfessionalProfileFormState): ProfessionalProfileInput {
  return {
    ...form,
    experienceYears: nullableInteger(form.experienceYears),
    serviceMode: form.serviceMode || null,
    serviceRadiusKm: nullableInteger(form.serviceRadiusKm),
  }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}

function ImageUploadStatus({
  task,
  onRetry,
  onDiscard,
}: {
  task: ImageUploadTask
  onRetry: () => void
  onDiscard: () => void
}) {
  const isUploading = task.status === 'uploading'

  return (
    <div
      className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[5rem_minmax(0,1fr)]"
      aria-live="polite"
    >
      {task.previewUrl ? (
        <img
          src={task.previewUrl}
          alt="Prévia da imagem selecionada"
          className="aspect-square w-20 rounded-md bg-muted object-cover"
        />
      ) : (
        <div className="flex aspect-square w-20 items-center justify-center rounded-md bg-muted">
          <Images className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 space-y-2">
        <p className="truncate text-sm font-medium">{task.file.name}</p>
        {isUploading ? (
          <>
            <progress
              value={task.progress}
              max={100}
              aria-label={`Enviando ${task.file.name}: ${task.progress}%`}
              className="h-2 w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">Enviando… {task.progress}%</p>
          </>
        ) : null}
        {task.status === 'error' ? (
          <>
            <p role="alert" className="text-sm text-destructive">{task.error}</p>
            <div className="flex flex-wrap gap-2">
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

function ProfileLoading() {
  return (
    <div role="status" aria-label="Carregando perfil profissional" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-5">
        <Skeleton className="h-36" />
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

export function ProfessionalProfilePage() {
  useDocumentTitle('Perfil profissional — ProFind')
  const { user } = useAuth()
  const {
    profile: userProfile,
    syncProfessionalProfile,
    syncProfessionalProfileStatus,
  } = useProfile()
  const userId = user?.uid
  const imageProvider = useMemo(() => getImageProvider(), [])
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null)
  const [professionalProfile, setProfessionalProfile] =
    useState<ProfessionalProfile | null>(null)
  const [form, setForm] = useState(() => emptyForm(userProfile?.name ?? ''))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [savingStatus, setSavingStatus] =
    useState<EditableProfessionalProfileStatus | null>(null)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [postalCodeStatus, setPostalCodeStatus] =
    useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [postalCodeError, setPostalCodeError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] =
    useState<ProfessionalProfileFieldErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedCityStateCode, setSelectedCityStateCode] = useState('')
  const [selectedCityPickerKey, setSelectedCityPickerKey] = useState(0)
  const [imageTasks, setImageTasks] = useState<ImageUploadTask[]>([])
  const [imageSelectionError, setImageSelectionError] = useState<string | null>(null)
  const [imageRemovalErrors, setImageRemovalErrors] = useState<
    Record<string, string | undefined>
  >({})
  const [removingImageIds, setRemovingImageIds] = useState<string[]>([])
  const [pendingAvatarCleanup, setPendingAvatarCleanup] =
    useState<ProfessionalImageMetadata | null>(null)
  const [avatarCleanupError, setAvatarCleanupError] = useState<string | null>(
    null,
  )
  const previewUrls = useRef(new Set<string>())

  useEffect(
    () => () => {
      for (const previewUrl of previewUrls.current) {
        URL.revokeObjectURL(previewUrl)
      }
    },
    [],
  )

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setLoadError(null)

    void Promise.all([
      loadProfessionalProfile(userId),
      listAvailableCatalog(),
    ])
      .then(([loadedProfile, loadedCatalog]) => {
        if (!active) return
        setProfessionalProfile(loadedProfile)
        setCatalog(loadedCatalog)
        setForm(formFromProfile(loadedProfile, userProfile?.name ?? ''))
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o perfil profissional.',
        )
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [attempt, userId, userProfile?.name])

  const input = useMemo(() => inputFromForm(form), [form])
  const publicationErrors = useMemo(
    () =>
      catalog
        ? validateProfessionalProfile(
            normalizeProfessionalProfileInput(input),
            'PUBLISHED',
            catalog,
          )
        : {},
    [catalog, input],
  )
  const specialtiesByCategory = useMemo(() => {
    const grouped = new Map<string, ServiceCatalog['specialties']>()
    for (const specialty of catalog?.specialties ?? []) {
      const current = grouped.get(specialty.categoryId) ?? []
      current.push(specialty)
      grouped.set(specialty.categoryId, current)
    }
    return grouped
  }, [catalog])
  const currentStatus = professionalProfile?.status ?? 'DRAFT'
  const needsServiceModeReview = professionalProfile?.serviceMode === null
  const isSuspended = currentStatus === 'SUSPENDED'
  const isSaving = savingStatus !== null || savingAvailability
  const isImageOperationInProgress =
    imageTasks.some((task) => task.status === 'uploading') ||
    removingImageIds.length > 0

  function updateField<Key extends keyof ProfessionalProfileFormState>(
    field: Key,
    value: ProfessionalProfileFormState[Key],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined, form: undefined }))
    setSubmissionError(null)
    setSuccessMessage(null)
  }

  function clearLocationErrors() {
    setFieldErrors((current) => ({
      ...current,
      baseLocation: undefined,
      selectedCities: undefined,
      privateLocation: undefined,
      form: undefined,
    }))
    setSubmissionError(null)
    setSuccessMessage(null)
  }

  function updatePrivateLocation(
    field: 'postalCode' | 'neighborhood',
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      privateLocation: { ...current.privateLocation, [field]: value },
    }))
    setFieldErrors((current) => ({
      ...current,
      privateLocation: undefined,
      form: undefined,
    }))
    setSubmissionError(null)
    setSuccessMessage(null)
  }

  async function handlePostalCodeLookup() {
    const postalCode = normalizePostalCode(form.privateLocation.postalCode)
    if (postalCode.length !== 8 || postalCodeStatus === 'loading') {
      setPostalCodeStatus('error')
      setPostalCodeError('Informe um CEP válido com oito dígitos.')
      return
    }

    setPostalCodeStatus('loading')
    setPostalCodeError(null)
    try {
      const result = await lookupPostalCode(postalCode)
      setForm((current) => ({
        ...current,
        baseLocation: result.baseLocation,
        privateLocation: {
          postalCode: formatPostalCode(result.privateLocation.postalCode),
          neighborhood: result.privateLocation.neighborhood ?? '',
        },
      }))
      clearLocationErrors()
      setPostalCodeStatus('success')
    } catch (error) {
      setPostalCodeStatus('error')
      setPostalCodeError(
        error instanceof PostalCodeError
          ? error.message
          : 'Não foi possível consultar o CEP. Tente novamente ou selecione a localização manualmente.',
      )
    }
  }

  function updateBaseState(stateCode: string) {
    setForm((current) => ({
      ...current,
      baseLocation: { city: '', stateCode, ibgeCode: '' },
    }))
    clearLocationErrors()
  }

  function updateServiceMode(serviceMode: ProfessionalServiceMode) {
    setForm((current) => ({
      ...current,
      serviceMode,
      serviceRadiusKm:
        serviceMode === 'RADIUS' ? current.serviceRadiusKm : '',
      selectedCities:
        serviceMode === 'SELECTED_CITIES' ? current.selectedCities : [],
    }))
    setFieldErrors((current) => ({
      ...current,
      serviceMode: undefined,
      serviceRadiusKm: undefined,
      selectedCities: undefined,
      form: undefined,
    }))
    setSubmissionError(null)
    setSuccessMessage(null)
  }

  function addSelectedCity(location: ProfessionalBaseLocation) {
    setForm((current) =>
      current.selectedCities.length >= 10 ||
      current.selectedCities.some(
        (selected) => selected.ibgeCode === location.ibgeCode,
      )
        ? current
        : {
            ...current,
            selectedCities: [...current.selectedCities, location],
          },
    )
    setSelectedCityPickerKey((current) => current + 1)
    clearLocationErrors()
  }

  function removeSelectedCity(ibgeCode: string) {
    setForm((current) => ({
      ...current,
      selectedCities: current.selectedCities.filter(
        (location) => location.ibgeCode !== ibgeCode,
      ),
    }))
    clearLocationErrors()
  }

  function toggleCategory(categoryId: string, checked: boolean) {
    const specialtyIds = new Set(
      specialtiesByCategory.get(categoryId)?.map((specialty) => specialty.id) ?? [],
    )
    setForm((current) => ({
      ...current,
      categoryIds: checked
        ? [...current.categoryIds, categoryId]
        : current.categoryIds.filter((id) => id !== categoryId),
      specialtyIds: checked
        ? current.specialtyIds
        : current.specialtyIds.filter((id) => !specialtyIds.has(id)),
    }))
    setFieldErrors((current) => ({
      ...current,
      categoryIds: undefined,
      specialtyIds: undefined,
      form: undefined,
    }))
  }

  function toggleSpecialty(specialtyId: string, checked: boolean) {
    updateField(
      'specialtyIds',
      checked
        ? [...form.specialtyIds, specialtyId]
        : form.specialtyIds.filter((id) => id !== specialtyId),
    )
  }

  function releasePreview(previewUrl: string | null) {
    if (!previewUrl) return
    URL.revokeObjectURL(previewUrl)
    previewUrls.current.delete(previewUrl)
  }

  function discardImageTask(task: ImageUploadTask) {
    releasePreview(task.previewUrl)
    setImageTasks((current) => current.filter((item) => item.id !== task.id))
    setImageSelectionError(null)
  }

  async function runImageUpload(task: ImageUploadTask, retry = false) {
    if (!userId) return
    setImageTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: 'uploading', progress: 0, error: undefined }
          : item,
      ),
    )

    try {
      const metadata = await uploadProfessionalImage(
        imageProvider,
        {
          ownerId: userId,
          file: task.file,
          purpose: task.purpose,
          previousReference: task.previousReference,
          onProgress: (progress) =>
            setImageTasks((current) =>
              current.map((item) =>
                item.id === task.id ? { ...item, progress } : item,
              ),
            ),
        },
        {
          retry,
          order: task.order,
          altText: task.altText,
          currentPortfolioCount: form.portfolioImages.length,
        },
      )

      setForm((current) => {
        if (task.purpose === 'PROFESSIONAL_AVATAR') {
          return { ...current, profileImage: metadata }
        }
        if (
          current.portfolioImages.some(
            (image) => image.providerId === metadata.providerId,
          )
        ) {
          return current
        }
        return {
          ...current,
          portfolioImages: [...current.portfolioImages, metadata]
            .map((image, order) => ({
              ...image,
              order,
              updatedAt: image.order === order ? image.updatedAt : Date.now(),
            })),
        }
      })
      setFieldErrors((current) => ({
        ...current,
        [task.purpose === 'PROFESSIONAL_AVATAR' ? 'profileImage' : 'portfolioImages']:
          undefined,
        form: undefined,
      }))
      releasePreview(task.previewUrl)
      setImageTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: 'success',
                previewUrl: null,
                progress: 100,
                providerId: metadata.providerId,
                error: undefined,
              }
            : item,
        ),
      )
      setImageSelectionError(null)
    } catch (error) {
      const message =
        error instanceof ProfessionalImageError
          ? error.message
          : 'Não foi possível enviar a imagem. Tente novamente.'
      setImageTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, status: 'error', error: message }
            : item,
        ),
      )
    }
  }

  async function handleImageFiles(
    files: FileList | null,
    purpose: ProfessionalImagePurpose,
  ) {
    if (!files || files.length === 0 || isSuspended) return
    const selectedFiles =
      purpose === 'PROFESSIONAL_AVATAR'
        ? Array.from(files).slice(0, 1)
        : Array.from(files)
    setImageSelectionError(null)

    const pendingPortfolioCount = imageTasks.filter(
      (task) =>
        task.purpose === 'PROFESSIONAL_PORTFOLIO' && task.status !== 'success',
    ).length
    const currentPortfolioCount =
      form.portfolioImages.length + pendingPortfolioCount
    if (
      purpose === 'PROFESSIONAL_PORTFOLIO' &&
      currentPortfolioCount + selectedFiles.length >
        PROFESSIONAL_PORTFOLIO_MAX_IMAGES
    ) {
      setImageSelectionError(
        `Adicione no máximo ${PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens ao portfólio.`,
      )
      return
    }

    try {
      selectedFiles.forEach((file, index) =>
        validateProfessionalImageFile(
          file,
          purpose,
          currentPortfolioCount + index,
        ),
      )
    } catch (error) {
      setImageSelectionError(
        error instanceof ProfessionalImageError
          ? error.message
          : 'Revise as imagens selecionadas.',
      )
      return
    }

    if (purpose === 'PROFESSIONAL_AVATAR') {
      for (const pendingTask of imageTasks.filter(
        (task) => task.purpose === 'PROFESSIONAL_AVATAR',
      )) {
        releasePreview(pendingTask.previewUrl)
      }
      setImageTasks((current) =>
        current.filter((task) => task.purpose !== 'PROFESSIONAL_AVATAR'),
      )
    }

    for (const [index, file] of selectedFiles.entries()) {
      const previewUrl =
        typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : ''
      if (previewUrl) previewUrls.current.add(previewUrl)
      const task: ImageUploadTask = {
        id: uploadTaskId(),
        file,
        purpose,
        order:
          purpose === 'PROFESSIONAL_AVATAR'
            ? 0
            : currentPortfolioCount + index,
        previewUrl,
        progress: 0,
        status: 'uploading',
        previousReference:
          purpose === 'PROFESSIONAL_AVATAR'
            ? professionalProfile?.profileImage
            : null,
        altText:
          purpose === 'PROFESSIONAL_AVATAR'
            ? form.profileImage?.altText
            : undefined,
      }
      setImageTasks((current) => [...current, task])
      await runImageUpload(task)
    }
  }

  async function retryAvatarCleanup() {
    if (!pendingAvatarCleanup || !userId) return
    const reference = pendingAvatarCleanup
    setRemovingImageIds((current) => [...current, reference.providerId])
    try {
      await removeProfessionalImage(
        imageProvider,
        reference,
        userId,
        'PROFESSIONAL_AVATAR',
      )
      setPendingAvatarCleanup(null)
      setAvatarCleanupError(null)
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : 'Não foi possível acessar o provedor de imagens.'
      setAvatarCleanupError(
        professionalProfile?.profileImage
          ? `A foto nova continua salva, mas a anterior ainda não pôde ser removida do provedor. ${detail}`
          : `O perfil continua sem foto, mas o arquivo ainda não pôde ser removido do provedor. ${detail}`,
      )
    } finally {
      setRemovingImageIds((current) =>
        current.filter((providerId) => providerId !== reference.providerId),
      )
    }
  }

  async function handleRemoveImage(
    image: ProfessionalImageMetadata,
    purpose: ProfessionalImagePurpose,
  ) {
    if (!userId || removingImageIds.includes(image.providerId)) return
    if (
      purpose === 'PROFESSIONAL_AVATAR' &&
      image.providerId !== professionalProfile?.profileImage?.providerId
    ) {
      setForm((current) => ({
        ...current,
        profileImage: professionalProfile?.profileImage
          ? { ...professionalProfile.profileImage }
          : null,
      }))
      const localTask = imageTasks.find(
        (task) => task.providerId === image.providerId,
      )
      if (localTask) discardImageTask(localTask)
      setFieldErrors((current) => ({
        ...current,
        profileImage: undefined,
      }))
      return
    }
    setRemovingImageIds((current) => [...current, image.providerId])
    setImageRemovalErrors((current) => ({
      ...current,
      [image.providerId]: undefined,
    }))

    try {
      if (
        purpose === 'PROFESSIONAL_AVATAR' &&
        image.provider !== 'LEGACY'
      ) {
        await prepareImageRemoval(imageProvider, image, userId, purpose)
      } else if (image.provider !== 'LEGACY') {
        await removeProfessionalImage(imageProvider, image, userId, purpose)
      }
      setForm((current) =>
        purpose === 'PROFESSIONAL_AVATAR'
          ? { ...current, profileImage: null }
          : {
              ...current,
              portfolioImages: current.portfolioImages
                .filter((item) => item.providerId !== image.providerId)
                .map((item, order) => ({
                  ...item,
                  order,
                  updatedAt:
                    item.order === order ? item.updatedAt : Date.now(),
                })),
            },
      )
      const localTask = imageTasks.find(
        (task) => task.providerId === image.providerId,
      )
      if (localTask) discardImageTask(localTask)
      setFieldErrors((current) => ({
        ...current,
        [purpose === 'PROFESSIONAL_AVATAR' ? 'profileImage' : 'portfolioImages']:
          undefined,
      }))
    } catch (error) {
      setImageRemovalErrors((current) => ({
        ...current,
        [image.providerId]:
          error instanceof ProfessionalImageError
            ? error.message
            : 'Não foi possível remover a imagem. Tente novamente.',
      }))
    } finally {
      setRemovingImageIds((current) =>
        current.filter((providerId) => providerId !== image.providerId),
      )
    }
  }

  function updateImageAltText(
    image: ProfessionalImageMetadata,
    purpose: ProfessionalImagePurpose,
    altText: string,
  ) {
    setForm((current) =>
      purpose === 'PROFESSIONAL_AVATAR'
        ? {
            ...current,
            profileImage: current.profileImage
              ? { ...current.profileImage, altText, updatedAt: Date.now() }
              : null,
          }
        : {
            ...current,
            portfolioImages: current.portfolioImages.map((item) =>
              item.providerId === image.providerId
                ? { ...item, altText, updatedAt: Date.now() }
                : item,
            ),
          },
    )
    setFieldErrors((current) => ({
      ...current,
      [purpose === 'PROFESSIONAL_AVATAR' ? 'profileImage' : 'portfolioImages']:
        undefined,
    }))
  }

  function previewFor(image: ProfessionalImageMetadata) {
    return (
      imageTasks.find((task) => task.providerId === image.providerId)
        ?.previewUrl ?? image.url
    )
  }

  async function handleSave(status: EditableProfessionalProfileStatus) {
    if (
      !userId ||
      !catalog ||
      isSaving ||
      isImageOperationInProgress ||
      isSuspended
    ) return
    setSavingStatus(status)
    setFieldErrors({})
    setSubmissionError(null)
    setSuccessMessage(null)
    setAvatarCleanupError(null)

    const previousImage = professionalProfile?.profileImage ?? null
    try {
      const savedProfile = await saveProfessionalProfile(
        userId,
        input,
        status,
        catalog,
        professionalProfile,
      )
      setProfessionalProfile(savedProfile)
      setForm(formFromProfile(savedProfile, userProfile?.name ?? ''))
      setImageTasks((current) =>
        current.filter((task) => task.purpose !== 'PROFESSIONAL_AVATAR'),
      )
      syncProfessionalProfile(savedProfile)
      syncProfessionalProfileStatus(
        userProfileStatusForProfessionalProfile(status),
      )
      const message =
        status === 'DRAFT'
          ? 'Rascunho salvo. Você pode continuar depois.'
          : status === 'PAUSED'
            ? 'Perfil pausado e removido das superfícies públicas.'
            : 'Perfil publicado com sucesso.'
      setSuccessMessage(message)
      toast.success(message)

      if (
        previousImage &&
        previousImage.providerId !== savedProfile.profileImage?.providerId &&
        previousImage.provider !== 'LEGACY' &&
        (!savedProfile.profileImage ||
          previousImage.provider === savedProfile.profileImage.provider)
      ) {
        try {
          await removeProfessionalImage(
            imageProvider,
            previousImage,
            savedProfile.userId,
            'PROFESSIONAL_AVATAR',
          )
          setPendingAvatarCleanup(null)
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : 'Não foi possível acessar o provedor de imagens.'
          setPendingAvatarCleanup(previousImage)
          setAvatarCleanupError(
            savedProfile.profileImage
              ? `O perfil foi salvo com a nova foto, mas a foto anterior não pôde ser removida do provedor. ${detail}`
              : `O perfil foi salvo sem a foto, mas o arquivo ainda não pôde ser removido do provedor. ${detail}`,
          )
        }
      }
    } catch (error) {
      if (error instanceof ProfessionalProfileError) {
        setFieldErrors(error.fieldErrors)
        setSubmissionError(error.message)
        toast.error(error.message)
        const fieldOrder = [
          'publicName',
          'bio',
          'categoryIds',
          'specialtyIds',
          'profileImage',
          'portfolioImages',
          'phone',
          'contactVisibility',
          'privateLocation',
          'baseLocation',
          'serviceMode',
          'serviceRadiusKm',
          'selectedCities',
          'availability',
        ] as const
        const firstInvalidField = fieldOrder.find(
          (field) => error.fieldErrors[field],
        )
        if (firstInvalidField) {
          requestAnimationFrame(() =>
            document.getElementById(`professional-${firstInvalidField}`)?.focus(),
          )
        } else {
          requestAnimationFrame(() =>
            document.getElementById('professional-save-feedback')?.focus(),
          )
        }
      } else {
        const message = 'Não foi possível salvar seu perfil agora.'
        setSubmissionError(message)
        toast.error(message)
      }
    } finally {
      setSavingStatus(null)
    }
  }

  async function handleAvailabilityUpdate() {
    if (!userId || !professionalProfile || isSaving || isSuspended) return
    setSavingAvailability(true)
    setSubmissionError(null)
    setSuccessMessage(null)
    setFieldErrors((current) => ({ ...current, availability: undefined }))

    try {
      const updatedProfile = await updateProfessionalAvailability(
        userId,
        form.availability,
        professionalProfile,
      )
      setProfessionalProfile(updatedProfile)
      const message = 'Disponibilidade atualizada sem alterar a publicação do perfil.'
      setSuccessMessage(message)
      toast.success(message)
    } catch (error) {
      if (error instanceof ProfessionalProfileError) {
        setFieldErrors((current) => ({
          ...current,
          ...error.fieldErrors,
        }))
        setSubmissionError(error.message)
        toast.error(error.message)
      } else {
        const message = 'Não foi possível atualizar sua disponibilidade agora.'
        setSubmissionError(message)
        toast.error(message)
      }
    } finally {
      setSavingAvailability(false)
    }
  }

  const layout = (content: React.ReactNode) => (
    <ProfessionalLayout
      pageTitle="Perfil profissional"
      userName={userProfile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      {content}
    </ProfessionalLayout>
  )

  if (loading) return layout(<ProfileLoading />)

  if (loadError || !catalog) {
    return layout(
      <Alert variant="destructive" className="mx-auto max-w-2xl">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Não foi possível carregar o perfil</AlertTitle>
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <form
        noValidate
        aria-busy={isSaving || isImageOperationInProgress}
        onSubmit={(event) => event.preventDefault()}
        className="min-w-0 space-y-6"
      >
        {isSuspended ? (
          <Alert variant="destructive">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>Perfil suspenso</AlertTitle>
            <AlertDescription>
              Este perfil não pode ser editado ou republicado enquanto a suspensão estiver ativa.
            </AlertDescription>
          </Alert>
        ) : null}

        {needsServiceModeReview && !isSuspended ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Escolha uma nova modalidade de atendimento</AlertTitle>
            <AlertDescription>
              A modalidade salva anteriormente não faz parte do MVP. O perfil foi tratado como rascunho e precisa de uma opção válida antes de ser publicado novamente.
            </AlertDescription>
          </Alert>
        ) : null}

        {submissionError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Não foi possível salvar o perfil</AlertTitle>
            <AlertDescription>{submissionError}</AlertDescription>
          </Alert>
        ) : null}

        {successMessage ? (
          <Alert variant="success">
            <Check aria-hidden="true" />
            <AlertTitle>Alterações salvas</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Apresentação profissional</CardTitle>
            <CardDescription>
              Conte quem você é e como pode ajudar. Campos obrigatórios para publicação estão indicados.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="space-y-2">
              <Label htmlFor="professional-publicName">Nome público <span aria-hidden="true">*</span></Label>
              <Input
                id="professional-publicName"
                value={form.publicName}
                maxLength={120}
                disabled={isSaving || isSuspended}
                aria-invalid={Boolean(fieldErrors.publicName)}
                aria-describedby={fieldErrors.publicName ? 'professional-publicName-error' : undefined}
                onChange={(event) => updateField('publicName', event.target.value)}
              />
              <FieldError id="professional-publicName-error" message={fieldErrors.publicName} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="professional-headline">Título profissional</Label>
              <Input
                id="professional-headline"
                value={form.headline}
                maxLength={120}
                placeholder="Ex.: Eletricista residencial"
                disabled={isSaving || isSuspended}
                aria-invalid={Boolean(fieldErrors.headline)}
                aria-describedby={fieldErrors.headline ? 'professional-headline-error' : 'professional-headline-help'}
                onChange={(event) => updateField('headline', event.target.value)}
              />
              <p id="professional-headline-help" className="text-xs text-muted-foreground">Uma frase curta para resumir sua atuação.</p>
              <FieldError id="professional-headline-error" message={fieldErrors.headline} />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="professional-bio">Descrição</Label>
                <span className="text-xs text-muted-foreground">{form.bio.length}/1200</span>
              </div>
              <Textarea
                id="professional-bio"
                value={form.bio}
                maxLength={1200}
                placeholder="Descreva sua experiência, forma de trabalho e principais serviços."
                disabled={isSaving || isSuspended}
                aria-invalid={Boolean(fieldErrors.bio)}
                aria-describedby={fieldErrors.bio ? 'professional-bio-error' : undefined}
                onChange={(event) => updateField('bio', event.target.value)}
              />
              <FieldError id="professional-bio-error" message={fieldErrors.bio} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="professional-experienceYears">Anos de experiência</Label>
              <Input
                id="professional-experienceYears"
                type="number"
                inputMode="numeric"
                min={0}
                max={80}
                value={form.experienceYears}
                disabled={isSaving || isSuspended}
                aria-invalid={Boolean(fieldErrors.experienceYears)}
                aria-describedby={fieldErrors.experienceYears ? 'professional-experienceYears-error' : undefined}
                onChange={(event) => updateField('experienceYears', event.target.value)}
              />
              <FieldError id="professional-experienceYears-error" message={fieldErrors.experienceYears} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Images className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <CardTitle>Foto e portfólio</CardTitle>
                <CardDescription className="mt-1">
                  Use imagens JPEG, PNG ou WebP de até 5 MB. O portfólio aceita até {PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {!imageProvider.configured ? (
              <Alert>
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Envio de imagens indisponível</AlertTitle>
                <AlertDescription>
                  O provedor de imagens não está configurado. Seus outros dados ainda podem ser salvos normalmente.
                </AlertDescription>
              </Alert>
            ) : null}

            <fieldset
              id="professional-profileImage"
              tabIndex={-1}
              aria-invalid={Boolean(fieldErrors.profileImage)}
              aria-describedby={fieldErrors.profileImage ? 'professional-profileImage-error' : undefined}
              className="space-y-4 rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
            >
              <legend className="text-sm font-semibold">Foto de perfil</legend>
              {form.profileImage ? (
                <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <img
                    src={previewFor(form.profileImage)}
                    alt={form.profileImage.altText || 'Prévia da foto de perfil'}
                    className="aspect-square w-full rounded-md bg-muted object-cover"
                  />
                  <div className="min-w-0 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="professional-profile-image-alt">Texto alternativo</Label>
                      <Input
                        id="professional-profile-image-alt"
                        value={form.profileImage.altText}
                        maxLength={PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH}
                        placeholder="Descreva a imagem para quem não pode vê-la"
                        disabled={isSaving || isSuspended}
                        onChange={(event) =>
                          form.profileImage &&
                          updateImageAltText(
                            form.profileImage,
                            'PROFESSIONAL_AVATAR',
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={removingImageIds.includes(form.profileImage.providerId)}
                      loadingLabel="Removendo…"
                      disabled={isSaving || isSuspended}
                      onClick={() =>
                        form.profileImage &&
                        void handleRemoveImage(
                          form.profileImage,
                          'PROFESSIONAL_AVATAR',
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" /> Remover foto
                    </Button>
                    {imageRemovalErrors[form.profileImage.providerId] ? (
                      <p role="alert" className="text-sm text-destructive">
                        {imageRemovalErrors[form.profileImage.providerId]}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma foto de perfil adicionada.
                </p>
              )}
              <div className="space-y-2">
                <Label
                  htmlFor="professional-profile-image-file"
                  className={
                    form.profileImage
                      ? 'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent'
                      : 'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center hover:bg-muted/60'
                  }
                >
                  <Upload className="size-5" aria-hidden="true" />
                  <span>
                    {form.profileImage
                      ? 'Trocar foto de perfil'
                      : 'Selecionar foto de perfil'}
                  </span>
                  {!form.profileImage ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      Uma imagem, até 5 MB
                    </span>
                  ) : null}
                </Label>
                <Input
                  id="professional-profile-image-file"
                  type="file"
                  accept={PROFESSIONAL_IMAGE_ACCEPTED_TYPES.join(',')}
                  className="sr-only"
                  disabled={
                    !imageProvider.configured ||
                    isSaving ||
                    isImageOperationInProgress ||
                    isSuspended
                  }
                  onChange={(event) => {
                    void handleImageFiles(
                      event.currentTarget.files,
                      'PROFESSIONAL_AVATAR',
                    )
                    event.currentTarget.value = ''
                  }}
                />
              </div>
              {imageTasks
                .filter(
                  (task) =>
                    task.purpose === 'PROFESSIONAL_AVATAR' &&
                    task.status !== 'success',
                )
                .map((task) => (
                  <ImageUploadStatus
                    key={task.id}
                    task={task}
                    onRetry={() => void runImageUpload(task, true)}
                    onDiscard={() => discardImageTask(task)}
                  />
                ))}
              {avatarCleanupError ? (
                <Alert variant="warning">
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>Foto pendente de limpeza</AlertTitle>
                  <AlertDescription>
                    <p>{avatarCleanupError}</p>
                    {pendingAvatarCleanup ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        loading={removingImageIds.includes(
                          pendingAvatarCleanup.providerId,
                        )}
                        loadingLabel="Removendo…"
                        onClick={() => void retryAvatarCleanup()}
                      >
                        <RotateCcw aria-hidden="true" /> Tentar limpeza novamente
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}
              <FieldError id="professional-profileImage-error" message={fieldErrors.profileImage} />
            </fieldset>

            <fieldset
              id="professional-portfolioImages"
              tabIndex={-1}
              aria-invalid={Boolean(fieldErrors.portfolioImages)}
              aria-describedby={fieldErrors.portfolioImages ? 'professional-portfolioImages-error' : undefined}
              className="space-y-4 rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
            >
              <legend className="text-sm font-semibold">Portfólio</legend>
              <p className="text-xs text-muted-foreground">
                {form.portfolioImages.length}/{PROFESSIONAL_PORTFOLIO_MAX_IMAGES} imagens adicionadas
              </p>
              {form.portfolioImages.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {form.portfolioImages.map((image, index) => (
                    <div key={image.providerId} className="min-w-0 space-y-3 rounded-lg border bg-card p-3">
                      <img
                        src={previewFor(image)}
                        alt={image.altText || `Prévia da imagem ${index + 1} do portfólio`}
                        className="aspect-[4/3] w-full rounded-md bg-muted object-cover"
                      />
                      <div className="space-y-2">
                        <Label htmlFor={`professional-portfolio-alt-${index}`}>
                          Texto alternativo da imagem {index + 1}
                        </Label>
                        <Input
                          id={`professional-portfolio-alt-${index}`}
                          value={image.altText}
                          maxLength={PROFESSIONAL_IMAGE_ALT_TEXT_MAX_LENGTH}
                          placeholder="Descreva o serviço mostrado"
                          disabled={isSaving || isSuspended}
                          onChange={(event) =>
                            updateImageAltText(
                              image,
                              'PROFESSIONAL_PORTFOLIO',
                              event.target.value,
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={removingImageIds.includes(image.providerId)}
                        loadingLabel="Removendo…"
                        disabled={isSaving || isSuspended}
                        onClick={() =>
                          void handleRemoveImage(
                            image,
                            'PROFESSIONAL_PORTFOLIO',
                          )
                        }
                      >
                        <Trash2 aria-hidden="true" /> Remover imagem
                      </Button>
                      {imageRemovalErrors[image.providerId] ? (
                        <p role="alert" className="text-sm text-destructive">
                          {imageRemovalErrors[image.providerId]}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma imagem adicionada ao portfólio.</p>
              )}
              {imageTasks
                .filter(
                  (task) =>
                    task.purpose === 'PROFESSIONAL_PORTFOLIO' &&
                    task.status !== 'success',
                )
                .map((task) => (
                  <ImageUploadStatus
                    key={task.id}
                    task={task}
                    onRetry={() => void runImageUpload(task, true)}
                    onDiscard={() => discardImageTask(task)}
                  />
                ))}
              <div className="space-y-2">
                <Label
                  htmlFor="professional-portfolio-image-files"
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent"
                >
                  <Upload className="size-4" aria-hidden="true" /> Adicionar imagens
                </Label>
                <Input
                  id="professional-portfolio-image-files"
                  type="file"
                  accept={PROFESSIONAL_IMAGE_ACCEPTED_TYPES.join(',')}
                  multiple
                  className="sr-only"
                  disabled={
                    !imageProvider.configured ||
                    isSaving ||
                    isImageOperationInProgress ||
                    isSuspended ||
                    form.portfolioImages.length >= PROFESSIONAL_PORTFOLIO_MAX_IMAGES
                  }
                  onChange={(event) => {
                    void handleImageFiles(
                      event.currentTarget.files,
                      'PROFESSIONAL_PORTFOLIO',
                    )
                    event.currentTarget.value = ''
                  }}
                />
              </div>
              <FieldError id="professional-portfolioImages-error" message={fieldErrors.portfolioImages} />
            </fieldset>

            {imageSelectionError ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {imageSelectionError}
              </p>
            ) : null}
            <PrivacyNotice>
              O arquivo é enviado somente ao provedor configurado. No perfil, salvamos apenas URL, identificador, ordem e texto alternativo — nunca base64 ou o arquivo bruto.
            </PrivacyNotice>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Serviços oferecidos</CardTitle>
            <CardDescription>
              Selecione categorias e depois as especialidades correspondentes. Apenas itens ativos do catálogo aparecem aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <fieldset
              id="professional-categoryIds"
              tabIndex={-1}
              aria-invalid={Boolean(fieldErrors.categoryIds)}
              aria-describedby={fieldErrors.categoryIds ? 'professional-categoryIds-error' : undefined}
              className="space-y-3 rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
            >
              <legend className="text-sm font-semibold">Categorias <span aria-hidden="true">*</span></legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {catalog.categories.map((category) => (
                  <label key={category.id} htmlFor={`category-${category.id}`} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border bg-background p-3 hover:bg-accent/40">
                    <Checkbox
                      id={`category-${category.id}`}
                      checked={form.categoryIds.includes(category.id)}
                      disabled={isSaving || isSuspended}
                      onCheckedChange={(checked) => toggleCategory(category.id, checked === true)}
                    />
                    <span className="text-sm font-medium">{category.name}</span>
                  </label>
                ))}
              </div>
              <FieldError id="professional-categoryIds-error" message={fieldErrors.categoryIds} />
            </fieldset>

            <fieldset
              id="professional-specialtyIds"
              tabIndex={-1}
              aria-invalid={Boolean(fieldErrors.specialtyIds)}
              aria-describedby={fieldErrors.specialtyIds ? 'professional-specialtyIds-error' : undefined}
              className="space-y-4 rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
            >
              <legend className="text-sm font-semibold">Especialidades <span aria-hidden="true">*</span></legend>
              {form.categoryIds.length === 0 ? (
                <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">Selecione uma categoria para ver suas especialidades.</p>
              ) : (
                form.categoryIds.map((categoryId) => {
                  const category = catalog.categories.find((item) => item.id === categoryId)
                  const specialties = specialtiesByCategory.get(categoryId) ?? []
                  return (
                    <div key={categoryId}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category?.name}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {specialties.map((specialty) => (
                          <label key={specialty.id} htmlFor={`specialty-${specialty.id}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40">
                            <Checkbox
                              id={`specialty-${specialty.id}`}
                              checked={form.specialtyIds.includes(specialty.id)}
                              disabled={isSaving || isSuspended}
                              onCheckedChange={(checked) => toggleSpecialty(specialty.id, checked === true)}
                            />
                            <span className="text-sm">{specialty.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
              <FieldError id="professional-specialtyIds-error" message={fieldErrors.specialtyIds} />
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Phone className="size-4" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Contato</CardTitle>
                <CardDescription className="mt-1">
                  Informe um telefone com DDD e escolha se ele pode aparecer no perfil publicado.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="space-y-2">
              <Label htmlFor="professional-phone">Telefone com DDD <span aria-hidden="true">*</span></Label>
              <Input
                id="professional-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 99999-9999"
                value={form.phone}
                maxLength={15}
                disabled={isSaving || isSuspended}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'professional-phone-error' : 'professional-phone-help'}
                onChange={(event) => updateField('phone', formatPhone(event.target.value))}
              />
              <p id="professional-phone-help" className="text-xs text-muted-foreground">
                O número completo fica no documento privado quando a visibilidade for privada.
              </p>
              <FieldError id="professional-phone-error" message={fieldErrors.phone} />
            </div>

            <fieldset
              id="professional-contactVisibility"
              tabIndex={-1}
              className="space-y-3 rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              aria-invalid={Boolean(fieldErrors.contactVisibility)}
              aria-describedby={fieldErrors.contactVisibility ? 'professional-contactVisibility-error' : undefined}
            >
              <legend className="text-sm font-semibold">Visibilidade do telefone</legend>
              <RadioGroup
                aria-label="Visibilidade do telefone"
                value={form.contactVisibility}
                disabled={isSaving || isSuspended}
                className="grid gap-3 sm:grid-cols-2"
                onValueChange={(value) =>
                  updateField('contactVisibility', value as ProfessionalContactVisibility)
                }
              >
                {contactVisibilityOptions.map((option) => {
                  const Icon = option.value === 'PRIVATE' ? EyeOff : Eye
                  return (
                    <label
                      key={option.value}
                      htmlFor={`professional-contactVisibility-${option.value}`}
                      className="flex min-h-20 cursor-pointer items-start gap-3 rounded-md border bg-background p-4 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem
                        id={`professional-contactVisibility-${option.value}`}
                        value={option.value}
                        aria-label={option.label}
                        className="mt-0.5"
                      />
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                      </span>
                    </label>
                  )
                })}
              </RadioGroup>
              <FieldError id="professional-contactVisibility-error" message={fieldErrors.contactVisibility} />
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <MapPin className="size-4" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Atendimento</CardTitle>
                <CardDescription className="mt-1">
                  Use o CEP para preencher a localização ou selecione UF e município manualmente. Só cidade, UF e área atendida ficam públicas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="professional-postalCode">CEP (privado)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="professional-postalCode"
                  className="sm:max-w-52"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  value={form.privateLocation.postalCode}
                  maxLength={9}
                  disabled={isSaving || isSuspended || postalCodeStatus === 'loading'}
                  aria-invalid={Boolean(postalCodeError || fieldErrors.privateLocation)}
                  aria-describedby={
                    postalCodeError || fieldErrors.privateLocation
                      ? 'professional-postalCode-error'
                      : 'professional-postalCode-help'
                  }
                  onChange={(event) => {
                    updatePrivateLocation('postalCode', formatPostalCode(event.target.value))
                    setPostalCodeStatus('idle')
                    setPostalCodeError(null)
                  }}
                  onBlur={() => {
                    const postalCodeLength = normalizePostalCode(
                      form.privateLocation.postalCode,
                    ).length
                    if (postalCodeLength === 8 && postalCodeStatus === 'idle') {
                      void handlePostalCodeLookup()
                    } else if (postalCodeLength > 0 && postalCodeLength < 8) {
                      setPostalCodeStatus('error')
                      setPostalCodeError('Informe um CEP válido com oito dígitos.')
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  loading={postalCodeStatus === 'loading'}
                  loadingLabel="Consultando CEP…"
                  disabled={
                    isSaving ||
                    isSuspended ||
                    postalCodeStatus === 'loading' ||
                    normalizePostalCode(form.privateLocation.postalCode).length !== 8
                  }
                  onClick={() => void handlePostalCodeLookup()}
                >
                  {postalCodeStatus === 'error' ? <RotateCcw aria-hidden="true" /> : null}
                  {postalCodeStatus === 'error' ? 'Tentar novamente' : 'Consultar CEP'}
                </Button>
              </div>
              <p id="professional-postalCode-help" className="text-xs text-muted-foreground">
                O CEP é usado apenas para preenchimento e não aparece no perfil público.
              </p>
              <div aria-live="polite">
                {postalCodeStatus === 'success' ? (
                  <p className="text-sm text-success">Localização preenchida pelo CEP. Você pode corrigi-la abaixo.</p>
                ) : null}
                <FieldError id="professional-postalCode-error" message={postalCodeError ?? fieldErrors.privateLocation} />
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2 sm:max-w-md">
              <Label htmlFor="professional-neighborhood">Bairro (privado)</Label>
              <Input
                id="professional-neighborhood"
                value={form.privateLocation.neighborhood}
                maxLength={120}
                disabled={isSaving || isSuspended}
                aria-describedby="professional-neighborhood-help"
                onChange={(event) => updatePrivateLocation('neighborhood', event.target.value)}
              />
              <p id="professional-neighborhood-help" className="text-xs text-muted-foreground">
                Campo opcional armazenado somente no documento privado. Rua, número e complemento não são coletados.
              </p>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preenchimento manual</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="professional-stateCode">UF <span aria-hidden="true">*</span></Label>
              <Select
                value={form.baseLocation.stateCode}
                disabled={isSaving || isSuspended}
                onValueChange={updateBaseState}
              >
                <SelectTrigger
                  id="professional-stateCode"
                  aria-invalid={Boolean(fieldErrors.baseLocation)}
                  aria-describedby={fieldErrors.baseLocation ? 'professional-baseLocation-error' : undefined}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATE_CODES.map((stateCode) => (
                    <SelectItem key={stateCode} value={stateCode}>{stateCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <MunicipalityCombobox
                key={`${form.baseLocation.stateCode || 'no-base-state'}-${form.baseLocation.ibgeCode || 'no-base-city'}`}
                id="professional-baseLocation"
                label="Município"
                stateCode={form.baseLocation.stateCode}
                selectedMunicipality={
                  form.baseLocation.ibgeCode ? form.baseLocation : null
                }
                disabled={isSaving || isSuspended}
                required
                invalid={Boolean(fieldErrors.baseLocation)}
                describedBy={
                  fieldErrors.baseLocation
                    ? 'professional-baseLocation-error'
                    : 'professional-baseLocation-help'
                }
                onSelect={(municipality) => {
                  setForm((current) => ({
                    ...current,
                    baseLocation: toProfessionalBaseLocation(municipality),
                  }))
                  clearLocationErrors()
                }}
                onClear={() => {
                  setForm((current) => ({
                    ...current,
                    baseLocation: {
                      city: '',
                      stateCode: current.baseLocation.stateCode,
                      ibgeCode: '',
                    },
                  }))
                  clearLocationErrors()
                }}
              />
              <p id="professional-baseLocation-help" className="mt-2 text-xs text-muted-foreground">
                A cidade e o código IBGE são preenchidos automaticamente. O perfil público mostra somente cidade e UF.
              </p>
              <FieldError id="professional-baseLocation-error" message={fieldErrors.baseLocation} />
            </div>

            <fieldset
              id="professional-serviceMode"
              tabIndex={-1}
              className="space-y-3 sm:col-span-2"
              aria-invalid={Boolean(fieldErrors.serviceMode)}
              aria-describedby={fieldErrors.serviceMode ? 'professional-serviceMode-error' : undefined}
            >
              <legend className="text-sm font-semibold">Como você atende? <span aria-hidden="true">*</span></legend>
              <RadioGroup
                aria-label="Como você atende?"
                value={form.serviceMode}
                disabled={isSaving || isSuspended}
                className="grid gap-3 sm:grid-cols-2"
                onValueChange={(value) =>
                  updateServiceMode(value as ProfessionalServiceMode)
                }
              >
                {serviceModeOptions.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`professional-serviceMode-${option.value}`}
                    className="flex min-h-20 cursor-pointer items-start gap-3 rounded-md border bg-background p-4 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem
                      id={`professional-serviceMode-${option.value}`}
                      value={option.value}
                      aria-label={option.label}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <FieldError id="professional-serviceMode-error" message={fieldErrors.serviceMode} />
            </fieldset>

            {form.serviceMode === 'RADIUS' ? (
              <fieldset
                id="professional-serviceRadiusKm"
                tabIndex={-1}
                className="space-y-3 sm:col-span-2"
                aria-invalid={Boolean(fieldErrors.serviceRadiusKm)}
                aria-describedby={fieldErrors.serviceRadiusKm ? 'professional-serviceRadiusKm-error' : 'professional-serviceRadiusKm-help'}
              >
                <legend className="text-sm font-semibold">Raio aproximado <span aria-hidden="true">*</span></legend>
                <RadioGroup
                  aria-label="Raio aproximado"
                  value={form.serviceRadiusKm}
                  disabled={isSaving || isSuspended}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-5"
                  onValueChange={(value) => updateField('serviceRadiusKm', value)}
                >
                  {PROFESSIONAL_SERVICE_RADIUS_OPTIONS.map((radius) => (
                    <label
                      key={radius}
                      htmlFor={`professional-radius-${radius}`}
                      className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem id={`professional-radius-${radius}`} value={String(radius)} aria-label={`${radius} km`} />
                      {radius} km
                    </label>
                  ))}
                </RadioGroup>
                <p id="professional-serviceRadiusKm-help" className="text-xs text-muted-foreground">
                  Faixa informativa de deslocamento. O cálculo geográfico exato será tratado na issue #9.
                </p>
                <FieldError id="professional-serviceRadiusKm-error" message={fieldErrors.serviceRadiusKm} />
              </fieldset>
            ) : null}

            {form.serviceMode === 'SELECTED_CITIES' ? (
              <fieldset
                id="professional-selectedCities"
                tabIndex={-1}
                className="grid gap-4 sm:col-span-2 sm:grid-cols-[10rem_minmax(0,1fr)]"
                aria-invalid={Boolean(fieldErrors.selectedCities)}
                aria-describedby={fieldErrors.selectedCities ? 'professional-selectedCities-error' : undefined}
              >
                <legend className="col-span-full text-sm font-semibold">Municípios atendidos <span aria-hidden="true">*</span></legend>
                <div className="space-y-2">
                  <Label htmlFor="professional-selectedCityState">UF</Label>
                  <Select
                    value={selectedCityStateCode}
                    disabled={isSaving || isSuspended}
                    onValueChange={(value) => {
                      setSelectedCityStateCode(value)
                      setSelectedCityPickerKey((current) => current + 1)
                    }}
                  >
                    <SelectTrigger id="professional-selectedCityState">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATE_CODES.map((stateCode) => (
                        <SelectItem key={stateCode} value={stateCode}>{stateCode}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <MunicipalityCombobox
                  key={`${selectedCityStateCode}-${selectedCityPickerKey}`}
                  id="professional-selectedCity"
                  label="Adicionar município"
                  stateCode={selectedCityStateCode}
                  excludedIbgeCodes={form.selectedCities.map((location) => location.ibgeCode)}
                  disabled={
                    isSaving || isSuspended || form.selectedCities.length >= 10
                  }
                  onSelect={(municipality) =>
                    addSelectedCity(toProfessionalBaseLocation(municipality))
                  }
                />
                {form.selectedCities.length > 0 ? (
                  <ul className="col-span-full flex flex-wrap gap-2" aria-label="Municípios selecionados">
                    {form.selectedCities.map((location) => (
                      <li key={location.ibgeCode} className="flex min-h-10 items-center gap-2 rounded-full border bg-muted px-3 py-1.5 text-sm">
                        <span>{location.city}, {location.stateCode}</span>
                        <button
                          type="button"
                          className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                          aria-label={`Remover ${location.city}`}
                          disabled={isSaving || isSuspended}
                          onClick={() => removeSelectedCity(location.ibgeCode)}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="col-span-full rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">Nenhum município adicionado.</p>
                )}
                <p className="col-span-full text-xs text-muted-foreground">
                  {form.selectedCities.length}/10 municípios selecionados.
                </p>
                <div className="col-span-full">
                  <FieldError id="professional-selectedCities-error" message={fieldErrors.selectedCities} />
                </div>
              </fieldset>
            ) : null}

            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="text-sm font-semibold">Disponibilidade</legend>
              <RadioGroup
                aria-label="Disponibilidade"
                value={form.availability}
                disabled={isSaving || isSuspended}
                className="grid gap-3 sm:grid-cols-3"
                onValueChange={(value) =>
                  updateField('availability', value as ProfessionalAvailability)
                }
              >
                {Object.entries(availabilityLabels).map(([value, label]) => (
                  <label
                    key={value}
                    htmlFor={`professional-availability-${value}`}
                    className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-background p-3 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem id={`professional-availability-${value}`} value={value} aria-label={label} />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </RadioGroup>
              <FieldError id="professional-availability-error" message={fieldErrors.availability} />
              {professionalProfile ? (
                <div className="flex flex-col items-start gap-2 rounded-md bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted-foreground">
                    Esta ação altera somente a disponibilidade e mantém o perfil no status {statusLabels[currentStatus].toLowerCase()}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    loading={savingAvailability}
                    loadingLabel="Atualizando…"
                    disabled={isSaving || isSuspended}
                    onClick={() => void handleAvailabilityUpdate()}
                  >
                    Atualizar disponibilidade
                  </Button>
                </div>
              ) : null}
            </fieldset>
          </CardContent>
          {!isSuspended ? (
            <CardFooter className="flex-col items-stretch border-t pt-5 sm:flex-row sm:flex-wrap">
              {submissionError ? (
                <p
                  id="professional-save-feedback"
                  tabIndex={-1}
                  aria-live="assertive"
                  className="w-full rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                >
                  {submissionError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                loading={savingStatus === 'DRAFT'}
                loadingLabel="Salvando rascunho…"
                disabled={isSaving || isImageOperationInProgress}
                onClick={() => void handleSave('DRAFT')}
              >
                <Save aria-hidden="true" />
                {professionalProfile && currentStatus !== 'DRAFT' ? 'Voltar para rascunho' : 'Salvar rascunho'}
              </Button>
              {currentStatus === 'PUBLISHED' ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={savingStatus === 'PAUSED'}
                  loadingLabel="Pausando…"
                  disabled={isSaving || isImageOperationInProgress}
                  onClick={() => void handleSave('PAUSED')}
                >
                  <PauseCircle aria-hidden="true" /> Pausar perfil
                </Button>
              ) : null}
              {currentStatus === 'PAUSED' ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={savingStatus === 'PAUSED'}
                  loadingLabel="Salvando…"
                  disabled={isSaving || isImageOperationInProgress}
                  onClick={() => void handleSave('PAUSED')}
                >
                  <Save aria-hidden="true" /> Salvar pausado
                </Button>
              ) : null}
              <Button
                type="button"
                className="sm:ml-auto"
                loading={savingStatus === 'PUBLISHED'}
                loadingLabel={currentStatus === 'PUBLISHED' ? 'Salvando…' : 'Publicando…'}
                disabled={isSaving || isImageOperationInProgress}
                onClick={() => void handleSave('PUBLISHED')}
              >
                <Send aria-hidden="true" />
                {currentStatus === 'PUBLISHED' ? 'Salvar perfil publicado' : currentStatus === 'PAUSED' ? 'Republicar perfil' : 'Publicar perfil'}
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </form>

      <aside className="space-y-5 lg:sticky lg:top-[calc(var(--app-header-height)+2rem)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Status</CardTitle>
              <Badge variant={statusVariants[currentStatus]}>{statusLabels[currentStatus]}</Badge>
            </div>
            <CardDescription>
              Rascunhos ficam privados. Somente perfis publicados podem aparecer para clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">Pronto para publicar</p>
            <ul className="mt-3 space-y-3 text-sm">
              {[
                {
                  key: 'publicName',
                  label: 'Nome público',
                  complete: !publicationErrors.publicName,
                },
                {
                  key: 'services',
                  label: 'Categoria e especialidade',
                  complete:
                    !publicationErrors.categoryIds &&
                    !publicationErrors.specialtyIds,
                },
                {
                  key: 'contact',
                  label: 'Telefone de contato',
                  complete:
                    !publicationErrors.phone &&
                    !publicationErrors.contactVisibility,
                },
                {
                  key: 'baseLocation',
                  label: 'Localização base',
                  complete: !publicationErrors.baseLocation,
                },
                {
                  key: 'serviceArea',
                  label: 'Área de atendimento',
                  complete:
                    !publicationErrors.serviceMode &&
                    !publicationErrors.serviceRadiusKm &&
                    !publicationErrors.selectedCities,
                },
              ].map(({ key, label, complete }) => {
                const Icon = complete ? Check : Circle
                return (
                  <li
                    key={key}
                    className="flex items-start gap-2"
                    aria-label={`${label}: ${complete ? 'completo' : 'pendente'}`}
                  >
                    <Icon className={complete ? 'mt-0.5 size-4 text-success' : 'mt-0.5 size-4 text-muted-foreground'} aria-hidden="true" />
                    <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <PrivacyNotice title="Dados protegidos">
          CEP, bairro e telefone privado ficam em um documento separado, acessível somente por você e pelo backend autorizado. Rua, número e complemento não são coletados.
        </PrivacyNotice>
      </aside>
    </div>,
  )
}
