import { Activity, BookOpenText, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useAuth } from '../../auth/use-auth'

const areas = [
  {
    title: 'Análise de profissionais',
    description:
      'Revise cadastros, solicite ajustes e gerencie a aprovação dos profissionais.',
    icon: ClipboardCheck,
    status: 'Disponível',
    href: '/admin/profissionais',
  },
  {
    title: 'Catálogo de serviços',
    description:
      'Consulte e organize as categorias e especialidades disponíveis na plataforma.',
    icon: BookOpenText,
    status: 'Em breve',
    href: null,
  },
  {
    title: 'Acompanhamento operacional',
    description:
      'Acompanhe solicitações, atendimentos, cancelamentos e substituições.',
    icon: Activity,
    status: 'Em breve',
    href: null,
  },
] as const

export function AdminDashboardPage() {
  useDocumentTitle('Administração — ProFind')
  const { user } = useAuth()
  const userName = user?.displayName || user?.email || 'Administrador ProFind'

  return (
    <AdminLayout pageTitle="Visão geral" userName={userName} activeNavigationHref="/admin">
      <div className="grid gap-6">
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Bem-vindo à administração</AlertTitle>
          <AlertDescription>
            Acompanhe os cadastros de profissionais e a organização dos atendimentos.
          </AlertDescription>
        </Alert>

        <section aria-labelledby="admin-areas-title">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">Administração</p>
            <h2 id="admin-areas-title" className="mt-1 text-2xl font-bold tracking-tight">
              Central de administração
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Acesse as ferramentas disponíveis e acompanhe as próximas áreas do painel.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {areas.map((area) => {
              const Icon = area.icon
              return (
                <Card key={area.title} aria-disabled={area.href ? undefined : true} className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <Badge variant="outline">{area.status}</Badge>
                    </div>
                    <CardTitle className="pt-3">{area.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">{area.description}</p>
                    {area.href ? (
                      <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary hover:underline" to={area.href}>
                        Abrir análise
                      </Link>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}
