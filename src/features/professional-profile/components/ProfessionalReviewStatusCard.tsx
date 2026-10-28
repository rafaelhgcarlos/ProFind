import { CircleAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

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
import type {
  ProfessionalOperationalReview,
  ProfessionalReviewStatus,
} from '../../../types/professional-review'

const statusContent: Record<
  ProfessionalReviewStatus,
  { label: string; description: string; variant: 'outline' | 'warning' | 'success' | 'destructive' }
> = {
  DRAFT: {
    label: 'Rascunho',
    description: 'Complete seu cadastro e envie para análise.',
    variant: 'outline',
  },
  UNDER_REVIEW: {
    label: 'Em análise',
    description: 'Seu cadastro está sendo analisado pela equipe.',
    variant: 'warning',
  },
  CHANGES_REQUESTED: {
    label: 'Ajustes solicitados',
    description: 'Revise os pontos indicados e envie novamente.',
    variant: 'warning',
  },
  APPROVED: {
    label: 'Cadastro aprovado — demonstração',
    description: 'Seu cadastro foi aprovado e aguarda ativação.',
    variant: 'success',
  },
  REJECTED: {
    label: 'Cadastro rejeitado',
    description: 'Confira a orientação da equipe e fale com o suporte se precisar.',
    variant: 'destructive',
  },
  SUSPENDED: {
    label: 'Cadastro suspenso',
    description: 'Confira a orientação da equipe e fale com o suporte se precisar.',
    variant: 'destructive',
  },
}

interface ProfessionalReviewStatusCardProps {
  review: ProfessionalOperationalReview | null
  profileExists: boolean
  detailsHref?: string
}

export function ProfessionalReviewStatusCard({
  review,
  profileExists,
  detailsHref,
}: ProfessionalReviewStatusCardProps) {
  if (!review) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {profileExists
              ? 'Cadastro ainda não enviado para análise'
              : 'Cadastro ainda não iniciado'}
          </CardTitle>
          <CardDescription>
            {profileExists
              ? 'Abra seu perfil, revise os dados e salve para continuar.'
              : 'Crie seu cadastro profissional usando esta conta.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/profissional/perfil">
              {profileExists ? 'Revisar cadastro' : 'Começar cadastro'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const content = statusContent[review.reviewStatus]
  const eligible =
    review.reviewStatus === 'APPROVED' &&
    review.active &&
    review.approvedVersion === review.profileVersion
  const description = eligible
    ? 'Seu cadastro está aprovado e habilitado para receber oportunidades.'
    : content.description

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Estado da análise</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant={content.variant}>{content.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {review.professionalFeedback ? (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Orientação da equipe</AlertTitle>
            <AlertDescription>{review.professionalFeedback}</AlertDescription>
          </Alert>
        ) : null}

        <Alert variant={eligible ? 'success' : 'warning'}>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>
            {eligible
              ? 'Você já pode receber oportunidades'
              : 'Você ainda não pode receber oportunidades'}
          </AlertTitle>
          <AlertDescription>
            {eligible
              ? 'Seu cadastro está aprovado e habilitado para receber oportunidades.'
              : 'Para receber oportunidades, seu cadastro precisa estar aprovado e ativo.'}
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          {['DRAFT', 'CHANGES_REQUESTED'].includes(review.reviewStatus) ? (
            <Button asChild>
              <Link to="/profissional/perfil">
                {review.reviewStatus === 'CHANGES_REQUESTED'
                  ? 'Corrigir e reenviar'
                  : 'Continuar cadastro'}
              </Link>
            </Button>
          ) : null}
          {detailsHref ? (
            <Button asChild variant="outline">
              <Link to={detailsHref}>Ver acompanhamento completo</Link>
            </Button>
          ) : null}
        </div>

        <details className="rounded-md border bg-muted/35 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25">
            Detalhes da análise
          </summary>
          <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
            <p>
              <span className="block text-xs text-muted-foreground">Versão do cadastro:</span>
              <strong>{review.profileVersion}</strong>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">Enviado para análise</span>
              <strong>{review.submittedVersion ?? '—'}</strong>
            </p>
            <p>
              <span className="block text-xs text-muted-foreground">Cadastro aprovado</span>
              <strong>{review.approvedVersion ?? '—'}</strong>
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
