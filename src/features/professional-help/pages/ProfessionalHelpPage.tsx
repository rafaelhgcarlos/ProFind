import { CalendarClock, CircleHelp, ClipboardCheck, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalRegistrationSupport } from '../../professional-profile/components/ProfessionalRegistrationSupport'

export function ProfessionalHelpPage() {
  useDocumentTitle('Ajuda — ProFind')
  const { profile } = useProfile()

  return (
    <ProfessionalLayout
      pageTitle="Ajuda"
      activeNavigationHref="/profissional/ajuda"
      userName={profile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto grid max-w-5xl gap-6">
        <header>
          <Badge variant="secondary">
            <CircleHelp aria-hidden="true" className="size-3.5" />
            Central de ajuda
          </Badge>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Como podemos ajudar?
          </h2>
          <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
            Acesse rapidamente seu cadastro, a análise profissional ou os
            compromissos que precisam de atenção.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="flex flex-col">
            <CardHeader>
              <UserRound aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>Cadastro profissional</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Revise seus dados públicos, especialidades e municípios atendidos.
              </p>
              <Button asChild variant="outline" className="mt-auto">
                <Link to="/profissional/perfil">Abrir meu perfil</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <ClipboardCheck aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>Análise e liberação</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Consulte o estado da análise e as orientações enviadas pela equipe.
              </p>
              <Button asChild variant="outline" className="mt-auto">
                <Link to="/profissional/analise">Ver análise</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CalendarClock aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>Atendimentos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Consulte seus compromissos e as ações disponíveis para cada estado.
              </p>
              <Button asChild variant="outline" className="mt-auto">
                <Link to="/profissional/atendimentos">Ver atendimentos</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <ProfessionalRegistrationSupport />
      </div>
    </ProfessionalLayout>
  )
}
