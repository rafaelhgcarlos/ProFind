import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LayoutGrid,
  MapPin,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import type { CatalogCategory, CatalogSpecialty } from '../../../types/catalog'
import { cn } from '../../../utils/cn'
import { useCatalog } from '../../home/use-catalog'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'

function normalizedSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

function catalogGroups(
  categories: CatalogCategory[],
  specialties: CatalogSpecialty[],
  search: string,
) {
  const query = normalizedSearch(search)

  return categories
    .map((category) => {
      const categoryMatches = normalizedSearch(category.name).includes(query)
      const matches = specialties.filter(
        (specialty) =>
          specialty.categoryId === category.id &&
          (!query ||
            categoryMatches ||
            normalizedSearch(specialty.name).includes(query)),
      )
      return { category, specialties: matches }
    })
    .filter(({ specialties }) => specialties.length > 0)
}

export function ClientHomePage() {
  useDocumentTitle('Início do cliente — ProFind')
  const { profile } = useProfile()
  const location = useLocation()
  const catalogState = useCatalog()
  const searchInput = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] =
    useState<CatalogSpecialty | null>(null)

  const groups = useMemo(
    () =>
      catalogState.status === 'ready'
        ? catalogGroups(
            catalogState.catalog.categories,
            catalogState.catalog.specialties,
            search,
          )
        : [],
    [catalogState, search],
  )

  function focusCatalog() {
    document.getElementById('catalogo-servicos')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    searchInput.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (location.hash === '#catalogo-servicos') {
      document.getElementById('catalogo-servicos')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      searchInput.current?.focus({ preventScroll: true })
      return
    }
    if (location.hash === '#solicitacoes') {
      document.getElementById('solicitacoes')?.scrollIntoView({
        block: 'start',
      })
    }
  }, [location.hash])

  return (
    <ClientLayout
      pageTitle="Início"
      userName={profile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      <div className="mx-auto grid min-w-0 max-w-6xl gap-8">
        <section className="relative isolate overflow-hidden rounded-xl border bg-brand-panel px-5 py-5 text-brand-panel-foreground shadow-soft sm:px-8 sm:py-6">
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-20 size-64 rounded-full border border-brand-panel-foreground/15"
          />
          <div
            aria-hidden="true"
            className="absolute -right-6 -bottom-36 size-72 rounded-full border border-brand-panel-foreground/10"
          />
          <div className="relative max-w-3xl">
            <Badge className="border-brand-panel-foreground/15 bg-brand-panel-foreground/10 text-brand-panel-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Serviços coordenados pelo ProFind
            </Badge>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-balance sm:text-3xl">
              Olá, {profile?.name?.split(' ')[0] || 'cliente'}. De qual serviço
              você precisa?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-panel-foreground/80 sm:text-base">
              Escolha uma especialidade para começar.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={focusCatalog}
              >
                Solicitar serviço
                <ArrowRight aria-hidden="true" />
              </Button>
              <p className="text-xs leading-5 text-brand-panel-foreground/70">
                Em breve você poderá solicitar serviços por aqui.
              </p>
            </div>
          </div>
        </section>

        <section
          id="catalogo-servicos"
          aria-labelledby="catalogo-servicos-title"
          className="scroll-mt-24"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 max-w-2xl">
              <p className="text-sm font-semibold text-primary">
                Catálogo de serviços
              </p>
              <h2
                id="catalogo-servicos-title"
                className="mt-1 text-2xl font-bold tracking-tight"
              >
                Qual serviço você precisa?
              </h2>
              <p className="mt-2 leading-6 text-muted-foreground">
                Escolha o serviço que você precisa.
              </p>
            </div>
            <div className="w-full min-w-0 sm:max-w-sm">
              <Label htmlFor="client-service-search" className="sr-only">
                Filtrar categorias e especialidades
              </Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchInput}
                  id="client-service-search"
                  type="search"
                  value={search}
                  placeholder="Ex.: eletricista ou diarista"
                  className="pl-10"
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setSelectedSpecialty(null)
                  }}
                />
              </div>
            </div>
          </div>

          {catalogState.status === 'loading' ? (
            <div
              role="status"
              aria-label="Carregando catálogo de serviços"
              className="mt-6 grid gap-4 md:grid-cols-2"
            >
              <Skeleton className="h-56" />
              <Skeleton className="h-56" />
            </div>
          ) : null}

          {catalogState.status === 'error' ? (
            <Alert variant="destructive" className="mt-6">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Catálogo indisponível</AlertTitle>
              <AlertDescription>
                <p>{catalogState.error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={catalogState.retry}
                >
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {catalogState.status === 'ready' && groups.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<LayoutGrid aria-hidden="true" />}
              title={
                search
                  ? 'Nenhum serviço encontrado'
                  : 'Nenhum serviço disponível'
              }
              description={
                search
                  ? 'Revise o termo ou limpe o campo para ver todo o catálogo.'
                  : 'O catálogo ainda não possui especialidades ativas.'
              }
              action={
                search ? (
                  <Button type="button" variant="outline" onClick={() => setSearch('')}>
                    Limpar filtro
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {catalogState.status === 'ready' && groups.length > 0 ? (
            <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-2">
              {groups.map(({ category, specialties }) => (
                <Card key={category.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                        <Wrench aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="break-words">
                          {category.name}
                        </CardTitle>
                        <CardDescription>
                          Escolha uma especialidade
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid min-w-0 gap-2 sm:grid-cols-2">
                    {specialties.map((specialty) => {
                      const selected = selectedSpecialty?.id === specialty.id
                      return (
                        <button
                          key={specialty.id}
                          type="button"
                          aria-pressed={selected}
                          className={cn(
                            'flex min-h-12 min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm font-medium break-words transition-colors hover:border-primary/55 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                            selected && 'border-primary bg-accent text-accent-foreground',
                          )}
                          onClick={() => setSelectedSpecialty(specialty)}
                        >
                          <span className="min-w-0 flex-1 break-words">
                            {specialty.name}
                          </span>
                          {selected ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="size-4 shrink-0 text-primary"
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {selectedSpecialty ? (
            <Alert className="mt-6" aria-live="polite">
              <Clock3 aria-hidden="true" />
              <AlertTitle>{selectedSpecialty.name} selecionado</AlertTitle>
              <AlertDescription>
                <p>
                  Em breve você poderá continuar e informar o local, a data e o
                  período do atendimento.
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  disabled
                  aria-describedby="client-request-pending"
                >
                  Continuar para a solicitação
                </Button>
                <p
                  id="client-request-pending"
                  className="mt-2 text-xs text-muted-foreground"
                >
                  Disponível em breve.
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section
          id="solicitacoes"
          aria-labelledby="client-requests-title"
          className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)]"
        >
          <Card className="min-w-0">
            <CardHeader>
              <Badge variant="outline" className="w-fit">
                Em breve
              </Badge>
              <CardTitle id="client-requests-title">
                Solicitações e acompanhamento
              </CardTitle>
              <CardDescription>
                Em breve você poderá acompanhar suas solicitações por aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                Seus pedidos em andamento aparecerão primeiro, com o status e
                as próximas orientações.
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0 bg-surface-tint">
            <CardHeader>
              <CardTitle className="text-base">Como funcionará</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-4 text-sm leading-6">
                <li className="flex gap-3">
                  <Wrench className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Escolha uma especialidade do catálogo.</span>
                </li>
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Informe o endereço somente na solicitação.</span>
                </li>
                <li className="flex gap-3">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Acompanhe a procura sem promessa de atendimento.</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </section>
      </div>
    </ClientLayout>
  )
}
