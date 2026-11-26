import { Activity, ArrowRight, BookOpenText, CalendarClock, ClipboardCheck, FileWarning } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { adminServiceRequestService } from '../../../services/admin-service-request.service'
import type { AdminRequestListItem } from '../../../types/admin-service-request'
import { useAuth } from '../../auth/use-auth'
import { useCatalog } from '../../home/use-catalog'

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
    title: 'Pedidos',
    description:
      'Acompanhe solicitações, atendimentos, cancelamentos e substituições.',
    icon: Activity,
    status: 'Disponível',
    href: '/admin/pedidos',
  },
  {
    title: 'Relatos',
    description:
      'Analise problemas informados por clientes e consulte as decisões anteriores.',
    icon: FileWarning,
    status: 'Disponível',
    href: '/admin/relatos',
  },
] as const

function PendingPreview() {
  const catalog = useCatalog()
  const [items, setItems] = useState<AdminRequestListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.resolve()
      .then(() => adminServiceRequestService.listRequests({ pending: 'ALL', pageSize: 3 }))
      .then(
        (page) => { if (active) setItems(page.items) },
        () => { if (active) setFailed(true) },
      )
    return () => { active = false }
  }, [attempt])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          Pedidos que precisam de atenção
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {failed ? (
          <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
            <p>Não foi possível abrir a prévia da fila.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { setFailed(false); setAttempt((value) => value + 1) }}>
              Tentar novamente
            </Button>
          </div>
        ) : !items ? (
          <div role="status" aria-label="Carregando pendências"><Skeleton className="h-14" /></div>
        ) : items.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {items.map(({ request, city, stateCode }) => (
              <li key={request.requestId}>
                <Link to={`/admin/pendencias/${encodeURIComponent(request.requestId)}`}
                  className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-4 py-3 text-sm wrap-anywhere hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  <span>
                    <strong className="block">
                      {catalog.status === 'ready' ? catalog.catalog.specialties.find((item) => item.id === request.specialtyId)?.name ?? 'Serviço solicitado' : 'Serviço solicitado'}
                    </strong>
                    <span className="text-muted-foreground">{city} — {stateCode}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma pendência na prévia. Consulte a fila para pesquisar por pedido ou situação.</p>
        )}
        <Button asChild className="justify-self-start">
          <Link to="/admin/pendencias">Abrir fila de pendências <ArrowRight aria-hidden="true" /></Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function AdminDashboardPage() {
  useDocumentTitle('Administração — ProFind')
  const { user } = useAuth()
  const userName = user?.displayName || user?.email || 'Administrador ProFind'

  return (
    <AdminLayout pageTitle="Visão geral" heading={{ title: 'Central de administração', description: 'Acompanhe pedidos e revise cadastros de profissionais.' }} userName={userName} activeNavigationHref="/admin">
      <div className="grid gap-6">
        {user?.uid ? <PendingPreview key={user.uid} /> : null}

        <section aria-labelledby="admin-areas-title">
          <h2 id="admin-areas-title" className="text-lg font-bold tracking-tight">Áreas do painel</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {areas.map((area) => {
              const Icon = area.icon
              return (
                <Card key={area.title} aria-disabled={area.href ? undefined : true} className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      {!area.href ? <Badge variant="outline">{area.status}</Badge> : null}
                    </div>
                    <CardTitle className="pt-3">{area.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">{area.description}</p>
                    {area.href ? (
                      <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary hover:underline" to={area.href}>
                        Abrir área
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
