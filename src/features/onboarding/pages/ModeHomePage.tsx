import {
  BriefcaseBusiness,
  CircleAlert,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useAuth } from '../../auth/use-auth'
import { ModeSwitcher } from '../components/ModeSwitcher'
import {
  hasPublicableProfessionalProfile,
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

      {!isClient && profile && !hasPublicableProfessionalProfile(profile) ? (
        <Alert variant="warning" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Perfil profissional ainda não publicável</AlertTitle>
          <AlertDescription>
            O papel Profissional está habilitado, mas o perfil profissional
            ainda precisa ser concluído no fluxo específico antes da publicação.
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
      <h2 className="mt-5 text-2xl font-black tracking-tight sm:text-3xl">
        Olá, {profile?.name || 'usuário ProFind'}.
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
        {isClient
          ? 'Você está na experiência de Cliente. A partir daqui, as próximas funcionalidades priorizarão suas necessidades de contratação.'
          : 'Você está na experiência de Profissional. No MVP, este contexto é destinado exclusivamente a profissionais pessoa física.'}
      </p>

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
