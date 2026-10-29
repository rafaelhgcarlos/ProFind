import {
  BriefcaseBusiness,
  CircleAlert,
  Clock3,
  Compass,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
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
  const { profile } = useProfile()
  const modeNotice = getModeNotice(location.state)
  const isClient = mode === 'client'
  const Icon = isClient ? UserRound : BriefcaseBusiness
  const title = roleLabels[mode]
  useDocumentTitle(`${title} — ProFind`)

  const content = (
    <div className="mx-auto max-w-4xl">
      {modeNotice ? (
        <Alert variant="warning" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Modo indisponível</AlertTitle>
          <AlertDescription>{modeNotice}</AlertDescription>
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                Cadastro e análise
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/profissional/analise">Acompanhar análise</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/profissional/perfil">Editar cadastro</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="bg-surface-tint">
            <CardHeader>
              <Badge variant="outline" className="w-fit">Em breve</Badge>
              <CardTitle className="flex items-center gap-2 text-base">
                <Compass className="size-5 text-primary" aria-hidden="true" />
                Oportunidades e atendimentos
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Novas oportunidades serão exibidas somente para profissionais
              elegíveis. Seus atendimentos existentes continuarão preservados.
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!isClient ? (
        <div id="ajuda-cadastro" className="scroll-mt-24">
          <ProfessionalRegistrationSupport className="mt-6" />
        </div>
      ) : null}

      {!isClient ? (
        <Alert className="mt-6">
          <Clock3 aria-hidden="true" />
          <AlertTitle>Atendimentos existentes serão preservados</AlertTitle>
          <AlertDescription>
            Estados de análise ou suspensão não apagam histórico, reservas ou
            atendimentos já autorizados. O acompanhamento estará disponível em
            uma próxima etapa.
          </AlertDescription>
        </Alert>
      ) : null}
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
