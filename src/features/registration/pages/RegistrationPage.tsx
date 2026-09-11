import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import { Checkbox } from '../../../components/ui/checkbox'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { PasswordInput } from '../../../components/ui/password-input'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { CURRENT_LEGAL_ACCEPTANCE } from '../../legal/legal-documents'
import {
  getRegistrationErrorMessage,
  registerAccount,
} from '../../../services/registration.service'
import {
  validateRegistrationForm,
  type RegistrationField,
  type RegistrationFormValues,
  type RegistrationValidationErrors,
} from '../registration.validation'
import { useRegistrationDraft } from '../useRegistrationDraft'

const fieldOrder: RegistrationField[] = [
  'name',
  'email',
  'password',
  'passwordConfirmation',
  'legalAccepted',
]

interface FieldErrorProps {
  id: string
  message?: string
}

function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null

  return (
    <p id={id} className="text-sm leading-5 text-destructive">
      {message}
    </p>
  )
}

export function RegistrationPage() {
  useDocumentTitle('Criar conta — ProFind')
  const formRef = useRef<HTMLFormElement>(null)
  const { values, setValues, reset } = useRegistrationDraft()
  const [errors, setErrors] = useState<RegistrationValidationErrors>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle')
  const isSubmitting = status === 'submitting'

  function updateValue<Field extends RegistrationField>(
    field: Field,
    value: RegistrationFormValues[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmissionError(null)
  }

  function focusFirstInvalidField(validationErrors: RegistrationValidationErrors) {
    const firstInvalidField = fieldOrder.find((field) => validationErrors[field])
    if (!firstInvalidField) return

    const field = formRef.current?.elements.namedItem(firstInvalidField)
    if (field instanceof HTMLElement) field.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const validationErrors = validateRegistrationForm(values)
    setErrors(validationErrors)
    setSubmissionError(null)

    if (Object.keys(validationErrors).length > 0) {
      focusFirstInvalidField(validationErrors)
      return
    }

    setStatus('submitting')

    try {
      await registerAccount({
        name: values.name,
        email: values.email,
        password: values.password,
        legalAcceptance: CURRENT_LEGAL_ACCEPTANCE,
      })
      reset()
      setStatus('success')
    } catch (error) {
      setSubmissionError(getRegistrationErrorMessage(error))
      setStatus('idle')
    }
  }

  if (status === 'success') {
    return (
      <AppShell>
        <section className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-2xl items-center px-4 py-12 sm:px-6 sm:py-20">
          <div className="w-full">
            <Alert variant="success" className="p-5 sm:p-6">
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>Conta criada com sucesso</AlertTitle>
              <AlertDescription>
                Sua identidade e seu perfil base estão prontos. Você já pode
                continuar usando o ProFind com esta conta.
              </AlertDescription>
            </Alert>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/">Voltar para a página inicial</Link>
              </Button>
            </div>
          </div>
        </section>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.7fr)] lg:items-start lg:gap-16 lg:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-xl lg:mx-0">
          <Button variant="link" asChild>
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Voltar para o início
            </Link>
          </Button>

          <div className="mt-7">
            <Badge variant="secondary">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Cadastro seguro
            </Badge>
            <h1 className="mt-5 text-3xl font-black tracking-[-0.03em] text-balance sm:text-4xl">
              Crie sua conta no ProFind
            </h1>
            <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
              Informe somente o necessário para criar sua identidade e acessar
              recursos protegidos.
            </p>
          </div>

          <Card className="mt-8">
            <CardHeader className="pb-4">
              <h2 className="text-lg font-bold tracking-tight">Seus dados de acesso</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Todos os campos são obrigatórios.
              </p>
            </CardHeader>
            <CardContent>
              <form
                ref={formRef}
                noValidate
                aria-busy={isSubmitting}
                onSubmit={handleSubmit}
                className="grid gap-5"
              >
                {submissionError ? (
                  <Alert variant="destructive">
                    <LockKeyhole aria-hidden="true" />
                    <AlertTitle>Não foi possível concluir o cadastro</AlertTitle>
                    <AlertDescription>{submissionError}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="registration-name">Nome completo</Label>
                  <Input
                    id="registration-name"
                    name="name"
                    autoComplete="name"
                    value={values.name}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'registration-name-error' : undefined}
                    onChange={(event) => updateValue('name', event.target.value)}
                  />
                  <FieldError id="registration-name-error" message={errors.name} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="registration-email">E-mail</Label>
                  <Input
                    id="registration-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    spellCheck={false}
                    value={values.email}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'registration-email-error' : undefined}
                    onChange={(event) => updateValue('email', event.target.value)}
                  />
                  <FieldError id="registration-email-error" message={errors.email} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="registration-password">Senha</Label>
                  <PasswordInput
                    id="registration-password"
                    name="password"
                    autoComplete="new-password"
                    value={values.password}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      errors.password
                        ? 'registration-password-hint registration-password-error'
                        : 'registration-password-hint'
                    }
                    onChange={(event) => updateValue('password', event.target.value)}
                  />
                  <p id="registration-password-hint" className="text-xs text-muted-foreground">
                    Use pelo menos 6 caracteres.
                  </p>
                  <FieldError id="registration-password-error" message={errors.password} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="registration-password-confirmation">Confirmar senha</Label>
                  <PasswordInput
                    id="registration-password-confirmation"
                    name="passwordConfirmation"
                    autoComplete="new-password"
                    value={values.passwordConfirmation}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.passwordConfirmation)}
                    aria-describedby={
                      errors.passwordConfirmation
                        ? 'registration-password-confirmation-error'
                        : undefined
                    }
                    onChange={(event) =>
                      updateValue('passwordConfirmation', event.target.value)
                    }
                  />
                  <FieldError
                    id="registration-password-confirmation-error"
                    message={errors.passwordConfirmation}
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="registration-legal"
                      name="legalAccepted"
                      checked={values.legalAccepted}
                      disabled={isSubmitting}
                      aria-invalid={Boolean(errors.legalAccepted)}
                      aria-describedby={
                        errors.legalAccepted ? 'registration-legal-error' : undefined
                      }
                      onCheckedChange={(checked) =>
                        updateValue('legalAccepted', checked === true)
                      }
                    />
                    <Label
                      htmlFor="registration-legal"
                      className="pt-0.5 text-sm leading-6 font-normal"
                    >
                      Li e aceito os{' '}
                      <Link
                        to="/termos-de-uso"
                        className="font-semibold text-primary underline underline-offset-4"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Termos de Uso
                      </Link>{' '}
                      e a{' '}
                      <Link
                        to="/politica-de-privacidade"
                        className="font-semibold text-primary underline underline-offset-4"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Política de Privacidade
                      </Link>
                      .
                    </Label>
                  </div>
                  <FieldError id="registration-legal-error" message={errors.legalAccepted} />
                </div>

                <PrivacyNotice title="Privacidade desde o cadastro">
                  Sua senha é processada pelo Firebase Authentication e não é
                  armazenada no perfil público do ProFind.
                </PrivacyNotice>

                <Button
                  type="submit"
                  size="lg"
                  loading={isSubmitting}
                  loadingLabel="Criando sua conta…"
                  className="w-full"
                >
                  Criar minha conta
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <aside className="border-t pt-8 lg:sticky lg:top-[calc(var(--app-header-height)+2rem)] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <p className="text-sm font-semibold text-primary">O que acontece agora</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            Uma base simples para usar o marketplace.
          </h2>
          <ul className="mt-6 grid gap-5 text-sm leading-6 text-muted-foreground">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>Seu e-mail passa a identificar sua conta com segurança.</span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>Seu nome compõe o perfil base associado à identidade.</span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>Você mantém os dados preenchidos caso seja necessário tentar novamente.</span>
            </li>
          </ul>
        </aside>
      </section>
    </AppShell>
  )
}
