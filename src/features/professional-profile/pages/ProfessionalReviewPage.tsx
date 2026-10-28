import { AlertTriangle, History } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ProfessionalLayout } from '../../../components/layout/ProfessionalLayout'
import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Skeleton } from '../../../components/ui/skeleton'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { loadProfessionalProfile } from '../../../services/professional-profile.service'
import { professionalReviewService } from '../../../services/professional-review.service'
import type { ProfessionalProfile } from '../../../types/professional-profile'
import type {
  ProfessionalOperationalReview,
  ProfessionalReviewEvent,
} from '../../../types/professional-review'
import { useAuth } from '../../auth/use-auth'
import { ModeSwitcher } from '../../onboarding/components/ModeSwitcher'
import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalRegistrationSupport } from '../components/ProfessionalRegistrationSupport'
import { ProfessionalReviewStatusCard } from '../components/ProfessionalReviewStatusCard'

const actionLabels: Record<ProfessionalReviewEvent['action'], string> = {
  PROFILE_UPDATED: 'Cadastro atualizado',
  PROFILE_SUBMITTED: 'Enviado para análise',
  PROFILE_RESUBMITTED: 'Enviado novamente',
  REANALYSIS_REQUIRED: 'Atualização enviada para análise',
  APPROVED: 'Cadastro aprovado',
  APPROVED_AND_ACTIVATED: 'Cadastro aprovado e ativado',
  CHANGES_REQUESTED: 'Ajustes solicitados',
  REJECTED: 'Cadastro rejeitado',
  SUSPENDED: 'Cadastro suspenso',
  ACTIVATED: 'Cadastro habilitado',
  DEACTIVATED: 'Cadastro desativado',
}

export function ProfessionalReviewPage() {
  useDocumentTitle('Análise profissional — ProFind')
  const { user } = useAuth()
  const { profile: userProfile } = useProfile()
  const [professionalProfile, setProfessionalProfile] =
    useState<ProfessionalProfile | null>(null)
  const [review, setReview] = useState<ProfessionalOperationalReview | null>(null)
  const [history, setHistory] = useState<ProfessionalReviewEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!user?.uid) return
    let active = true

    void Promise.all([
      loadProfessionalProfile(user.uid),
      professionalReviewService.findByProfessionalId(user.uid),
      professionalReviewService.listHistory(user.uid, 20),
    ])
      .then(([loadedProfile, loadedReview, loadedHistory]) => {
        if (!active) return
        setProfessionalProfile(loadedProfile)
        setReview(loadedReview)
        setHistory(loadedHistory)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o acompanhamento da análise.',
        )
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [attempt, user?.uid])

  const layout = (content: React.ReactNode) => (
    <ProfessionalLayout
      pageTitle="Análise"
      activeNavigationHref="/profissional/analise"
      userName={userProfile?.name}
      contextSwitcher={<ModeSwitcher />}
    >
      {content}
    </ProfessionalLayout>
  )

  if (loading) {
    return layout(
      <div role="status" className="mx-auto max-w-4xl space-y-4">
        <span className="sr-only">Carregando análise profissional…</span>
        <Skeleton className="h-48" />
        <Skeleton className="h-40" />
      </div>,
    )
  }

  if (loadError) {
    return layout(
      <Alert variant="destructive" className="mx-auto max-w-2xl">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Não foi possível carregar a análise</AlertTitle>
        <AlertDescription>
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setLoading(true)
              setLoadError(null)
              setAttempt((current) => current + 1)
            }}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>,
    )
  }

  return layout(
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Autocadastro profissional</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Acompanhe sua análise</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
          Veja o andamento do seu cadastro e as orientações da equipe.
        </p>
      </div>

      <ProfessionalReviewStatusCard
        review={review}
        profileExists={professionalProfile !== null}
      />

      <ProfessionalRegistrationSupport />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5" aria-hidden="true" />
            Histórico da análise
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              O histórico aparecerá depois do primeiro salvamento do cadastro.
            </p>
          ) : (
            <ol className="space-y-4">
              {history.map((event) => (
                <li key={event.eventId} className="border-l-2 border-primary/30 pl-4">
                  <p className="font-semibold">{actionLabels[event.action]}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.createdAt.toLocaleString('pt-BR')}
                  </p>
                  {event.reason ? (
                    <p className="mt-2 text-sm">{event.reason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

    </div>,
  )
}
