import { CheckCircle2, CircleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { validateEmail } from '../auth-validation'
import { AuthPageLayout } from '../components/AuthPageLayout'
import { useAuth } from '../use-auth'

export function PasswordRecoveryPage() {
  useDocumentTitle('Recuperar senha — ProFind')
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const validationError = validateEmail(email)
    setEmailError(validationError)
    setSubmissionError(null)
    if (validationError) return

    setIsSubmitting(true)
    try {
      await requestPasswordReset(email)
      setIsComplete(true)
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível solicitar a recuperação agora. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageLayout
      badge="Recuperação segura"
      title="Recupere o acesso à sua conta"
      description="Informe seu e-mail para receber as instruções de redefinição de senha."
      cardTitle="Redefinição de senha"
      cardDescription="O envio é processado com segurança pelo Firebase Authentication."
      footer={<Link className="font-semibold text-primary underline underline-offset-4" to="/entrar">Voltar para entrar</Link>}
    >
      {isComplete ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Confira seu e-mail</AlertTitle>
          <AlertDescription>
            Se houver uma conta associada a esse endereço, você receberá as instruções para criar uma nova senha.
          </AlertDescription>
        </Alert>
      ) : (
        <form noValidate aria-busy={isSubmitting} className="grid gap-5" onSubmit={handleSubmit}>
          {submissionError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Não foi possível enviar</AlertTitle>
              <AlertDescription>{submissionError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="recovery-email">E-mail</Label>
            <Input
              id="recovery-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              disabled={isSubmitting}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'recovery-email-error' : 'recovery-email-hint'}
              onChange={(event) => {
                setEmail(event.target.value)
                setEmailError(null)
                setSubmissionError(null)
              }}
            />
            <p id="recovery-email-hint" className="text-xs leading-5 text-muted-foreground">
              Por privacidade, não informamos se o endereço está cadastrado.
            </p>
            {emailError ? <p id="recovery-email-error" className="text-sm text-destructive">{emailError}</p> : null}
          </div>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} loadingLabel="Enviando…">
            Enviar instruções
          </Button>
        </form>
      )}
    </AuthPageLayout>
  )
}
