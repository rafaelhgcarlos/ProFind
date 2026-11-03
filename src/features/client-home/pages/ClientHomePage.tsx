import {
  ArrowRight,
  BrickWall,
  ChefHat,
  CircleAlert,
  Leaf,
  LayoutGrid,
  PaintRoller,
  Search,
  Sparkles,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { ClientLayout } from '../../../components/layout/ClientLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
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

function specialtyIcon(specialtyName: string): LucideIcon {
  const name = normalizedSearch(specialtyName)

  if (name.includes('pedre') || name.includes('alven')) return BrickWall
  if (name.includes('pint')) return PaintRoller
  if (name.includes('eletri')) return Zap
  if (name.includes('encan') || name.includes('hidraul')) return Waves
  if (name.includes('diar') || name.includes('limpeza')) return Sparkles
  if (name.includes('jardin') || name.includes('paisag')) return Leaf
  if (name.includes('cozinh') || name.includes('chef')) return ChefHat
  return Wrench
}

function HomeIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 230"
      fill="none"
      className="pointer-events-none h-auto w-full max-w-[22rem] text-[#9ff0d3]"
    >
      <g
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M46 196h278" opacity=".28" />
        <path d="M82 112 169 42l87 70v84H82v-84Z" opacity=".95" />
        <path d="m65 124 104-84 104 84" />
        <path d="M116 196v-53h44v53M190 131h34v34h-34z" opacity=".85" />
        <path d="M161 143h-45M207 131v34M190 148h34" opacity=".55" />
        <path d="M275 196v-58" />
        <path d="M275 88c-26 0-45 20-45 44 0 13 10 23 24 23 8 0 15-4 21-11 6 7 13 11 22 11 14 0 24-10 24-23 0-24-20-44-46-44Z" />
        <path d="m275 139-18-18M275 127l15-16" opacity=".62" />
        <path d="M53 196c5-17 17-26 35-26M307 196c-3-14-12-21-26-21" opacity=".38" />
      </g>
      <circle cx="169" cy="91" r="10" fill="currentColor" opacity=".16" />
    </svg>
  )
}

function categoryName(
  categoryById: Map<string, CatalogCategory>,
  specialty: CatalogSpecialty,
) {
  return categoryById.get(specialty.categoryId)?.name ?? 'Serviço'
}

export function ClientHomePage() {
  useDocumentTitle('Início do cliente — ProFind')
  const { profile } = useProfile()
  const location = useLocation()
  const catalogState = useCatalog()
  const searchInput = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'cliente'

  const catalog = catalogState.status === 'ready' ? catalogState.catalog : null
  const categoryById = useMemo(
    () => new Map(catalog?.categories.map((category) => [category.id, category]) ?? []),
    [catalog],
  )
  const filterCategories = useMemo(() => {
    if (!catalog) return []
    const categoryIds = new Set(
      catalog.specialties.map((specialty) => specialty.categoryId),
    )
    return catalog.categories.filter((category) => categoryIds.has(category.id))
  }, [catalog])
  const filteredSpecialties = useMemo(() => {
    if (!catalog) return []
    const query = normalizedSearch(search)

    return catalog.specialties.filter((specialty) => {
      const matchesCategory =
        selectedCategoryId === 'all' || specialty.categoryId === selectedCategoryId
      const category = categoryById.get(specialty.categoryId)
      const matchesSearch =
        !query ||
        normalizedSearch(specialty.name).includes(query) ||
        normalizedSearch(category?.name ?? '').includes(query)
      return matchesCategory && matchesSearch
    })
  }, [catalog, categoryById, search, selectedCategoryId])
  const hasFilters = Boolean(search.trim()) || selectedCategoryId !== 'all'

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

  function clearFilters() {
    setSearch('')
    setSelectedCategoryId('all')
    searchInput.current?.focus()
  }

  return (
    <ClientLayout
      pageTitle="Início"
      userName={firstName}
      contextSwitcher={<ModeSwitcher />}
      contentClassName="max-w-none lg:px-8 xl:px-10"
    >
      <div className="grid min-w-0 gap-8 xl:gap-10">
        <section className="relative isolate overflow-hidden rounded-[1.25rem] border border-white/10 bg-brand-panel px-5 py-7 text-brand-panel-foreground shadow-soft sm:px-7 sm:py-8 lg:px-8">
          <div
            aria-hidden="true"
            className="absolute -top-24 -left-20 size-64 rounded-full border border-white/8"
          />
          <div className="relative grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 max-w-5xl">
              <p className="text-xs font-bold tracking-[0.18em] text-[#9ff0d3] uppercase">
                Do que você precisa?
              </p>
              <h2 className="mt-3 max-w-4xl text-3xl leading-[1.08] font-bold tracking-[-0.045em] text-balance sm:text-4xl lg:text-[2.65rem]">
                <span className="block">Olá, {firstName}.</span>
                <span className="block">Encontre o serviço para sua casa.</span>
              </h2>
              <p className="mt-3 text-sm leading-6 text-brand-panel-foreground/76 sm:text-base">
                Escolha uma especialidade para começar.
              </p>

              <div
                role="search"
                className="mt-7 flex max-w-4xl flex-col gap-3 md:flex-row md:items-stretch"
              >
                <div className="relative min-w-0 flex-1">
                  <Label htmlFor="client-service-search" className="sr-only">
                    Buscar no catálogo de serviços
                  </Label>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    ref={searchInput}
                    id="client-service-search"
                    type="search"
                    value={search}
                    placeholder="Buscar serviço, como eletricista ou diarista"
                    className="min-h-13 rounded-xl border-white/15 bg-background/96 pr-4 pl-12 text-foreground shadow-sm placeholder:text-muted-foreground"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Button
                  asChild
                  size="lg"
                  className="min-h-13 shrink-0 rounded-xl bg-[#9ff0d3] px-6 text-[#063c32] shadow-sm data-[disabled=false]:hover:bg-[#b5f6df] md:min-w-48"
                >
                  <Link to="/cliente/solicitar">
                    Solicitar serviço
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="hidden justify-end xl:flex">
              <HomeIllustration />
            </div>
          </div>
        </section>

        <section
          id="catalogo-servicos"
          aria-labelledby="catalogo-servicos-title"
          className="scroll-mt-24"
        >
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div className="min-w-0">
              <h2
                id="catalogo-servicos-title"
                className="text-2xl font-bold tracking-[-0.035em] sm:text-[1.75rem]"
              >
                Explore os serviços
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
                Selecione uma especialidade.
              </p>
            </div>

            {catalogState.status === 'ready' && filterCategories.length > 0 ? (
              <div
                aria-label="Filtrar serviços por categoria"
                className="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  aria-pressed={selectedCategoryId === 'all'}
                  className={cn(
                    'min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                    selectedCategoryId === 'all'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/45 hover:text-foreground',
                  )}
                  onClick={() => setSelectedCategoryId('all')}
                >
                  Todos
                </button>
                {filterCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selectedCategoryId === category.id}
                    className={cn(
                      'min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                      selectedCategoryId === category.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/45 hover:text-foreground',
                    )}
                    onClick={() => setSelectedCategoryId(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {catalogState.status === 'loading' ? (
            <div
              role="status"
              aria-label="Carregando catálogo de serviços"
              className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
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

          {catalogState.status === 'ready' && filteredSpecialties.length === 0 ? (
            <EmptyState
              className="mt-6 rounded-xl border bg-card shadow-soft"
              icon={<LayoutGrid aria-hidden="true" />}
              title={hasFilters ? 'Nenhum serviço encontrado' : 'Nenhum serviço disponível'}
              description={
                hasFilters
                  ? 'Tente outro termo ou limpe os filtros para ver todo o catálogo.'
                  : 'O catálogo ainda não possui especialidades ativas.'
              }
              action={
                hasFilters ? (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {catalogState.status === 'ready' && filteredSpecialties.length > 0 ? (
            <>
              <p className="sr-only" aria-live="polite">
                {filteredSpecialties.length}{' '}
                {filteredSpecialties.length === 1
                  ? 'especialidade encontrada'
                  : 'especialidades encontradas'}
              </p>
              <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {filteredSpecialties.map((specialty) => {
                  const Icon = specialtyIcon(specialty.name)
                  const parentCategoryName = categoryName(categoryById, specialty)
                  return (
                    <Link
                      key={`${specialty.categoryId}:${specialty.id}`}
                      to={`/cliente/solicitar?specialty=${encodeURIComponent(specialty.id)}`}
                      aria-label={`Solicitar ${specialty.name} — ${parentCategoryName}`}
                      className="group flex min-h-24 min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-card-foreground shadow-soft transition-[border-color,background-color,box-shadow] hover:border-primary/45 hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-accent">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-bold leading-5">
                          {specialty.name}
                        </span>
                        <span className="mt-0.5 block break-words text-xs leading-4 text-muted-foreground">
                          {parentCategoryName}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      />
                    </Link>
                  )
                })}
              </div>
            </>
          ) : null}
        </section>

        <section
          id="solicitacoes"
          aria-labelledby="client-how-it-works-title"
          className="scroll-mt-24 rounded-[1.25rem] border bg-card p-5 shadow-soft sm:p-6 lg:p-7"
        >
          <div className="grid gap-7 lg:grid-cols-[minmax(12rem,0.72fr)_repeat(3,minmax(0,1fr))] lg:items-start lg:gap-6">
            <div>
              <p className="text-xs font-bold tracking-[0.15em] text-primary uppercase">
                Uma solicitação simples
              </p>
              <h2
                id="client-how-it-works-title"
                className="mt-2 text-2xl font-bold tracking-[-0.035em]"
              >
                Como funciona
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Em breve: acompanhe seus pedidos por aqui.
              </p>
            </div>

            {[
              ['1', 'Escolha o serviço', 'Encontre a especialidade desejada.'],
              ['2', 'Informe os detalhes', 'Escolha local, data e período.'],
              ['3', 'Aguarde um profissional', 'O atendimento depende de um aceite.'],
            ].map(([number, title, description]) => (
              <div key={number} className="flex min-w-0 gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
                  {number}
                </span>
                <div className="min-w-0 pt-0.5">
                  <h3 className="break-words text-sm font-bold sm:text-base">
                    {title}
                  </h3>
                  <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ClientLayout>
  )
}
