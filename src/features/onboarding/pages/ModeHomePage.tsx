import {
  BriefcaseBusiness,
  CircleAlert,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useAuth } from '../../auth/use-auth'
import { ProfessionalRegistrationSupport } from '../../professional-profile/components/ProfessionalRegistrationSupport'
import { ModeSwitcher } from '../components/ModeSwitcher'
import {
  hasCompletedProfessionalProfile,
  roleLabels,
  type UserRole,
} from '../user-role'
import { useProfile } from '../use-profile'

interface ModeHomePageProps {
  mode: UserRole
}

function getModeNotice(state: unknown) {
  if (typeof state !== 'object' || state === null || !('modeNotice' in state)) {
    return null
  }

  return state.modeNotice === 'Este modo não está habilitado para sua conta.'
    ? state.modeNotice
    : null
}

export function ModeHomePage({ mode }: ModeHomePageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { profile } = useProfile()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const modeNotice = getModeNotice(location.state)
  const isClient = mode === 'client'
  const Icon = isClient ? UserRound : BriefcaseBusiness
  const title = roleLabels[mode]
  useDocumentTitle(`${title} — ProFind`)

  async function handleLogout() {
    if (isLoggingOut) return
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

  const content = (
    <div className="mx-auto max-w-4xl">
      {modeNotice ? (
        <Alert variant="warning" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Modo indisponível</AlertTitle>
          <AlertDescription>{modeNotice}</AlertDescription>
        </Alert>
      ) : null}

      {logoutError ? (
        <Alert variant="destructive" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Não foi possível sair</AlertTitle>
          <AlertDescription>{logoutError}</AlertDescription>
        </Alert>
      ) : null}

      {!isClient && profile && !hasCompletedProfessionalProfile(profile) ? (
        <Alert variant="warning" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Cadastro profissional ainda incompleto</AlertTitle>
          <AlertDescription>
            <p>
              Seu cadastro profissional ainda precisa ser concluído e enviado
              para análise. Para receber oportunidades, seu cadastro precisa
              estar aprovado e ativo.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/profissional/perfil">Criar cadastro profissional</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Badge variant="secondary">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Modo {title} ativo
      </Badge>
      <div className="mt-5 flex size-12 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
        Olá, {profile?.name || 'usuário ProFind'}.
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
        {isClient
          ? 'Você está na experiência de Cliente. A partir daqui, as próximas funcionalidades priorizarão suas necessidades de contratação.'
          : 'Você está na área profissional. Complete seu cadastro e acompanhe a análise da equipe.'}
      </p>

      {!isClient ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/profissional/analise">Acompanhar análise</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/profissional/perfil">Editar cadastro</Link>
          </Button>
        </div>
      ) : null}

      {!isClient ? <ProfessionalRegistrationSupport className="mt-6" /> : null}

      <div className="mt-8 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          Conta conectada como <span className="font-medium text-foreground">{profile?.email}</span>
        </p>
        <Button
          variant="outline"
          className="mt-4"
          loading={isLoggingOut}
          loadingLabel="Saindo…"
          onClick={handleLogout}
        >
          <LogOut aria-hidden="true" />
          Sair da conta
        </Button>
      </div>
    </div>
  )

  const layoutProps = {
    pageTitle: 'Início',
    userName: profile?.name,
    contextSwitcher: <ModeSwitcher />,
  }

  return isClient ? (
    <ClientLayout {...layoutProps}>{content}</ClientLayout>
  ) : (
    <ProfessionalLayout {...layoutProps}>{content}</ProfessionalLayout>
  )
}
