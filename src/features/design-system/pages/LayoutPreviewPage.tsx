import { BriefcaseBusiness, Compass, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AdminLayout } from '../../../components/layout/AdminLayout'
import { ClientLayout } from '../../../components/layout/ClientLayout'
import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Button } from '../../../components/ui/button'
import { EmptyState } from '../../../components/ui/empty-state'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

type PreviewMode = 'client' | 'professional' | 'admin'

interface LayoutPreviewPageProps {
  mode: PreviewMode
}

const content = {
  client: {
    title: 'Início',
    activeNavigationHref: '/cliente',
    userName: 'Cliente ProFind',
    icon: Compass,
    emptyTitle: 'Layout do Cliente',
    description: 'Estrutura mobile-first preparada para priorizar busca, pedidos e conversas.',
  },
  professional: {
    title: 'Oportunidades',
    activeNavigationHref: '/profissional/oportunidades',
    userName: 'Profissional ProFind',
    icon: BriefcaseBusiness,
    emptyTitle: 'Layout do Profissional',
    description: 'A mesma linguagem visual, com navegação orientada às tarefas profissionais.',
  },
  admin: {
    title: 'Visão geral',
    activeNavigationHref: '/admin',
    userName: 'Admin ProFind',
    icon: ShieldCheck,
    emptyTitle: 'Estrutura administrativa',
    description: 'Base separada para administração, sem forçar a navegação do marketplace.',
  },
} as const

export function LayoutPreviewPage({ mode }: LayoutPreviewPageProps) {
  const preview = content[mode]
  const Icon = preview.icon
  useDocumentTitle(`${preview.emptyTitle} — ProFind`)

  const body = (
    <section className="flex min-h-[calc(100dvh-12rem)] items-center justify-center border-y">
      <EmptyState
        icon={<Icon />}
        title={preview.emptyTitle}
        description={preview.description}
        action={
          <Button variant="outline" asChild>
            <Link to="/design-system">Voltar ao design system</Link>
          </Button>
        }
      />
    </section>
  )

  if (mode === 'client') {
    return (
      <ClientLayout
        pageTitle={preview.title}
        userName={preview.userName}
        activeNavigationHref={preview.activeNavigationHref}
      >
        {body}
      </ClientLayout>
    )
  }

  if (mode === 'professional') {
    return (
      <ProfessionalLayout
        pageTitle={preview.title}
        userName={preview.userName}
        activeNavigationHref={preview.activeNavigationHref}
      >
        {body}
      </ProfessionalLayout>
    )
  }

  return (
    <AdminLayout
      pageTitle={preview.title}
      userName={preview.userName}
      activeNavigationHref={preview.activeNavigationHref}
    >
      {body}
    </AdminLayout>
  )
}
