import { ArrowRight, Search, ShieldCheck } from 'lucide-react'

import { AppShell } from '../../../components/layout/AppShell'
import { FeatureCard } from '../../../components/ui/FeatureCard'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { projectService } from '../../../services/project.service'

export function HomePage() {
  useDocumentTitle('ProFind — encontre profissionais')
  const benefits = projectService.listBenefits()

  return (
    <AppShell>
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:py-28">
        <div>
          <Badge variant="secondary">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Serviços perto de você
          </Badge>
          <h1 className="mt-6 max-w-2xl text-4xl font-black tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
            Encontre o profissional certo para cada necessidade.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Compare opções, converse com profissionais e contrate com mais
            confiança — tudo em um só lugar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <a href="#beneficios">
                Conhecer o ProFind
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <span className="self-center text-sm text-muted-foreground">
              Experiência otimizada para celular
            </span>
          </div>
        </div>

        <div className="relative rounded-xl border bg-card p-6 shadow-soft sm:p-8" aria-label="Exemplo de busca">
          <p className="text-sm font-semibold text-muted-foreground">O que você precisa?</p>
          <div className="mt-3 flex min-h-12 items-center gap-3 rounded-md border border-input bg-background px-4 text-muted-foreground">
            <Search className="size-5 shrink-0" aria-hidden="true" />
            <span>Eletricista, diarista, encanador…</span>
          </div>
          <p className="mt-7 text-2xl font-black tracking-tight">Simples. Local. Confiável.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A base está pronta para receber os próximos fluxos do produto.
          </p>
          <div className="mt-7 h-1.5 w-24 rounded-full bg-primary" aria-hidden="true" />
        </div>
      </section>

      <section
        id="beneficios"
        className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8"
      >
        <div className="grid gap-8 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <FeatureCard key={benefit.title} {...benefit} />
          ))}
        </div>
      </section>
    </AppShell>
  )
}
