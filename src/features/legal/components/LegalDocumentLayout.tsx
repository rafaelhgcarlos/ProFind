import { ArrowLeft, FileCheck2, Scale } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'

interface LegalDocumentLayoutProps extends PropsWithChildren {
  title: string
  description: string
  version: string
  effectiveDate: string
  effectiveDateLabel: string
  alternativeDocument: {
    label: string
    href: string
  }
}

export function LegalDocumentLayout({
  title,
  description,
  version,
  effectiveDate,
  effectiveDateLabel,
  alternativeDocument,
  children,
}: LegalDocumentLayoutProps) {
  return (
    <AppShell>
      <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <Button variant="link" asChild>
          <Link to="/cadastro">
            <ArrowLeft aria-hidden="true" />
            Voltar ao cadastro
          </Link>
        </Button>

        <header className="mt-7 max-w-3xl">
          <Badge variant="secondary">
            <FileCheck2 aria-hidden="true" className="size-3.5" />
            Documento do MVP
          </Badge>
          <h1 className="mt-5 text-3xl font-black tracking-[-0.03em] text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{description}</p>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y py-4 text-sm">
            <div>
              <dt className="font-semibold text-muted-foreground">Versão</dt>
              <dd className="mt-1 font-bold">{version}</dd>
            </div>
            <div>
              <dt className="font-semibold text-muted-foreground">Vigência</dt>
              <dd className="mt-1 font-bold">
                <time dateTime={effectiveDate}>{effectiveDateLabel}</time>
              </dd>
            </div>
          </dl>
        </header>

        <Alert variant="warning" className="mt-8">
          <Scale aria-hidden="true" />
          <AlertTitle>Versão jurídica inicial</AlertTitle>
          <AlertDescription>
            Este documento foi estruturado para o MVP do ProFind e deve passar
            por revisão jurídica antes da operação comercial em produção.
          </AlertDescription>
        </Alert>

        <div className="mt-10 space-y-10">{children}</div>

        <footer className="mt-12 border-t pt-8">
          <p className="text-sm leading-6 text-muted-foreground">
            Consulte também o documento complementar antes de concluir o cadastro.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to={alternativeDocument.href}>{alternativeDocument.label}</Link>
          </Button>
        </footer>
      </article>
    </AppShell>
  )
}
