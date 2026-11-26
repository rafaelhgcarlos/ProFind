import { SERVICE_PERIOD_DEFINITIONS, SERVICE_TIME_ZONE, serviceDateInTimeZone } from '../services/service-period-policy'
import type { ServicePeriod } from '../types/service-request'

// Calendar dates have no instant or time zone. UTC here keeps their date parts intact.
const fullDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' })
const compactDate = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
})
const timestamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: SERVICE_TIME_ZONE,
})

function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? date : null
}

export function formatCalendarDate(value: string, style: 'full' | 'short' = 'full') {
  const date = calendarDate(value)
  return date ? (style === 'full' ? fullDate : shortDate).format(date) : value || 'Não informada'
}

export function shiftCalendarDate(value: string, days: number) {
  const date = calendarDate(value)
  if (!date) return value
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formatCompactServiceDate(value: string, today = serviceDateInTimeZone()) {
  if (value === today) return 'Hoje'
  if (value === shiftCalendarDate(today, 1)) return 'Amanhã'
  const date = calendarDate(value)
  if (!date) return value || 'Não informada'
  const parts = compactDate.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value.replace(/\.$/, '') ?? ''
  const weekday = part('weekday')
  const year = value.slice(0, 4)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${part('day')} ${part('month')}${year === today.slice(0, 4) ? '' : ` ${year}`}`
}

export function formatServiceTimestamp(value?: Date | null) {
  return value && !Number.isNaN(value.getTime()) ? timestamp.format(value) : 'Não informado'
}

export function formatServiceHours(period: ServicePeriod) {
  const { startHour, endHour } = SERVICE_PERIOD_DEFINITIONS[period]
  return `${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00`
}
