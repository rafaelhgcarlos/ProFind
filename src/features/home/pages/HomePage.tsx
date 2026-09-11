import { AppShell } from '../../../components/layout/AppShell'
import { FeatureCard } from '../../../components/ui/FeatureCard'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { projectService } from '../../../services/project.service'

export function HomePage() {
  useDocumentTitle('ProFind — encontre profissionais')
  const benefits = projectService.listBenefits()

  return (
    <AppShell>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-28">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">
            Serviços perto de você
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Encontre o profissional certo para cada necessidade.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            Compare opções, converse com profissionais e contrate com mais
            confiança — tudo em um só lugar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              className="rounded-xl bg-teal-700 px-5 py-3 text-center font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              href="#beneficios"
            >
              Conhecer o ProFind
            </a>
            <span className="self-center text-sm text-slate-500">
              Experiência otimizada para celular
            </span>
          </div>
        </div>

        <div
          className="rounded-3xl bg-gradient-to-br from-teal-700 to-cyan-700 p-7 text-white shadow-xl shadow-teal-900/10 sm:p-9"
          aria-label="Exemplo de busca"
        >
          <p className="text-sm font-semibold text-teal-100">O que você precisa?</p>
          <div className="mt-3 rounded-xl bg-white px-4 py-3 font-medium text-slate-500 shadow-inner">
            Eletricista, diarista, encanador…
          </div>
          <p className="mt-6 text-3xl font-black">Simples. Local. Confiável.</p>
          <p className="mt-2 text-sm leading-6 text-teal-50">
            A base está pronta para receber os próximos fluxos do produto.
          </p>
        </div>
      </section>

      <section
        id="beneficios"
        className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <FeatureCard key={benefit.title} {...benefit} />
          ))}
        </div>
      </section>
    </AppShell>
  )
}
