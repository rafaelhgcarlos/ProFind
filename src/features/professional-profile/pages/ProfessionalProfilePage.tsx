import {
  AlertTriangle,
  Check,
  Circle,
  CircleAlert,
  PauseCircle,
  Save,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { listAvailableCatalog } from '../../../services/catalog.service'
import { toProfessionalBaseLocation } from '../../../services/ibge-localities.service'
import {
  loadProfessionalProfile,
  ProfessionalProfileError,
  saveProfessionalProfile,
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
  ProfessionalProfile,
  ProfessionalProfileInput,
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
  serviceMode: ProfessionalServiceMode
  serviceRadiusKm: string
  selectedCities: ProfessionalBaseLocation[]
  availability: ProfessionalAvailability
}

const availabilityLabels: Record<ProfessionalAvailability, string> = {
  AVAILABLE: 'Aceitando novos serviços',
  LIMITED: 'Agenda limitada',
  UNAVAILABLE: 'Temporariamente indisponível',
}

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
  {
    value: 'REMOTE',
    label: 'Atendimento remoto',
    description: 'Serviço prestado sem deslocamento presencial.',
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
    serviceMode: profile.serviceMode,
    serviceRadiusKm:
      profile.serviceRadiusKm === null ? '' : String(profile.serviceRadiusKm),
    selectedCities: profile.selectedCities.map((location) => ({ ...location })),
    availability: profile.availability,
  }
}

function nullableInteger(value: string) {
  if (!value.trim()) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : Number.NaN
}

function inputFromForm(form: ProfessionalProfileFormState): ProfessionalProfileInput {
  return {
    ...form,
    experienceYears: nullableInteger(form.experienceYears),
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
    syncProfessionalProfileStatus,
  } = useProfile()
  const userId = user?.uid
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null)
  const [professionalProfile, setProfessionalProfile] =
    useState<ProfessionalProfile | null>(null)
  const [form, setForm] = useState(() => emptyForm(userProfile?.name ?? ''))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [savingStatus, setSavingStatus] =
    useState<EditableProfessionalProfileStatus | null>(null)
  const [fieldErrors, setFieldErrors] =
    useState<ProfessionalProfileFieldErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedCityStateCode, setSelectedCityStateCode] = useState('')
  const [selectedCityPickerKey, setSelectedCityPickerKey] = useState(0)

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
  const isSuspended = currentStatus === 'SUSPENDED'
  const isSaving = savingStatus !== null

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
      form: undefined,
    }))
    setSubmissionError(null)
    setSuccessMessage(null)
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

  async function handleSave(status: EditableProfessionalProfileStatus) {
    if (!userId || !catalog || isSaving || isSuspended) return
    setSavingStatus(status)
    setFieldErrors({})
    setSubmissionError(null)
    setSuccessMessage(null)

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
    } catch (error) {
      if (error instanceof ProfessionalProfileError) {
        setFieldErrors(error.fieldErrors)
        setSubmissionError(error.message)
        const fieldOrder = [
          'publicName',
          'bio',
          'categoryIds',
          'specialtyIds',
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
        }
      } else {
        setSubmissionError('Não foi possível salvar seu perfil agora.')
      }
    } finally {
      setSavingStatus(null)
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
        aria-busy={isSaving}
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
            <CardTitle>Atendimento</CardTitle>
            <CardDescription>
              Selecione sua localização pública e como você atende. CEP, endereço exato e contato não fazem parte deste perfil.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
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
                key={form.baseLocation.stateCode || 'no-base-state'}
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
            </fieldset>
          </CardContent>
          {!isSuspended ? (
            <CardFooter className="flex-col items-stretch border-t pt-5 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                loading={savingStatus === 'DRAFT'}
                loadingLabel="Salvando rascunho…"
                disabled={isSaving}
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
                  disabled={isSaving}
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
                  disabled={isSaving}
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
                disabled={isSaving}
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
                  <li key={key} className="flex items-start gap-2">
                    <Icon className={complete ? 'mt-0.5 size-4 text-success' : 'mt-0.5 size-4 text-muted-foreground'} aria-hidden="true" />
                    <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <PrivacyNotice title="Dados protegidos">
          Rating, avaliações e métricas são calculados pela plataforma e não podem ser editados neste formulário.
        </PrivacyNotice>
      </aside>
    </div>,
  )
}
