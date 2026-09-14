import {
  BriefcaseBusiness,
  Check,
  CircleAlert,
  LogOut,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { cn } from '../../../utils/cn'
import { useAuth } from '../../auth/use-auth'
import {
  roleHomeRoutes,
  type OnboardingChoice,
} from '../user-role'
import { useProfile } from '../use-profile'

const choices = [
  {
    value: 'client',
    title: 'Quero contratar',
    description: 'Encontre profissionais e acompanhe seus pedidos como Cliente.',
    detail: 'Modo inicial: Cliente',
    icon: UserRound,
  },
  {
    value: 'professional',
    title: 'Quero prestar serviços',
    description:
      'Acesse sua jornada como profissional autônomo — pessoa física no MVP.',
    detail: 'Modo inicial: Profissional',
    icon: BriefcaseBusiness,
  },
  {
    value: 'both',
    title: 'Quero fazer os dois',
    description:
      'Contrate e ofereça serviços com a mesma conta, alternando o contexto quando precisar.',
    detail: 'Modo inicial: Cliente',
    icon: UsersRound,
  },
] as const

export function OnboardingPage() {
  useDocumentTitle('Escolha como usar o ProFind')
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { completeOnboarding } = useProfile()
  const [choice, setChoice] = useState<OnboardingChoice | ''>('')
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const isBusy = isSubmitting || isLoggingOut

  async function handleLogout() {
    if (isBusy) return
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
      navigate('/entrar', { replace: true })
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : 'Não foi possível sair agora. Tente novamente.',
      )
      setIsLoggingOut(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return

    if (!choice) {
      setSelectionError('Escolha como você pretende usar o ProFind.')
      document.getElementById('role-client')?.focus()
      return
    }

    setIsSubmitting(true)
    setSubmissionError(null)

    try {
      const profile = await completeOnboarding(choice)
      if (!profile.activeMode) throw new Error('O modo inicial não foi definido.')
      toast.success('Preferências salvas. Sua área está pronta.')
      navigate(roleHomeRoutes[profile.activeMode], { replace: true })
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar sua escolha agora.',
      )
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-16 lg:px-8 lg:py-20">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Uma conta, mais de uma jornada
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={isLoggingOut}
              loadingLabel="Saindo…"
              disabled={isSubmitting}
              onClick={() => void handleLogout()}
            >
              <LogOut aria-hidden="true" />
              Sair da conta
            </Button>
          </div>
          <h1 className="mt-5 max-w-2xl text-3xl font-black tracking-[-0.03em] text-balance sm:text-4xl">
            Como você quer usar o ProFind?
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Escolha seu contexto agora. Se selecionar as duas opções, poderá
            alternar entre Cliente e Profissional sem criar outra conta.
          </p>

          <form
            className="mt-8"
            noValidate
            aria-busy={isBusy}
            onSubmit={handleSubmit}
          >
            {submissionError ? (
              <Alert variant="destructive" className="mb-5">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Não foi possível salvar sua escolha</AlertTitle>
                <AlertDescription>{submissionError}</AlertDescription>
              </Alert>
            ) : null}

            {logoutError ? (
              <Alert variant="destructive" className="mb-5">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Não foi possível sair</AlertTitle>
                <AlertDescription>{logoutError}</AlertDescription>
              </Alert>
            ) : null}

            <RadioGroup
              value={choice}
              disabled={isBusy}
              aria-label="Forma de uso do ProFind"
              aria-invalid={Boolean(selectionError)}
              aria-describedby={selectionError ? 'role-selection-error' : undefined}
              onValueChange={(value) => {
                setChoice(value as OnboardingChoice)
                setSelectionError(null)
                setSubmissionError(null)
              }}
              className="grid gap-4 md:grid-cols-3"
            >
              {choices.map((option) => {
                const Icon = option.icon
                const selected = choice === option.value
                return (
                  <label
                    key={option.value}
                    htmlFor={`role-${option.value}`}
                    className={cn(
                      'relative flex min-h-48 cursor-pointer flex-col rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/35',
                      'focus-within:ring-[3px] focus-within:ring-ring/25',
                      selected && 'border-primary bg-accent/45',
                      isBusy && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Icon aria-hidden="true" />
                      </span>
                      <RadioGroupItem
                        id={`role-${option.value}`}
                        value={option.value}
                        className="mt-0.5"
                      />
                    </div>
                    <span className="mt-5 font-bold">{option.title}</span>
                    <span className="mt-2 text-sm leading-6 text-muted-foreground">
                      {option.description}
                    </span>
                    <span className="mt-auto flex items-center gap-2 pt-4 text-xs font-semibold text-primary">
                      <Check className="size-3.5" aria-hidden="true" />
                      {option.detail}
                    </span>
                  </label>
                )
              })}
            </RadioGroup>

            {selectionError ? (
              <p id="role-selection-error" className="mt-3 text-sm text-destructive">
                {selectionError}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="mt-6 w-full sm:w-auto"
              loading={isSubmitting}
              disabled={isLoggingOut}
              loadingLabel="Salvando sua escolha…"
            >
              Continuar
            </Button>
          </form>
        </div>

        <aside className="border-t pt-8 lg:sticky lg:top-[calc(var(--app-header-height)+2rem)] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <h2 className="font-bold">Sua identidade continua única</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Nome, e-mail e acesso permanecem vinculados à mesma conta, mesmo ao
            alternar de contexto.
          </p>
          <PrivacyNotice title="Escolha privada" className="mt-6">
            Seus papéis orientam apenas a experiência dentro da conta e não
            tornam seus dados de contato públicos.
          </PrivacyNotice>
        </aside>
      </section>
    </AppShell>
  )
}
