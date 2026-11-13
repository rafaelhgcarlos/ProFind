import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  RotateCcw,
  Send,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { listMunicipalitiesByState } from '../../../services/ibge-localities.service'
import {
  formatPostalCode,
  lookupPostalCode,
  normalizePostalCode,
  PostalCodeError,
  type PostalCodeResult,
} from '../../../services/postal-code.service'
import { serviceRequestService } from '../../../services/service-request.service'
import {
  MAX_SCHEDULING_HORIZON_DAYS,
  SERVICE_PERIOD_DEFINITIONS,
  SERVICE_TIME_ZONE,
} from '../../../services/service-period-policy'
import {
  ServiceRequestError,
  type OwnServiceRequestDetails,
  type ServicePeriod,
  type ServiceRequestSummary,
} from '../../../types/service-request'
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

type PostalCodeStatus = 'idle' | 'loading' | 'success' | 'not-found' | 'error'

interface AutofilledAddress {
  postalCode: string
  street?: string
  neighborhood?: string
  stateCode?: string
  municipality?: ProfessionalBaseLocation
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
  const [requestDetails, setRequestDetails] = useState<OwnServiceRequestDetails | null>(null)
  const [editingRequest, setEditingRequest] = useState<ServiceRequestSummary | null>(null)
  const [recovering, setRecovering] = useState(Boolean(recoveredRequestId))
  const [confirmCancellation, setConfirmCancellation] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancellationError, setCancellationError] = useState('')
  const [cancellationOperationKey, setCancellationOperationKey] = useState(newOperationKey)
  const [postalCodeStatus, setPostalCodeStatus] = useState<PostalCodeStatus>('idle')
  const [postalCodeError, setPostalCodeError] = useState<string | null>(null)
  const [postalCodeNotice, setPostalCodeNotice] = useState<string | null>(null)
  const postalLookupVersion = useRef(0)
  const currentPostalCode = useRef(normalizePostalCode(draft.postalCode))
  const lastAutomaticLookup = useRef<string | null>(null)
  const postalCodeCache = useRef(new Map<string, PostalCodeResult>())
  const autofilledAddress = useRef<AutofilledAddress | null>(null)
  const [loadedAt] = useState(() => new Date())
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
    if (!user?.uid || !recoveredRequestId || editingRequest) return
    return serviceRequestService.subscribeOwnRequestDetails({
      requestId: recoveredRequestId,
      onDetails(snapshot) {
        setRequestDetails(snapshot.details)
        setConfirmed(snapshot.details.request)
        setSubmitError('')
        setRecovering(false)
      },
      onError(error) {
        setSubmitError(requestErrorMessage(error))
        setRecovering(false)
      },
    })
  }, [editingRequest, recoveredRequestId, user?.uid])

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

  function canReplaceAutofilledValue(
    currentValue: string,
    previousValue: string | undefined,
  ) {
    return !currentValue.trim() || Boolean(previousValue && currentValue === previousValue)
  }

  async function queryPostalCode(value: string, force = false) {
    const postalCode = normalizePostalCode(value)
    if (postalCode.length !== 8) {
      setPostalCodeStatus('error')
      setPostalCodeError('Informe um CEP válido com oito dígitos.')
      return
    }
    if (postalCodeStatus === 'loading' && !force) return

    const version = ++postalLookupVersion.current
    currentPostalCode.current = postalCode
    lastAutomaticLookup.current = postalCode
    setPostalCodeStatus('loading')
    setPostalCodeError(null)
    setPostalCodeNotice(null)

    try {
      let result = postalCodeCache.current.get(postalCode)
      if (!result || force) {
        result = await lookupPostalCode(postalCode)
        postalCodeCache.current.set(postalCode, result)
      }
      const municipalities = await listMunicipalitiesByState(
        result.baseLocation.stateCode,
      )
      const municipality = municipalities.find(
        (candidate) => candidate.ibgeCode === result.baseLocation.ibgeCode,
      )
      if (!municipality) {
        throw new PostalCodeError(
          'invalid-response',
          'Não foi possível validar o município deste CEP. Selecione a UF e o município manualmente.',
        )
      }
      if (
        version !== postalLookupVersion.current ||
        currentPostalCode.current !== postalCode
      ) {
        return
      }

      setDraft((current) => {
        if (normalizePostalCode(current.postalCode) !== postalCode) return current
        const previous = autofilledAddress.current
        const replaceStreet = canReplaceAutofilledValue(
          current.street,
          previous?.street,
        )
        const replaceNeighborhood = canReplaceAutofilledValue(
          current.neighborhood,
          previous?.neighborhood,
        )
        const previousMunicipality = previous?.municipality
        const locationStillAutofilled = Boolean(
          previous?.stateCode &&
          previousMunicipality &&
          current.stateCode === previous.stateCode &&
          current.municipality?.ibgeCode === previousMunicipality.ibgeCode,
        )
        const replaceLocation =
          (!current.stateCode && !current.municipality) || locationStillAutofilled
        const street = replaceStreet && result.privateLocation.street
          ? result.privateLocation.street
          : current.street
        const neighborhood = replaceNeighborhood && result.privateLocation.neighborhood
          ? result.privateLocation.neighborhood
          : current.neighborhood
        const nextMunicipality = replaceLocation ? municipality : current.municipality
        const nextStateCode = replaceLocation
          ? municipality.stateCode
          : current.stateCode

        autofilledAddress.current = {
          postalCode,
          ...(replaceStreet && result.privateLocation.street
            ? { street: result.privateLocation.street }
            : {}),
          ...(replaceNeighborhood && result.privateLocation.neighborhood
            ? { neighborhood: result.privateLocation.neighborhood }
            : {}),
          ...(replaceLocation
            ? { stateCode: municipality.stateCode, municipality }
            : {}),
        }
        return {
          ...current,
          street,
          neighborhood,
          stateCode: nextStateCode,
          municipality: nextMunicipality,
          postalCode: formatPostalCode(postalCode),
        }
      })
      const incomplete = !result.privateLocation.street || !result.privateLocation.neighborhood
      setPostalCodeNotice(
        incomplete
          ? 'CEP localizado. Complete os campos que não vieram do provedor e revise o endereço.'
          : 'Endereço preenchido pelo CEP. Revise e corrija qualquer campo, se necessário.',
      )
      setPostalCodeStatus('success')
    } catch (error) {
      if (
        version !== postalLookupVersion.current ||
        currentPostalCode.current !== postalCode
      ) {
        return
      }
      const lookupError = error instanceof PostalCodeError
        ? error
        : new PostalCodeError(
            'provider-unavailable',
            'Não foi possível consultar o CEP. Preencha o endereço manualmente ou tente novamente.',
            { cause: error },
          )
      if (!force) postalCodeCache.current.delete(postalCode)
      setPostalCodeStatus(lookupError.code === 'not-found' ? 'not-found' : 'error')
      setPostalCodeError(lookupError.message)
    }
  }

  function updatePostalCode(value: string) {
    const formatted = formatPostalCode(value)
    const normalized = normalizePostalCode(formatted)
    currentPostalCode.current = normalized
    postalLookupVersion.current += 1
    update('postalCode', formatted)
    setPostalCodeError(null)
    setPostalCodeNotice(null)
    setPostalCodeStatus('idle')
    if (normalized.length === 8 && lastAutomaticLookup.current !== normalized) {
      void queryPostalCode(formatted)
    }
  }

  async function rereadRequest() {
    const requestId = editingRequest?.requestId ?? confirmed?.requestId
    if (!requestId) return null
    const details = await serviceRequestService.getOwnRequestDetails(requestId)
    setRequestDetails(details)
    return details
  }

  function beginEdit() {
    if (!confirmed || confirmed.status !== 'OPEN' || !requestDetails) return
    const privateData = requestDetails.privateData
    setDraft({
      operationKey: newOperationKey(),
      categoryId: confirmed.categoryId,
      specialtyId: confirmed.specialtyId,
      description: privateData.notes,
      stateCode: privateData.address.stateCode,
      municipality: {
        city: privateData.address.city,
        stateCode: privateData.address.stateCode,
        ibgeCode: privateData.address.ibgeCode,
      },
      street: privateData.address.street,
      number: privateData.address.number,
      complement: privateData.address.complement ?? '',
      neighborhood: privateData.address.neighborhood,
      postalCode: privateData.address.postalCode,
      serviceDate: confirmed.serviceDate,
      period: confirmed.period,
    })
    currentPostalCode.current = privateData.address.postalCode
    lastAutomaticLookup.current = privateData.address.postalCode
    autofilledAddress.current = null
    setPostalCodeStatus('idle')
    setPostalCodeError(null)
    setPostalCodeNotice(null)
    setEditingRequest(confirmed)
    setConfirmed(null)
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
      const payload = {
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
      }
      const result = editingRequest
        ? await serviceRequestService.updateOwnRequest({
            ...payload,
            requestId: editingRequest.requestId,
            expectedRound: editingRequest.round,
          })
        : await serviceRequestService.createRequest(payload)
      if (!editingRequest && user?.uid) {
        window.localStorage.removeItem(draftStorageKey(user.uid))
      }
      setRequestDetails({
        request: result.request,
        privateData: {
          requestId: result.request.requestId,
          operationKey: result.request.operationKey,
          clientId: result.request.clientId,
          contactName: requestDetails?.privateData.contactName ?? profile?.name ?? '',
          contactPhone: requestDetails?.privateData.contactPhone ?? clientProfile?.phone ?? '',
          notes: draft.description.trim().replace(/\s+/g, ' '),
          address: {
            street: draft.street.trim(),
            number: draft.number.trim(),
            complement: draft.complement.trim(),
            neighborhood: draft.neighborhood.trim(),
            city: draft.municipality.city,
            stateCode: draft.stateCode,
            postalCode: draft.postalCode.replace(/\D/g, ''),
            ibgeCode: draft.municipality.ibgeCode,
          },
        },
      })
      setConfirmed(result.request)
      setEditingRequest(null)
      navigate(`/cliente/solicitar?pedido=${encodeURIComponent(result.request.requestId)}`, {
        replace: true,
      })
    } catch (error) {
      setSubmitError(requestErrorMessage(error))
      if (
        editingRequest &&
        error instanceof ServiceRequestError &&
        ['round-changed', 'not-open', 'stale-assignment'].includes(error.code)
      ) {
        try {
          const details = await rereadRequest()
          if (details) setEditingRequest(details.request)
        } catch {
          // Mantém o rascunho visível; a mensagem original continua sendo a mais útil.
        }
      }
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
        {
          requestId: confirmed.requestId,
          operationKey: cancellationOperationKey,
          expectedRound: confirmed.round,
          expectedAssignmentId: confirmed.currentAssignmentId,
        },
      )
      setConfirmed(result.request)
      if (requestDetails) {
        setRequestDetails({ ...requestDetails, request: result.request })
      }
      setConfirmCancellation(false)
    } catch (error) {
      setCancellationError(requestErrorMessage(error))
      if (
        error instanceof ServiceRequestError &&
        ['round-changed', 'stale-assignment', 'not-open'].includes(error.code)
      ) {
        try {
          const details = await rereadRequest()
          if (details) setConfirmed(details.request)
          setCancellationOperationKey(newOperationKey())
        } catch {
          // Preserva o estado já exibido quando a releitura também falha.
        }
      }
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
    const isExpired = isOpen && confirmed.acceptUntil.getTime() <= loadedAt.getTime()
    const isReplacement =
      isOpen && confirmed.reopenReason === 'PROFESSIONAL_CANCELLATION'
    const isAssigned = confirmed.status === 'ASSIGNED'
    const canCancel = isOpen || isAssigned
    const statusTitle = isReplacement && isExpired
      ? 'Substituição pendente'
      : isReplacement
        ? 'Procurando substituto'
      : isExpired
        ? 'Pedido pendente'
      : isOpen
        ? 'Procurando profissional'
      : isAssigned
        ? 'Profissional confirmado'
        : confirmed.status === 'CANCELLED'
          ? 'Solicitação cancelada'
          : confirmed.status === 'COMPLETED'
            ? 'Atendimento concluído'
            : 'Atendimento iniciado'
    return (
      <ClientLayout pageTitle="Solicitar serviço" contextSwitcher={<ModeSwitcher />}>
        <Card className="mx-auto max-w-2xl overflow-hidden">
          <div className="bg-brand-panel px-5 py-8 text-brand-panel-foreground sm:px-8">
            <CheckCircle2 className="size-10" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              {statusTitle}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-brand-panel-foreground/80">
              {isReplacement && isExpired
                ? 'O profissional cancelou após o prazo de novos aceites. O pedido continua aberto para intervenção ou reagendamento, sem confirmação de substituto.'
                : isReplacement
                  ? 'O profissional cancelou e uma nova rodada foi iniciada. A substituição depende de um novo aceite válido.'
              : isExpired
                ? 'O prazo desta rodada terminou sem aceite. O pedido continua visível; edite a data ou procure o suporte se precisar de ajuda.'
                : isOpen
                ? 'Sua solicitação foi salva. A disponibilidade depende de profissionais compatíveis na sua região.'
                : isAssigned
                  ? 'Um profissional aceitou este pedido. O cancelamento ainda é permitido antes do início do período.'
                  : confirmed.status === 'CANCELLED'
                    ? 'O cancelamento foi salvo e este pedido não participa mais da procura.'
                    : 'Para alterações após o início, procure o suporte pelos canais já informados no cadastro.'}
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
            {canCancel && confirmCancellation ? (
              <Alert variant="warning">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Cancelar esta solicitação?</AlertTitle>
                <AlertDescription>
                  <p>
                    {isAssigned
                      ? 'A atribuição e a reserva serão encerradas. A procura não será reiniciada.'
                      : 'A procura será encerrada e este pedido não poderá ser reaberto por esta tela.'}
                  </p>
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
              {isOpen && requestDetails ? (
                <Button type="button" variant="outline" onClick={beginEdit}>
                  Editar solicitação
                </Button>
              ) : null}
              {canCancel && !confirmCancellation ? (
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
          {editingRequest ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-3"
              onClick={() => {
                setConfirmed(requestDetails?.request ?? editingRequest)
                setEditingRequest(null)
                setSubmitError('')
              }}
            >
              <ArrowLeft aria-hidden="true" /> Voltar ao pedido
            </Button>
          ) : (
            <Button variant="ghost" size="sm" asChild className="-ml-3">
              <Link to="/cliente"><ArrowLeft aria-hidden="true" /> Voltar ao início</Link>
            </Button>
          )}
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {editingRequest ? 'Editar solicitação' : 'Conte o que você precisa'}
          </h2>
          <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
            {editingRequest
              ? 'Revise os campos. Ao salvar, uma nova rodada de procura substituirá a rodada atual.'
              : 'Informe uma especialidade, o local e um período. Você poderá revisar tudo antes de enviar.'}
          </p>
        </div>

        {editingRequest && editingRequest.status !== 'OPEN' ? (
          <Alert variant="warning" className="mb-6">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>O pedido mudou enquanto você editava</AlertTitle>
            <AlertDescription>
              Seus campos foram preservados, mas esta versão não pode mais ser salva. Volte ao pedido para ver o estado atual.
            </AlertDescription>
          </Alert>
        ) : null}

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
                <div className="space-y-2">
                  <Label htmlFor="request-postal-code">CEP *</Label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <Input
                      id="request-postal-code"
                      required
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={9}
                      value={draft.postalCode}
                      aria-invalid={
                        Boolean(postalCodeError) ||
                        (Boolean(draft.postalCode) && normalizePostalCode(draft.postalCode).length !== 8)
                      }
                      aria-describedby="request-postal-code-help request-postal-code-feedback"
                      placeholder="00000-000"
                      onChange={(event) => updatePostalCode(event.target.value)}
                      onBlur={() => {
                        const postalCode = normalizePostalCode(draft.postalCode)
                        if (postalCode.length === 8 && postalCodeStatus === 'idle') {
                          void queryPostalCode(postalCode)
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:shrink-0"
                      disabled={
                        postalCodeStatus === 'loading' ||
                        normalizePostalCode(draft.postalCode).length !== 8
                      }
                      loading={postalCodeStatus === 'loading'}
                      loadingLabel="Consultando CEPâ€¦"
                      onClick={() => void queryPostalCode(
                        draft.postalCode,
                        postalCodeStatus === 'error' || postalCodeStatus === 'not-found',
                      )}
                    >
                      {postalCodeStatus === 'error' || postalCodeStatus === 'not-found'
                        ? <RotateCcw aria-hidden="true" />
                        : null}
                      {postalCodeStatus === 'error' || postalCodeStatus === 'not-found'
                        ? 'Tentar novamente'
                        : 'Consultar CEP'}
                    </Button>
                  </div>
                  <p id="request-postal-code-help" className="text-xs leading-5 text-muted-foreground">
                    Preenchemos os dados disponíveis; número e complemento continuam manuais.
                  </p>
                  <div id="request-postal-code-feedback" aria-live="polite">
                    {postalCodeNotice ? (
                      <p className="text-sm text-success">{postalCodeNotice}</p>
                    ) : null}
                    {postalCodeError ? (
                      <p className="text-sm text-destructive">{postalCodeError}</p>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label htmlFor="request-state">UF *</Label>
                    <select
                      id="request-state"
                      required
                      value={draft.stateCode}
                      aria-invalid={!draft.stateCode}
                      className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/25"
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, stateCode: event.target.value, municipality: null }))
                        setSubmitError('')
                      }}
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
                <div className="space-y-2"><Label htmlFor="request-neighborhood">Bairro *</Label><Input id="request-neighborhood" required maxLength={120} value={draft.neighborhood} aria-invalid={!draft.neighborhood.trim()} onChange={(event) => update('neighborhood', event.target.value)} /></div>
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
                <CardDescription>Confira os dados antes de {editingRequest ? 'salvar' : 'enviar'}.</CardDescription>
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
                <Button type="submit" className="w-full" disabled={submitting || catalogState.status !== 'ready' || !clientProfileReadiness?.isComplete || Boolean(editingRequest && editingRequest.status !== 'OPEN')}>
                  {submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {submitting
                    ? editingRequest ? 'Salvando…' : 'Enviando…'
                    : editingRequest ? 'Salvar alterações' : 'Enviar solicitação'}
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
