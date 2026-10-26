import type { ServicePeriod } from '../types/service-request'

export const SERVICE_TIME_ZONE = 'America/Sao_Paulo'
export const ACCEPTANCE_CUTOFF_MINUTES = 30
export const MAX_SCHEDULING_HORIZON_DAYS = 90

export const SERVICE_PERIOD_DEFINITIONS: Record<
  ServicePeriod,
  { startHour: number; endHour: number; label: string }
> = {
  MORNING: { startHour: 8, endHour: 12, label: 'Manhã' },
  AFTERNOON: { startHour: 13, endHour: 17, label: 'Tarde' },
  EVENING: { startHour: 18, endHour: 22, label: 'Noite' },
}

const serviceDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

function dateParts(serviceDate: string) {
  const match = serviceDatePattern.exec(serviceDate)
  if (!match) throw new Error('Data de atendimento inválida.')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Data de atendimento inválida.')
  }

  return { year, month, day }
}

function timeZoneOffsetMilliseconds(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVICE_TIME_ZONE,
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const name = parts.find((part) => part.type === 'timeZoneName')?.value
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '')
  if (!match) throw new Error('Não foi possível resolver o fuso do atendimento.')

  const direction = match[1] === '+' ? 1 : -1
  return direction * (Number(match[2]) * 60 + Number(match[3])) * 60_000
}

function zonedDateTime(serviceDate: string, hour: number) {
  const { year, month, day } = dateParts(serviceDate)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour))
  const first = new Date(utcGuess.getTime() - timeZoneOffsetMilliseconds(utcGuess))
  const correctedOffset = timeZoneOffsetMilliseconds(first)
  return new Date(utcGuess.getTime() - correctedOffset)
}

export function getServicePeriodWindow(
  serviceDate: string,
  period: ServicePeriod,
) {
  const definition = SERVICE_PERIOD_DEFINITIONS[period]
  const startsAt = zonedDateTime(serviceDate, definition.startHour)
  const endsAt = zonedDateTime(serviceDate, definition.endHour)
  const acceptUntil = new Date(
    startsAt.getTime() - ACCEPTANCE_CUTOFF_MINUTES * 60_000,
  )

  return { startsAt, endsAt, acceptUntil }
}

export function serviceSlotId(serviceDate: string, period: ServicePeriod) {
  dateParts(serviceDate)
  return `${serviceDate}_${period}`
}

export function roundDocumentId(round: number) {
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new Error('Rodada inválida.')
  }
  return `round-${round}`
}

export function assignmentDocumentId(round: number) {
  return roundDocumentId(round)
}

export function assignmentEventId(round: number) {
  return `assigned-${roundDocumentId(round)}`
}

export function refusalEventId(round: number, professionalId: string) {
  return `refused-${roundDocumentId(round)}-${professionalId}`
}

export function cancellationEventId(round: number) {
  return `reopened-${roundDocumentId(round)}`
}

export function isAcceptanceAllowed(now: Date, acceptUntil: Date) {
  return now.getTime() < acceptUntil.getTime()
}

export function isProfessionalCancellationAllowed(
  now: Date,
  periodStartAt: Date,
) {
  return now.getTime() < periodStartAt.getTime()
}
