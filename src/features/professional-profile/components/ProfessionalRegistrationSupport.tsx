import { CircleHelp, ExternalLink } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { professionalSupportUrl } from '../../../config/professional-support'
import { cn } from '../../../utils/cn'

interface ProfessionalRegistrationSupportProps {
  className?: string
}

export function ProfessionalRegistrationSupport({
  className,
}: ProfessionalRegistrationSupportProps) {
  const supportUrl = professionalSupportUrl()

  return (
    <section
      aria-labelledby="professional-registration-support-title"
      className={cn('rounded-lg border bg-card p-4', className)}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <CircleHelp className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="professional-registration-support-title"
            className="font-semibold"
          >
            Precisa de ajuda para se cadastrar?
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            O suporte orienta o preenchimento, mas nunca pede senha, documentos
            pessoais ou acesso à sua conta.
          </p>
          {supportUrl ? (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <a href={supportUrl} target="_blank" rel="noreferrer">
                Falar com o suporte pelo WhatsApp
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          ) : (
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              O canal de suporte não está configurado neste ambiente.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
