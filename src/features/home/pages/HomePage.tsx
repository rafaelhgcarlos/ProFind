import { ArrowRight, BadgeCheck, Check, CircleAlert, LayoutGrid, LockKeyhole, MapPin, ShieldCheck, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { FeatureCard } from '../../../components/ui/FeatureCard'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { EmptyState } from '../../../components/ui/empty-state'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { CategoryTile } from '../components/CategoryTile'
import { VisualSearch } from '../components/VisualSearch'
import { useCatalog } from '../use-catalog'

const availableSteps = [
  { icon: 'trust' as const, title: 'Crie sua conta', description: 'Cadastre-se com nome, e-mail e senha para ter uma identidade no ProFind.' },
  { icon: 'location' as const, title: 'Escolha seu caminho', description: 'Defina se quer contratar, oferecer serviços ou usar os dois modos.' },
  { icon: 'conversation' as const, title: 'Prepare sua jornada', description: 'Acesse sua área. As ferramentas de descoberta estão em desenvolvimento.' },
]

export function HomePage() {
  useDocumentTitle('ProFind — encontre profissionais')
  const [service, setService] = useState('')
  const catalogState = useCatalog()
  const specialtiesByCategory = useMemo(() => {
    const grouped = new Map<string, string[]>()

    for (const specialty of catalogState.catalog?.specialties ?? []) {
      const names = grouped.get(specialty.categoryId) ?? []
      names.push(specialty.name)
      grouped.set(specialty.categoryId, names)
    }

    return grouped
  }, [catalogState.catalog])
  const serviceOptions = Array.from(
    new Set(
      catalogState.catalog?.specialties.map((specialty) => specialty.name) ?? [],
    ),
  )

  return (
    <AppShell navigation={[{ label: 'Como funciona', href: '/#como-funciona' }]} showAccountLinks>
      <section className="overflow-hidden bg-surface-tint">
        <div className="mx-auto grid max-w-7xl gap-9 px-4 pt-12 pb-8 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.84fr)] lg:items-center lg:gap-16 lg:px-8 lg:pt-20 lg:pb-12">
          <div className="min-w-0">
            <Badge variant="secondary" className="gap-1.5"><MapPin className="size-3.5" aria-hidden="true" />Uma nova forma de conectar sua região</Badge>
            <h1 className="mt-6 max-w-3xl text-[clamp(2.45rem,7vw,4.7rem)] leading-[1.08] font-extrabold tracking-[-0.055em] text-balance">
              Encontre o profissional certo, <span className="text-primary">perto de você.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Compare avaliações, converse e contrate com segurança.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="w-full sm:w-auto" asChild><a href="#busca">Encontrar profissionais <ArrowRight aria-hidden="true" /></a></Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild><Link to="/cadastro">Quero oferecer meus serviços</Link></Button>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">A busca pública está em preparação. Você já pode criar sua conta e escolher seu modo de uso.</p>
          </div>
          <div className="relative isolate hidden min-h-[25rem] overflow-hidden rounded-xl bg-brand-panel p-7 text-brand-panel-foreground lg:block" aria-hidden="true">
            <div className="absolute -top-24 -right-18 size-64 rounded-full border border-brand-panel-foreground/20" />
            <div className="absolute -top-10 -right-3 size-64 rounded-full border border-brand-panel-foreground/20" />
            <div className="absolute -bottom-24 -left-24 size-72 rounded-full border border-brand-panel-foreground/15" />
            <p className="relative text-sm font-semibold tracking-wider">PROFIND / CONEXÕES LOCAIS</p>
            <div className="relative mt-14 space-y-7">
              <div className="flex items-center gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-panel-foreground text-brand-panel"><MapPin className="size-6" /></span><div><p className="text-xs text-brand-panel-foreground/75">01 / SUA REGIÃO</p><p className="mt-1 text-xl font-bold">Onde você está</p></div></div>
              <div className="ml-6 h-8 border-l-2 border-dashed border-brand-panel-foreground/45" />
              <div className="flex items-center gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Wrench className="size-6" /></span><div><p className="text-xs text-brand-panel-foreground/75">02 / SEU SERVIÇO</p><p className="mt-1 text-xl font-bold">O que você precisa</p></div></div>
              <div className="ml-6 h-8 border-l-2 border-dashed border-brand-panel-foreground/45" />
              <div className="flex items-center gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-panel-foreground text-brand-panel"><Check className="size-6" /></span><div><p className="text-xs text-brand-panel-foreground/75">03 / SUA ESCOLHA</p><p className="mt-1 text-xl font-bold">Mais contexto para decidir</p></div></div>
            </div>
          </div>
        </div>
        <div id="busca" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold tracking-tight">Comece pelo que você precisa</h2><span className="text-xs font-medium text-muted-foreground">Prévia da busca · integração em desenvolvimento</span></div>
          <VisualSearch serviceValue={service} serviceOptions={serviceOptions} onServiceChange={setService} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl"><p className="text-sm font-semibold text-primary">Categorias de serviços</p><h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Qual serviço faz falta hoje?</h2><p className="mt-3 leading-7 text-muted-foreground">Explore as categorias disponíveis e veja as especialidades oferecidas em cada uma.</p></div>
          <a href="#busca" className="inline-flex min-h-11 items-center gap-2 self-start rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline sm:self-auto">Voltar à busca <ArrowRight className="size-4" aria-hidden="true" /></a>
        </div>
        {catalogState.status === 'loading' ? (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4" role="status" aria-label="Carregando categorias">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-lg" />)}
          </div>
        ) : null}
        {catalogState.status === 'error' ? (
          <Alert variant="destructive" className="mt-8">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Catálogo indisponível</AlertTitle>
            <AlertDescription>
              <p>{catalogState.error}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={catalogState.retry}>Tentar novamente</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {catalogState.status === 'ready' && catalogState.catalog.categories.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<LayoutGrid aria-hidden="true" />}
            title="Nenhuma categoria disponível"
            description="O catálogo está sendo preparado. Tente novamente mais tarde."
          />
        ) : null}
        {catalogState.status === 'ready' && catalogState.catalog.categories.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {catalogState.catalog.categories.map((category) => (
              <CategoryTile
                key={category.id}
                name={category.name}
                description={specialtiesByCategory.get(category.id)?.join(' · ')}
                icon={Wrench}
                active={service === category.name}
                onSelect={() => {
                  setService(category.name)
                  document.getElementById('busca')?.scrollIntoView()
                }}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.75fr_1fr] lg:items-center lg:gap-20 lg:px-8">
          <div><Badge variant="secondary"><ShieldCheck className="size-3.5" aria-hidden="true" />Confiança em cada etapa</Badge><h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Uma escolha melhor começa com clareza.</h2><p className="mt-4 leading-7 text-muted-foreground">O ProFind está construindo uma experiência para aproximar necessidades e profissionais, com informações úteis para você decidir no seu tempo.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="border-t pt-5"><LockKeyhole className="size-6 text-primary" aria-hidden="true" /><h3 className="mt-4 font-bold">Sua conta é privada</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Seu acesso é protegido; seus dados de contato não viram um perfil público ao se cadastrar.</p></div>
            <div className="border-t pt-5"><BadgeCheck className="size-6 text-primary" aria-hidden="true" /><h3 className="mt-4 font-bold">Informação com contexto</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Avaliações e detalhes profissionais aparecerão apenas quando houver dados reais para mostrar.</p></div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="max-w-2xl"><p className="text-sm font-semibold text-primary">Como começar</p><h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Seu primeiro passo já está disponível.</h2><p className="mt-3 leading-7 text-muted-foreground">Uma conta para a jornada de Cliente, Profissional ou ambas.</p></div>
        <div className="mt-9 grid gap-8 sm:grid-cols-3">{availableSteps.map((step) => <FeatureCard key={step.title} {...step} />)}</div>
        <div className="mt-10"><Button size="lg" asChild><Link to="/cadastro">Criar minha conta <ArrowRight aria-hidden="true" /></Link></Button></div>
      </section>
    </AppShell>
  )
}
