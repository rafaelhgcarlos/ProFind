import { ArrowRight, CalendarClock, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Card } from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { Skeleton } from '../../../components/ui/skeleton'
import type { ProfessionalAppointmentsPageSnapshot } from '../../../repositories/service-request.repository'
import { serviceRequestService } from '../../../services/service-request.service'
import { ProfessionalAppointmentCard } from './ProfessionalAppointmentCard'

export function ProfessionalAgendaPreview({ specialtyNames, online, now }: {
  specialtyNames: Map<string, string>
  online: boolean
  now: number
}) {
  const [snapshot, setSnapshot] = useState<ProfessionalAppointmentsPageSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    function showError() {
      if (active) setFailed(true)
    }
    try {
      unsubscribe = serviceRequestService.subscribeProfessionalAppointments({
        pageSize: 12,
        onPage(page) {
          if (!active) return
          setSnapshot(page)
          setFailed(false)
        },
        onError: showError,
      })
    } catch {
      queueMicrotask(showError)
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [attempt])

  const activeAppointments = snapshot?.page.items
    .filter((item) => item.status !== 'COMPLETED')
    .sort((first, second) => first.periodStartAt.getTime() - second.periodStartAt.getTime()) ?? []
  const inProgress = activeAppointments.find((item) => item.status === 'IN_PROGRESS')
  const upcoming = activeAppointments.find((item) => item.periodStartAt.getTime() >= now)
  const appointment = inProgress ?? upcoming ?? activeAppointments[0]
  const stale = failed || !online || Boolean(snapshot?.fromCache)
  const title = !appointment || stale ? 'Sua agenda' : inProgress ? 'Atendimento em andamento'
    : snapshot?.page.nextCursor || !upcoming ? 'Atendimento na sua agenda' : 'Próximo atendimento'

  return (
    <section aria-labelledby="professional-agenda-title" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="professional-agenda-title" className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        <Button asChild variant="outline" size="sm">
          <Link to="/profissional/atendimentos">Ver agenda <ArrowRight aria-hidden="true" /></Link>
        </Button>
      </div>
      {stale ? (
        <Alert variant="warning">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Agenda sem atualização</AlertTitle>
          <AlertDescription>
            <p>{failed ? 'Tente carregar a agenda novamente. Os dados exibidos podem estar desatualizados.' : 'Os dados salvos podem estar desatualizados. Confira a agenda quando a conexão voltar.'}</p>
            {failed ? <Button size="sm" variant="outline" className="mt-3" onClick={() => { setFailed(false); setAttempt((value) => value + 1) }}>Tentar novamente</Button> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {!snapshot && !failed ? (
        <div role="status" aria-label="Carregando sua agenda"><Skeleton className="h-36" /></div>
      ) : appointment ? (
        <ProfessionalAppointmentCard appointment={appointment} specialtyName={specialtyNames.get(appointment.specialtyId) ?? 'Serviço profissional'} stale={stale} />
      ) : !stale && snapshot ? (
        <Card>
          <EmptyState
            icon={<CalendarClock aria-hidden="true" />}
            title={snapshot.page.nextCursor ? 'Consulte sua agenda' : 'Nenhum atendimento em aberto'}
            description={snapshot.page.nextCursor ? 'Abra a lista para consultar os demais atendimentos.' : 'Novos compromissos aparecem aqui após a confirmação do aceite.'}
            className="py-5 sm:py-5"
          />
        </Card>
      ) : null}
    </section>
  )
}
