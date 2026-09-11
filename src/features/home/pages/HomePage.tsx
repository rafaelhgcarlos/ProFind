import {
  ArrowRight,
  BadgeCheck,
  LockKeyhole,
  MapPin,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

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
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link to="/cadastro">
                Criar minha conta
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
              <Link to="/entrar">Entrar</Link>
            </Button>
            <Button variant="link" asChild>
              <a href="#como-funciona">Entender como funciona</a>
            </Button>
          </div>
        </div>

        <aside
          className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-soft sm:p-8"
          aria-labelledby="home-trust-title"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-primary">Uma escolha com mais contexto</p>
          <h2 id="home-trust-title" className="mt-2 text-2xl font-black tracking-tight">
            O essencial para contratar com confiança.
          </h2>
          <ul className="mt-7 grid gap-5">
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <MapPin className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">Atendimento na sua região</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Veja primeiro quem atende perto de você.
                </p>
              </div>
            </li>
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <BadgeCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">Reputação em evidência</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Compare experiência e avaliações antes de escolher.
                </p>
              </div>
            </li>
            <li className="grid grid-cols-[auto_1fr] gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <MessagesSquare className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">Conversa antes da decisão</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Alinhe os detalhes sem perder o contexto do serviço.
                </p>
              </div>
            </li>
          </ul>
          <div className="mt-7 flex gap-2 border-t pt-5 text-sm leading-6 text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>Endereço e contato permanecem privados até serem necessários.</p>
          </div>
        </aside>
      </section>

      <section
        id="como-funciona"
        className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8"
      >
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">Como o ProFind ajuda</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Menos dúvida entre a necessidade e a escolha.
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            A experiência prioriza proximidade, conversa e informações úteis,
            sem expor seus dados antes da hora.
          </p>
        </div>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <FeatureCard key={benefit.title} {...benefit} />
          ))}
        </div>
      </section>
    </AppShell>
  )
}
