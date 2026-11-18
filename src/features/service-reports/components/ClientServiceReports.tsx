import { AlertCircle, CheckCircle2, Flag, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { serviceReportService } from '../../../services/service-report.service'
import type {
  ServiceReport,
  ServiceReportReason,
} from '../../../types/service-report'
import { SERVICE_PERIOD_DEFINITIONS } from '../../../services/service-period-policy'

const REASON_LABELS: Record<ServiceReportReason, string> = {
  NO_SHOW: 'Profissional não compareceu',
  SERVICE_PROBLEM: 'Problema no atendimento',
  OTHER: 'Outro problema',
}

const STATUS_LABELS: Record<ServiceReport['status'], string> = {
  OPEN: 'Aberto',
  UNDER_REVIEW: 'Em análise',
  RESOLVED: 'Resolvido',
}

function operationKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00.000Z`),
  )
}

export function ClientServiceReports({
  requestId,
  onReportsChange,
}: {
  requestId: string
  onReportsChange?(reports: ServiceReport[]): void
}) {
  const operationKeyRef = useRef(operationKey())
  const [reports, setReports] = useState<ServiceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [reason, setReason] = useState<ServiceReportReason>('NO_SHOW')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setReports([])
      setLoading(true)
      setLoadError('')
    })
    let unsubscribe: () => void = () => undefined
    try {
      if (typeof serviceReportService.subscribeOwnReports !== 'function') {
        void serviceReportService.listOwnReports(requestId).then((nextReports) => {
          if (!active) return
          setReports(nextReports)
          onReportsChange?.(nextReports)
          setLoading(false)
        }, (error: unknown) => {
          if (!active) return
          setLoading(false)
          setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os relatos.')
        })
        return () => { active = false }
      }
      unsubscribe = serviceReportService.subscribeOwnReports({
        requestId,
        onReports(snapshot) {
          if (!active) return
          setReports(snapshot.reports)
          onReportsChange?.(snapshot.reports)
          setLoading(false)
          setLoadError('')
        },
        onError(error) {
          if (!active) return
          setLoading(false)
          setLoadError(error.message)
        },
      })
    } catch (error) {
      queueMicrotask(() => {
        if (!active) return
        setLoading(false)
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os relatos.')
      })
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [onReportsChange, requestId])

  async function submit() {
    setSubmitting(true)
    setSubmitError('')
    setSubmitted(false)
    try {
      await serviceReportService.openReport({
        operationKey: operationKeyRef.current,
        requestId,
        reason,
        description,
      })
      setSubmitted(true)
      setFormOpen(false)
      setDescription('')
      setReason('NO_SHOW')
      operationKeyRef.current = operationKey()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível enviar o relato.')
    } finally {
      setSubmitting(false)
    }
  }

  async function acknowledge(reportId: string) {
    setAcknowledgingId(reportId)
    setLoadError('')
    try {
      await serviceReportService.acknowledgeProposal(reportId)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível registrar sua ciência.')
    } finally {
      setAcknowledgingId(null)
    }
  }

  return (
    <section aria-labelledby="service-reports-title" className="rounded-lg border p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 id="service-reports-title" className="font-semibold">Relatos deste pedido</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Um relato não cancela o atendimento, não comprova falta e não suspende o profissional automaticamente.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            setFormOpen((value) => !value)
            setSubmitted(false)
          }}
        >
          <Flag aria-hidden="true" /> Relatar problema
        </Button>
      </div>

      {submitted ? (
        <Alert variant="success" className="mt-4">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Relato enviado</AlertTitle>
          <AlertDescription>O envio foi confirmado após a persistência. Acompanhe a resposta nesta tela.</AlertDescription>
        </Alert>
      ) : null}

      {formOpen ? (
        <div className="mt-4 grid gap-4 rounded-lg bg-surface-tint p-4">
          <div className="grid gap-2">
            <Label htmlFor="service-report-reason">Motivo</Label>
            <select
              id="service-report-reason"
              value={reason}
              className="min-h-10 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              onChange={(event) => setReason(event.target.value as ServiceReportReason)}
            >
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="service-report-description">Descrição curta</Label>
              <span className="text-xs text-muted-foreground">{description.length}/500</span>
            </div>
            <Textarea
              id="service-report-description"
              value={description}
              minLength={10}
              maxLength={500}
              rows={4}
              placeholder="Descreva objetivamente o que aconteceu."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {submitError ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Não foi possível enviar</AlertTitle>
              <AlertDescription>{submitError} Seus campos foram preservados.</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              loading={submitting}
              loadingLabel="Enviando…"
              disabled={description.trim().length < 10}
              onClick={() => void submit()}
            >
              Enviar relato
            </Button>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setFormOpen(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Carregando relatos…</p> : null}
      {loadError ? (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Não foi possível atualizar os relatos</AlertTitle>
          <AlertDescription>
            <p>{loadError}</p>
            <span className="mt-3 inline-flex items-center gap-2 text-sm">
              <RefreshCw aria-hidden="true" className="size-4" /> A conexão será retomada automaticamente.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && reports.length > 0 ? (
        <ol className="mt-4 grid gap-3">
          {reports.map((report) => {
            const needsAcknowledgement = Boolean(
              report.proposedServiceDate
              && report.proposedPeriod
              && report.clientAcknowledgedProposalRevision !== report.proposalRevision,
            )
            return (
              <li key={report.reportId} className="rounded-lg border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{REASON_LABELS[report.reason]}</strong>
                  <Badge variant={report.status === 'RESOLVED' ? 'success' : report.status === 'UNDER_REVIEW' ? 'warning' : 'outline'}>
                    {STATUS_LABELS[report.status]}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{report.description}</p>
                {report.proposedServiceDate && report.proposedPeriod ? (
                  <div className="mt-3 rounded-md bg-surface-tint p-3 text-sm">
                    <strong>Proposta de reagendamento</strong>
                    <p className="mt-1 text-muted-foreground">
                      {formatDate(report.proposedServiceDate)} · {SERVICE_PERIOD_DEFINITIONS[report.proposedPeriod].label}
                    </p>
                    {needsAcknowledgement ? (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3"
                        loading={acknowledgingId === report.reportId}
                        loadingLabel="Registrando…"
                        onClick={() => void acknowledge(report.reportId)}
                      >
                        Estou ciente e autorizo estas condições
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs font-medium text-success">Ciência registrada por você.</p>
                    )}
                  </div>
                ) : null}
                {report.resolutionJustification ? (
                  <div className="mt-3 border-t pt-3 text-sm">
                    <strong>Resposta da administração</strong>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.resolutionJustification}</p>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}
