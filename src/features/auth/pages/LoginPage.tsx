import { CircleAlert } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { PasswordInput } from '../../../components/ui/password-input'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { getSafeIntendedRoute, getSessionNotice } from '../auth-navigation'
import { validateLogin } from '../auth-validation'
import { AuthPageLayout } from '../components/AuthPageLayout'
import { useAuth } from '../use-auth'

export function LoginPage() {
  useDocumentTitle('Entrar — ProFind')
  const formRef = useRef<HTMLFormElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { status, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const destination = getSafeIntendedRoute(location.state)
  const sessionNotice = getSessionNotice(location.state)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const validation = validateLogin(email, password)
    const nextErrors = {
      email: validation.email ?? undefined,
      password: validation.password ?? undefined,
    }
    setErrors(nextErrors)
    setSubmissionError(null)

    if (validation.email || validation.password) {
      const fieldName = validation.email ? 'email' : 'password'
      const field = formRef.current?.elements.namedItem(fieldName)
      if (field instanceof HTMLElement) field.focus()
      return
    }

    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate(destination, { replace: true })
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível entrar agora. Tente novamente em instantes.',
      )
      setIsSubmitting(false)
    }
  }

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />
  }

  return (
    <AuthPageLayout
      badge="Acesso à sua conta"
      title="Entre no ProFind"
      description="Acesse com o e-mail e a senha usados no cadastro."
      cardTitle="Seus dados de acesso"
      cardDescription="Os dois campos são obrigatórios."
      footer={
        <p>
          Ainda não tem uma conta?{' '}
          <Link className="font-semibold text-primary underline underline-offset-4" to="/cadastro">
            Criar conta
          </Link>
        </p>
      }
    >
      <form ref={formRef} noValidate aria-busy={isSubmitting} className="grid gap-5" onSubmit={handleSubmit}>
        {sessionNotice && !submissionError ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Sessão encerrada</AlertTitle>
            <AlertDescription>{sessionNotice}</AlertDescription>
          </Alert>
        ) : null}
        {submissionError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Não foi possível entrar</AlertTitle>
            <AlertDescription>{submissionError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="login-email">E-mail</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((current) => ({ ...current, email: undefined }))
              setSubmissionError(null)
            }}
          />
          {errors.email ? <p id="login-email-error" className="text-sm text-destructive">{errors.email}</p> : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="login-password">Senha</Label>
            <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" to="/recuperar-senha">
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            onChange={(event) => {
              setPassword(event.target.value)
              setErrors((current) => ({ ...current, password: undefined }))
              setSubmissionError(null)
            }}
          />
          {errors.password ? <p id="login-password-error" className="text-sm text-destructive">{errors.password}</p> : null}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} loadingLabel="Entrando…">
          Entrar
        </Button>
      </form>
    </AuthPageLayout>
  )
}
