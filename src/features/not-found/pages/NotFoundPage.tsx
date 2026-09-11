import { Link } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada — ProFind')

  return (
    <AppShell>
      <section className="mx-auto max-w-xl px-5 py-24 text-center sm:px-8">
        <p className="text-sm font-bold text-teal-700">ERRO 404</p>
        <h1 className="mt-3 text-3xl font-black">Página não encontrada</h1>
        <p className="mt-4 text-slate-600">
          O endereço acessado não existe ou foi movido.
        </p>
        <Link
          className="mt-8 inline-block rounded-xl bg-teal-700 px-5 py-3 font-bold text-white hover:bg-teal-800"
          to="/"
        >
          Voltar ao início
        </Link>
      </section>
    </AppShell>
  )
}
