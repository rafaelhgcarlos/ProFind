import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Send,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group'
import { Skeleton } from '../../../components/ui/skeleton'
import { Textarea } from '../../../components/ui/textarea'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { serviceRequestService } from '../../../services/service-request.service'
import {
  MAX_SCHEDULING_HORIZON_DAYS,
  SERVICE_PERIOD_DEFINITIONS,
  SERVICE_TIME_ZONE,
} from '../../../services/service-period-policy'
import type { ServicePeriod, ServiceRequestSummary } from '../../../types/service-request'
import { BRAZILIAN_STATE_CODES } from '../../../types/professional-profile'
import type { ProfessionalBaseLocation } from '../../../types/professional-profile'
import { MunicipalityCombobox } from '../../professional-profile/components/MunicipalityCombobox'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

interface RequestDraft {
  operationKey: string
  categoryId: string
  specialtyId: string
  description: string
  stateCode: string
  municipality: ProfessionalBaseLocation | null
  street: string
  number: string
  complement: string
  neighborhood: string
  postalCode: string
  serviceDate: string
  period: ServicePeriod | ''
}

const periods = Object.entries(SERVICE_PERIOD_DEFINITIONS) as Array<
  [ServicePeriod, (typeof SERVICE_PERIOD_DEFINITIONS)[ServicePeriod]]
>

function newOperationKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function emptyDraft(): RequestDraft {
  return {
    operationKey: newOperationKey(),
    categoryId: '',
    specialtyId: '',
    description: '',
    stateCode: '',
    municipality: null,
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    postalCode: '',
    serviceDate: '',
    period: '',
  }
}

function draftStorageKey(userId: string) {
  return `profind:service-request-draft:${userId}`
}

function loadDraft(userId?: string) {
  if (!userId) return emptyDraft()
  try {
    const saved = window.localStorage.getItem(draftStorageKey(userId))
    if (!saved) return emptyDraft()
    const parsed = JSON.parse(saved) as Partial<RequestDraft>
    return { ...emptyDraft(), ...parsed }
  } catch {
    return emptyDraft()
  }
}

function zonedDateValue(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function formatDate(value: string) {
  if (!value) return 'Não informada'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function requestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Não foi possível enviar a solicitação. Tente novamente.'
}

export function ServiceRequestPage() {
  useDocumentTitle('Solicitar serviço — ProFind')
  const { user } = useAuth()
  const { profile, clientProfile, clientProfileReadiness } = useProfile()
  const catalogState = useCatalog()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedSpecialty = searchParams.get('specialty') ?? ''
  const recoveredRequestId = searchParams.get('pedido') ?? ''
  const [draft, setDraft] = useState<RequestDraft>(() => loadDraft(user?.uid))
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<ServiceRequestSummary | null>(null)
  const [recovering, setRecovering] = useState(Boolean(recoveredRequestId))
  const [confirmCancellation, setConfirmCancellation] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancellationError, setCancellationError] = useState('')
  const [schedulingBounds] = useState(() => {
    const now = new Date()
    return {
      today: zonedDateValue(now),
      maxDate: zonedDateValue(
        new Date(now.getTime() + MAX_SCHEDULING_HORIZON_DAYS * 24 * 60 * 60_000),
      ),
    }
  })

  useEffect(() => {
    if (!user?.uid || recoveredRequestId) return
    window.localStorage.setItem(draftStorageKey(user.uid), JSON.stringify(draft))
  }, [draft, recoveredRequestId, user?.uid])

  useEffect(() => {
    if (!recoveredRequestId || confirmed) return
    let active = true
    void serviceRequestService
      .getOwnRequest(recoveredRequestId)
      .then((request) => {
        if (active) setConfirmed(request)
      })
      .catch((error) => {
        if (active) setSubmitError(requestErrorMessage(error))
      })
      .finally(() => {
        if (active) setRecovering(false)
      })
    return () => {
      active = false
    }
  }, [confirmed, recoveredRequestId])

  const categories = catalogState.status === 'ready' ? catalogState.catalog.categories : []
  const requestedCatalogSpecialty =
    catalogState.status === 'ready' && requestedSpecialty
      ? catalogState.catalog.specialties.find(
          (candidate) => candidate.id === requestedSpecialty,
        )
      : undefined
  const useRequestedSpecialty =
    !draft.categoryId && !draft.specialtyId && Boolean(requestedCatalogSpecialty)
  const selectedCategoryId = useRequestedSpecialty
    ? requestedCatalogSpecialty?.categoryId ?? ''
    : draft.categoryId
  const selectedSpecialtyId = useRequestedSpecialty
    ? requestedCatalogSpecialty?.id ?? ''
    : draft.specialtyId
  const prefillError =
    catalogState.status === 'ready' && requestedSpecialty && !requestedCatalogSpecialty
      ? 'A especialidade escolhida não está mais disponível. Escolha outra opção.'
      : ''
  const specialties =
    catalogState.status === 'ready'
      ? catalogState.catalog.specialties.filter(
          (specialty) => specialty.categoryId === selectedCategoryId,
        )
      : []
  const selectedCategory = categories.find((item) => item.id === selectedCategoryId)
  const selectedSpecialty =
    catalogState.status === 'ready'
      ? catalogState.catalog.specialties.find((item) => item.id === selectedSpecialtyId)
      : undefined
  const periodLabel = draft.period
    ? SERVICE_PERIOD_DEFINITIONS[draft.period].label
    : 'Não informado'
  const addressSummary = useMemo(
    () =>
      [draft.street, draft.number, draft.neighborhood, draft.municipality?.city, draft.stateCode]
        .filter(Boolean)
        .join(', ') || 'Não informado',
    [draft],
  )

  function update<K extends keyof RequestDraft>(field: K, value: RequestDraft[K]) {
    setDraft((current) => ({
      ...current,
      ...(!current.categoryId &&
      !current.specialtyId &&
      requestedCatalogSpecialty
        ? {
            categoryId: requestedCatalogSpecialty.categoryId,
            specialtyId: requestedCatalogSpecialty.id,
          }
        : {}),
      [field]: value,
    }))
    setSubmitError('')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!clientProfileReadiness?.isComplete) {
      setSubmitError('Complete seu perfil de cliente antes de enviar a solicitação.')
      return
    }
    if (!draft.period || !draft.municipality) {
      setSubmitError('Revise os campos obrigatórios antes de enviar.')
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }

    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await serviceRequestService.createRequest({
        operationKey: draft.operationKey,
        specialtyId: selectedSpecialtyId,
        description: draft.description,
        city: draft.municipality.city,
        stateCode: draft.stateCode,
        cityIbgeCode: draft.municipality.ibgeCode,
        street: draft.street,
        number: draft.number,
        complement: draft.complement,
        neighborhood: draft.neighborhood,
        postalCode: draft.postalCode,
        serviceDate: draft.serviceDate,
        period: draft.period,
        contactName: profile?.name ?? '',
        contactPhone: clientProfile?.phone ?? '',
      })
      if (user?.uid) window.localStorage.removeItem(draftStorageKey(user.uid))
      setConfirmed(result.request)
      navigate(`/cliente/solicitar?pedido=${encodeURIComponent(result.request.requestId)}`, {
        replace: true,
      })
    } catch (error) {
      setSubmitError(requestErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelRequest() {
    if (!confirmed || cancelling) return
    setCancelling(true)
    setCancellationError('')
    try {
      const result = await serviceRequestService.cancelOwnRequest(
        confirmed.requestId,
      )
      setConfirmed(result.request)
      setConfirmCancellation(false)
    } catch (error) {
      setCancellationError(requestErrorMessage(error))
    } finally {
      setCancelling(false)
    }
  }

  if (recovering) {
    return (
      <ClientLayout pageTitle="Solicitar serviço" contextSwitcher={<ModeSwitcher />}>
        <div className="mx-auto max-w-3xl space-y-4" role="status" aria-label="Recuperando solicitação">
          <Skeleton className="h-36" />
          <Skeleton className="h-52" />
        </div>
      </ClientLayout>
    )
  }

  if (confirmed) {
    const isOpen = confirmed.status === 'OPEN'
    return (
      <ClientLayout pageTitle="Solicitar serviço" contextSwitcher={<ModeSwitcher />}>
        <Card className="mx-auto max-w-2xl overflow-hidden">
          <div className="bg-brand-panel px-5 py-8 text-brand-panel-foreground sm:px-8">
            <CheckCircle2 className="size-10" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              {isOpen ? 'Procurando profissional' : 'Solicitação cancelada'}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-brand-panel-foreground/80">
              {isOpen
                ? 'Sua solicitação foi salva. A disponibilidade depende de profissionais compatíveis na sua região.'
                : 'O cancelamento foi salvo e este pedido não participa mais da procura.'}
            </p>
          </div>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-4 rounded-lg border bg-surface-tint p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Data</p>
                <p className="mt-1 font-medium">{formatDate(confirmed.serviceDate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Período</p>
                <p className="mt-1 font-medium">{SERVICE_PERIOD_DEFINITIONS[confirmed.period].label}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Código do pedido: <span className="font-mono text-foreground">{confirmed.requestId}</span>
            </p>
            {cancellationError ? (
              <Alert variant="destructive" role="alert">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Não foi possível cancelar</AlertTitle>
                <AlertDescription>{cancellationError}</AlertDescription>
              </Alert>
            ) : null}
            {isOpen && confirmCancellation ? (
              <Alert variant="warning">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Cancelar esta solicitação?</AlertTitle>
                <AlertDescription>
                  <p>A procura será encerrada e este pedido não poderá ser reaberto por esta tela.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="destructive" loading={cancelling} loadingLabel="Cancelando…" onClick={() => void cancelRequest()}>
                      Confirmar cancelamento
                    </Button>
                    <Button type="button" variant="outline" disabled={cancelling} onClick={() => setConfirmCancellation(false)}>
                      Manter solicitação
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline">
                <Link to="/cliente">Voltar ao início</Link>
              </Button>
              {isOpen && !confirmCancellation ? (
                <Button type="button" variant="ghost" onClick={() => setConfirmCancellation(true)}>
                  Cancelar solicitação
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </ClientLayout>
    )
  }

  return (
    <ClientLayout
      pageTitle="Solicitar serviço"
      activeNavigationHref="/cliente/solicitar"
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link to="/cliente"><ArrowLeft aria-hidden="true" /> Voltar ao início</Link>
          </Button>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Conte o que você precisa</h2>
          <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
            Informe uma especialidade, o local e um período. Você poderá revisar tudo antes de enviar.
          </p>
        </div>

        {!clientProfileReadiness?.isComplete ? (
          <Alert variant="warning" className="mb-6">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Seu perfil precisa estar pronto</AlertTitle>
            <AlertDescription>
              <p>Revise seu nome antes de enviar. Telefone e foto continuam opcionais.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/cliente/perfil">Completar perfil</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {prefillError ? (
          <Alert variant="warning" className="mb-6">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Revise o serviço</AlertTitle>
            <AlertDescription>{prefillError}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={submit} noValidate className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit"><Wrench aria-hidden="true" /> 1. Serviço</Badge>
                <CardTitle>Qual serviço você precisa?</CardTitle>
                <CardDescription>Escolha uma única especialidade do catálogo ativo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                {catalogState.status === 'error' ? (
                  <Alert variant="destructive">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>Catálogo indisponível</AlertTitle>
                    <AlertDescription>
                      <p>{catalogState.error}</p>
                      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={catalogState.retry}>Tentar novamente</Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="request-category">Categoria *</Label>
                    <select
                      id="request-category"
                      required
                      value={selectedCategoryId}
                      aria-invalid={!selectedCategoryId}
                      disabled={catalogState.status !== 'ready'}
                      className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/25"
                      onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value, specialtyId: '' }))}
                    >
                      <option value="">Selecione</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="request-specialty">Especialidade *</Label>
                    <select
                      id="request-specialty"
                      required
                      value={selectedSpecialtyId}
                      aria-invalid={!selectedSpecialtyId}
                      disabled={!selectedCategoryId}
                      className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/25"
                      onChange={(event) => update('specialtyId', event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-description">Descreva o que precisa *</Label>
                  <Textarea
                    id="request-description"
                    required
                    minLength={10}
                    maxLength={1000}
                    value={draft.description}
                    aria-invalid={draft.description.trim().length < 10}
                    placeholder="Ex.: preciso verificar duas tomadas que pararam de funcionar."
                    onChange={(event) => update('description', event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{draft.description.length}/1000 caracteres</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit"><MapPin aria-hidden="true" /> 2. Local</Badge>
                <CardTitle>Onde será o atendimento?</CardTitle>
                <CardDescription>O endereço fica privado e pertence somente a esta solicitação.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Alert>
                  <LockKeyhole aria-hidden="true" />
                  <AlertTitle>Endereço protegido</AlertTitle>
                  <AlertDescription>Profissionais não veem endereço nem contato no resumo da oportunidade.</AlertDescription>
                </Alert>
                <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label htmlFor="request-state">UF *</Label>
                    <select
                      id="request-state"
                      required
                      value={draft.stateCode}
                      aria-invalid={!draft.stateCode}
                      className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/25"
                      onChange={(event) => setDraft((current) => ({ ...current, stateCode: event.target.value, municipality: null }))}
                    >
                      <option value="">UF</option>
                      {BRAZILIAN_STATE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                    </select>
                  </div>
                  <MunicipalityCombobox
                    id="request-city"
                    label="Município"
                    required
                    stateCode={draft.stateCode}
                    selectedMunicipality={draft.municipality}
                    invalid={!draft.municipality}
                    onSelect={(municipality) => update('municipality', municipality)}
                    onClear={() => update('municipality', null)}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <div className="space-y-2"><Label htmlFor="request-street">Logradouro *</Label><Input id="request-street" required maxLength={160} value={draft.street} aria-invalid={!draft.street.trim()} onChange={(event) => update('street', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="request-number">Número *</Label><Input id="request-number" required maxLength={30} value={draft.number} aria-invalid={!draft.number.trim()} onChange={(event) => update('number', event.target.value)} /></div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="request-neighborhood">Bairro *</Label><Input id="request-neighborhood" required maxLength={120} value={draft.neighborhood} aria-invalid={!draft.neighborhood.trim()} onChange={(event) => update('neighborhood', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="request-postal-code">CEP *</Label><Input id="request-postal-code" required inputMode="numeric" maxLength={9} value={draft.postalCode} aria-invalid={!/^\d{8}$/.test(draft.postalCode.replace(/\D/g, ''))} placeholder="00000-000" onChange={(event) => update('postalCode', event.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="request-complement">Complemento <span className="text-muted-foreground">(opcional)</span></Label><Input id="request-complement" maxLength={120} value={draft.complement} onChange={(event) => update('complement', event.target.value)} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit"><CalendarDays aria-hidden="true" /> 3. Data e período</Badge>
                <CardTitle>Quando você precisa?</CardTitle>
                <CardDescription>Escolha uma data em até 90 dias e um único período.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="request-date">Data *</Label>
                  <Input id="request-date" type="date" required min={schedulingBounds.today} max={schedulingBounds.maxDate} value={draft.serviceDate} aria-invalid={!draft.serviceDate} onChange={(event) => update('serviceDate', event.target.value)} />
                </div>
                <fieldset>
                  <legend className="text-sm font-medium">Período *</legend>
                  <RadioGroup value={draft.period} onValueChange={(value) => update('period', value as ServicePeriod)} className="mt-3 grid sm:grid-cols-3" aria-invalid={!draft.period}>
                    {periods.map(([value, definition]) => (
                      <Label key={value} htmlFor={`period-${value}`} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md border bg-background p-3 hover:border-primary/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40">
                        <RadioGroupItem id={`period-${value}`} value={value} />
                        <span><span className="block font-semibold">{definition.label}</span><span className="text-xs text-muted-foreground">{definition.startHour}h às {definition.endHour}h</span></span>
                      </Label>
                    ))}
                  </RadioGroup>
                  <p className="mt-2 text-xs text-muted-foreground">O envio encerra 30 minutos antes do início do período.</p>
                </fieldset>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="secondary" className="w-fit"><CheckCircle2 aria-hidden="true" /> 4. Revisão</Badge>
                <CardTitle>Revise sem perder seus dados</CardTitle>
                <CardDescription>Os campos continuam disponíveis acima caso você queira corrigir algo.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">O ProFind iniciará a procura somente depois que a solicitação for salva com sucesso.</p>
              </CardContent>
            </Card>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-24">
            <Card>
              <CardHeader>
                <CardTitle>Resumo da solicitação</CardTitle>
                <CardDescription>Confira os dados antes de enviar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Serviço</p><p className="mt-1 break-words font-medium">{selectedSpecialty?.name ?? 'Não informado'}</p><p className="text-sm text-muted-foreground">{selectedCategory?.name}</p></div>
                <div className="border-t pt-4"><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Local privado</p><p className="mt-1 break-words text-sm leading-6">{addressSummary}</p></div>
                <div className="grid grid-cols-2 gap-3 border-t pt-4"><div><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Data</p><p className="mt-1 text-sm font-medium">{formatDate(draft.serviceDate)}</p></div><div><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Período</p><p className="mt-1 text-sm font-medium">{periodLabel}</p></div></div>
                {submitError ? (
                  <Alert variant="destructive" role="alert">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>Não foi possível enviar</AlertTitle>
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" className="w-full" disabled={submitting || catalogState.status !== 'ready' || !clientProfileReadiness?.isComplete}>
                  {submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {submitting ? 'Enviando…' : 'Enviar solicitação'}
                </Button>
                <p className="flex gap-2 text-xs leading-5 text-muted-foreground"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Se houver falha, seus dados ficam salvos neste dispositivo para uma nova tentativa.</p>
              </CardContent>
            </Card>
          </aside>
        </form>
      </div>
    </ClientLayout>
  )
}
