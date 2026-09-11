import { Link } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Button } from '../../../components/ui/button'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada — ProFind')

  return (
    <AppShell>
      <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <p className="text-sm font-bold text-primary">ERRO 404</p>
        <h1 className="mt-3 text-3xl font-black">Página não encontrada</h1>
        <p className="mt-4 text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
        <Button className="mt-8" asChild>
          <Link to="/">Voltar ao início</Link>
        </Button>
      </section>
    </AppShell>
  )
}
