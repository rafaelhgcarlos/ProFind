import {
  Camera,
  CheckCircle2,
  CircleAlert,
  LockKeyhole,
  RefreshCw,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { toast } from 'sonner'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { getImageProvider } from '../../../providers/image-provider.factory'
import {
  prepareImageRemoval,
  removeImageReference,
  uploadImageReference,
  validateProfessionalImageFile,
} from '../../../services/professional-images.service'
import {
  loadClientProfileEditor,
  normalizeClientPhone,
  saveClientProfile,
} from '../../../services/client-profile.service'
import type {
  ClientProfileEditor,
  ClientProfileInput,
} from '../../../types/client-profile'
import type { ImageReference } from '../../../types/image'
import { useAuth } from '../../auth/use-auth'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

interface AvatarTask {
  file: File
  previewUrl: string | null
  progress: number
  status: 'uploading' | 'error' | 'success'
  error?: string
  reference?: ImageReference
}

interface FieldErrors {
  name?: string
  phone?: string
}

function formatPhone(value: string) {
  const digits = normalizeClientPhone(value)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function comparable(input: ClientProfileInput | ClientProfileEditor) {
  return JSON.stringify({
    name: input.name.trim().replace(/\s+/g, ' '),
    phone: normalizeClientPhone(input.phone),
    profileImage: input.profileImage?.providerId ?? null,
  })
}

function initialForm(editor: ClientProfileEditor): ClientProfileInput {
  return {
    name: editor.name,
    phone: formatPhone(editor.phone),
    profileImage: editor.profileImage,
  }
}

export function ClientProfilePage() {
  useDocumentTitle('Perfil do cliente — ProFind')
  const { user } = useAuth()
  const { profile, syncClientProfile } = useProfile()
  const imageProvider = useMemo(() => getImageProvider(), [])
  const [editor, setEditor] = useState<ClientProfileEditor | null>(null)
  const [form, setForm] = useState<ClientProfileInput | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [avatarTask, setAvatarTask] = useState<AvatarTask | null>(null)
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [pendingCleanup, setPendingCleanup] = useState<ImageReference | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.uid) return
    let active = true
    setLoading(true)
    setLoadError(null)
    void loadClientProfileEditor(user.uid)
      .then((loaded) => {
        if (!active) return
        setEditor(loaded)
        setForm(initialForm(loaded))
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o perfil do cliente.',
        )
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attempt, user?.uid])

  useEffect(
    () => () => {
      if (avatarTask?.previewUrl) URL.revokeObjectURL(avatarTask.previewUrl)
    },
    [avatarTask?.previewUrl],
  )

  const isDirty = Boolean(editor && form && comparable(editor) !== comparable(form))
  const imageBusy = avatarTask?.status === 'uploading' || removingAvatar

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    const warnBeforeInternalNavigation = (event: MouseEvent) => {
      const target = event.target
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
      if (
        !anchor ||
        anchor.target === '_blank' ||
        new URL(anchor.href, window.location.href).origin !== window.location.origin
      ) {
        return
      }
      if (!window.confirm('Você tem alterações não salvas. Deseja sair mesmo assim?')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    document.addEventListener('click', warnBeforeInternalNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving)
      document.removeEventListener('click', warnBeforeInternalNavigation, true)
    }
  }, [isDirty])

  function updateField(field: 'name' | 'phone', value: string) {
    setForm((current) =>
      current
        ? { ...current, [field]: field === 'phone' ? formatPhone(value) : value }
        : current,
    )
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setSubmissionError(null)
    setSuccessMessage(null)
  }

  async function runAvatarUpload(task: AvatarTask, retry = false) {
    if (!user?.uid) return
    setAvatarTask({ ...task, status: 'uploading', progress: 0, error: undefined })
    setCleanupError(null)
    try {
      const reference = await uploadImageReference(
        imageProvider,
        {
          ownerId: user.uid,
          purpose: 'CLIENT_AVATAR',
          file: task.file,
          previousReference: editor?.profileImage,
          onProgress: (progress) =>
            setAvatarTask((current) =>
              current ? { ...current, progress } : current,
            ),
        },
        { retry },
      )
      setAvatarTask((current) =>
        current
          ? {
              ...current,
              previewUrl: null,
              status: 'success',
              progress: 100,
              reference,
            }
          : current,
      )
      setForm((current) =>
        current ? { ...current, profileImage: reference } : current,
      )
      setSubmissionError(null)
      setSuccessMessage(null)
    } catch (error) {
      setAvatarTask((current) =>
        current
          ? {
              ...current,
              status: 'error',
              error:
                error instanceof Error
                  ? error.message
                  : 'Não foi possível enviar a foto.',
            }
          : current,
      )
    }
  }

  function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      validateProfessionalImageFile(file, 'CLIENT_AVATAR')
    } catch (error) {
      setAvatarTask({
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Selecione uma imagem válida.',
      })
      return
    }
    const task: AvatarTask = {
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'uploading',
    }
    void runAvatarUpload(task)
  }

  async function handleRemoveAvatar() {
    if (!form?.profileImage || !editor) return
    const reference = form.profileImage
    const isUnsavedUpload =
      reference.providerId !== editor.profileImage?.providerId
    setRemovingAvatar(true)
    setCleanupError(null)
    try {
      if (!isUnsavedUpload && reference.provider !== 'LEGACY') {
        await prepareImageRemoval(
          imageProvider,
          reference,
          editor.userId,
          'CLIENT_AVATAR',
        )
      }
      setForm((current) =>
        current ? { ...current, profileImage: null } : current,
      )
      setAvatarTask(null)
      setSuccessMessage(null)
    } catch (error) {
      setCleanupError(
        error instanceof Error
          ? error.message
          : 'Não foi possível remover a foto. Tente novamente.',
      )
    } finally {
      setRemovingAvatar(false)
    }
  }

  async function retryPendingCleanup() {
    if (!pendingCleanup || !user?.uid || removingAvatar) return
    setRemovingAvatar(true)
    try {
      await removeImageReference(
        imageProvider,
        pendingCleanup,
        user.uid,
        'CLIENT_AVATAR',
      )
      setPendingCleanup(null)
      setCleanupError(null)
    } catch {
      setCleanupError(
        editor?.profileImage
          ? 'A foto nova continua salva, mas a anterior ainda não pôde ser removida do provedor.'
          : 'O perfil continua sem foto, mas o arquivo ainda não pôde ser removido do provedor.',
      )
    } finally {
      setRemovingAvatar(false)
    }
  }

  function validateForm(current: ClientProfileInput) {
    const errors: FieldErrors = {}
    const name = current.name.trim()
    const phone = normalizeClientPhone(current.phone)
    if (name.length < 2 || name.length > 120) {
      errors.name = 'Informe um nome com 2 a 120 caracteres.'
    }
    if (phone && !/^\d{10,11}$/.test(phone)) {
      errors.phone = 'Informe DDD e telefone com 10 ou 11 dígitos.'
    }
    return errors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !form || saving || imageBusy || !isDirty) return
    const errors = validateForm(form)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      if (errors.name) nameInput.current?.focus()
      return
    }

    setSaving(true)
    setSubmissionError(null)
    setSuccessMessage(null)
    setCleanupError(null)
    const previousImage = editor.profileImage
    try {
      const saved = await saveClientProfile(editor, form)
      setEditor(saved)
      setForm(initialForm(saved))
      syncClientProfile(saved)
      setAvatarTask(null)
      setSuccessMessage('Perfil salvo. O cabeçalho já foi atualizado.')
      toast.success('Perfil do cliente salvo.')

      if (
        previousImage &&
        previousImage.providerId !== saved.profileImage?.providerId &&
        previousImage.provider !== 'LEGACY' &&
        (!saved.profileImage ||
          previousImage.provider === saved.profileImage.provider)
      ) {
        try {
          await removeImageReference(
            imageProvider,
            previousImage,
            saved.userId,
            'CLIENT_AVATAR',
          )
          setPendingCleanup(null)
        } catch {
          setPendingCleanup(previousImage)
          setCleanupError(
            saved.profileImage
              ? 'O perfil foi salvo, mas a foto anterior não pôde ser removida do provedor.'
              : 'O perfil foi salvo sem a foto, mas o arquivo ainda não pôde ser removido do provedor.',
          )
        }
      }
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o perfil. Seus dados foram mantidos.',
      )
    } finally {
      setSaving(false)
    }
  }

  const pendingPreviewUrl =
    avatarTask?.status === 'uploading' || avatarTask?.status === 'error'
      ? avatarTask.previewUrl
      : null
  const avatarUrl = pendingPreviewUrl ?? form?.profileImage?.url
  const initials = (form?.name || profile?.name || 'Cliente')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <ClientLayout
      pageTitle="Meu perfil"
      userName={profile?.name}
      activeNavigationHref="/cliente/perfil"
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              Perfil privado
            </Badge>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Seus dados de cliente
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Atualize como você aparece dentro da sua conta. Telefone, e-mail e foto não formam um perfil público.
            </p>
          </div>
        </div>

        {loading ? (
          <div role="status" aria-live="polite" className="grid gap-6 md:grid-cols-[15rem_1fr]">
            <span className="sr-only">Carregando perfil do cliente…</span>
            <Skeleton className="h-64" />
            <Skeleton className="h-96" />
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Não foi possível carregar o perfil</AlertTitle>
            <AlertDescription>
              <p>{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw aria-hidden="true" />
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : editor && form ? (
          <form noValidate aria-busy={saving || imageBusy} onSubmit={handleSubmit}>
            {submissionError ? (
              <Alert variant="destructive" className="mb-6">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Não foi possível salvar</AlertTitle>
                <AlertDescription>{submissionError}</AlertDescription>
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert variant="success" className="mb-6">
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Alterações salvas</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}
            {cleanupError ? (
              <Alert variant="warning" className="mb-6">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Atenção à foto</AlertTitle>
                <AlertDescription>
                  <p>{cleanupError}</p>
                  {pendingCleanup ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      loading={removingAvatar}
                      onClick={() => void retryPendingCleanup()}
                    >
                      <RefreshCw aria-hidden="true" />
                      Tentar remover novamente
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Foto de perfil</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center text-center">
                  <Avatar className="size-28 border border-border shadow-soft">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt="Prévia da foto de perfil" /> : null}
                    <AvatarFallback className="text-xl">{initials}</AvatarFallback>
                  </Avatar>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label="Selecionar foto de perfil"
                    onChange={handleAvatarSelection}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    disabled={imageBusy || saving}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Camera aria-hidden="true" />
                    {form.profileImage ? 'Trocar foto' : 'Adicionar foto'}
                  </Button>
                  {form.profileImage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full text-destructive"
                      loading={removingAvatar}
                      disabled={saving || avatarTask?.status === 'uploading'}
                      onClick={() => void handleRemoveAvatar()}
                    >
                      <Trash2 aria-hidden="true" />
                      Remover foto
                    </Button>
                  ) : null}
                  {avatarTask ? (
                    <div className="mt-4 w-full text-left" aria-live="polite">
                      {avatarTask.status === 'uploading' ? (
                        <>
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>Enviando foto</span>
                            <span>{avatarTask.progress}%</span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label="Progresso do envio da foto"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={avatarTask.progress}
                            className="h-2 overflow-hidden rounded-full bg-muted"
                          >
                            <div className="h-full bg-primary transition-[width]" style={{ width: `${avatarTask.progress}%` }} />
                          </div>
                        </>
                      ) : null}
                      {avatarTask.status === 'error' ? (
                        <div className="text-sm text-destructive">
                          <p>{avatarTask.error}</p>
                          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void runAvatarUpload(avatarTask, true)}>
                            <RefreshCw aria-hidden="true" />
                            Tentar envio novamente
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    JPEG, PNG ou WebP, até 5 MB.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="size-5 text-primary" aria-hidden="true" />
                    Informações da conta
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="client-name">Nome completo</Label>
                    <Input
                      ref={nameInput}
                      id="client-name"
                      autoComplete="name"
                      maxLength={120}
                      required
                      value={form.name}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? 'client-name-error' : 'client-name-help'}
                      onChange={(event) => updateField('name', event.target.value)}
                    />
                    <p id="client-name-help" className="text-xs text-muted-foreground">
                      Este nome é compartilhado entre os modos Cliente e Profissional.
                    </p>
                    {fieldErrors.name ? <p id="client-name-error" className="text-sm text-destructive">{fieldErrors.name}</p> : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="client-email">E-mail de acesso</Label>
                    <Input id="client-email" type="email" value={editor.email} readOnly aria-readonly="true" className="bg-muted" />
                    <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado nesta tela.</p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="client-phone">Telefone <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                    <Input
                      id="client-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(11) 99999-9999"
                      value={form.phone}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? 'client-phone-help client-phone-error' : 'client-phone-help'}
                      onChange={(event) => updateField('phone', event.target.value)}
                    />
                    <p id="client-phone-help" className="text-xs text-muted-foreground">Uso privado para contato relacionado à sua conta.</p>
                    {fieldErrors.phone ? <p id="client-phone-error" className="text-sm text-destructive">{fieldErrors.phone}</p> : null}
                  </div>

                  <PrivacyNotice title="Seus dados continuam privados">
                    O perfil de cliente não é público. Telefone e foto ficam acessíveis somente a você e ao backend autorizado.
                  </PrivacyNotice>
                </CardContent>
              </Card>
            </div>

            <div className="sticky bottom-16 z-20 mt-6 flex flex-col-reverse gap-3 rounded-lg border bg-card/95 p-4 shadow-soft backdrop-blur sm:bottom-4 sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {isDirty ? 'Você tem alterações não salvas.' : 'Todas as alterações estão salvas.'}
              </p>
              <Button type="submit" loading={saving} loadingLabel="Salvando perfil…" disabled={!isDirty || imageBusy} className="w-full sm:w-auto">
                Salvar perfil
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </ClientLayout>
  )
}
