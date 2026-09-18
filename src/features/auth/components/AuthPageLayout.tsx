import { ArrowLeft, LockKeyhole } from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AppShell } from '../../../components/layout/AppShell'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import { PrivacyNotice } from '../../../components/ui/privacy-notice'

interface AuthPageLayoutProps extends PropsWithChildren {
  badge: string
  title: string
  description: string
  cardTitle: string
  cardDescription: string
  footer?: ReactNode
}

export function AuthPageLayout({
  badge,
  title,
  description,
  cardTitle,
  cardDescription,
  children,
  footer,
}: AuthPageLayoutProps) {
  return (
    <AppShell>
      <section className="mx-auto grid min-h-[calc(100dvh-var(--app-header-height)-9rem)] max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
        <div className="mx-auto w-full max-w-xl lg:mx-0">
          <Button variant="link" asChild>
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Voltar para o início
            </Link>
          </Button>
          <div className="mt-7">
            <Badge variant="secondary">
              <LockKeyhole aria-hidden="true" className="size-3.5" />
              {badge}
            </Badge>
            <h1 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-balance sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
              {description}
            </p>
          </div>
          <Card className="mt-8 border-border/80 bg-surface-raised">
            <CardHeader className="pb-4">
              <h2 className="text-lg font-bold tracking-tight">{cardTitle}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{cardDescription}</p>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
        <aside className="border-t pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <p className="text-sm font-semibold text-primary">Acesso protegido</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Sua conta continua sendo só sua.
          </h2>
          <PrivacyNotice className="mt-6" title="Privacidade e segurança">
            Sua senha é processada pelo Firebase Authentication e nunca é armazenada no perfil público do ProFind.
          </PrivacyNotice>
        </aside>
      </section>
    </AppShell>
  )
}
