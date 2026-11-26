import { describe, expect, it } from 'vitest'

import { serviceDateInTimeZone } from '../services/service-period-policy'
import { formatCalendarDate, formatCompactServiceDate, formatServiceTimestamp, shiftCalendarDate } from './service-date-display'

describe('datas exibidas para atendimentos', () => {
  it('preserva a data do calendário e converte instantes para São Paulo', () => {
    expect(formatCalendarDate('2026-11-02')).toMatch(/segunda-feira.*novembro de 2026/)
    expect(formatServiceTimestamp(new Date('2026-11-02T01:15:00Z'))).toMatch(/1 de nov.*22:15/)
    expect(formatCalendarDate('2026-02-30')).toBe('2026-02-30')
  })

  it('usa o dia de São Paulo na virada do dia e do ano', () => {
    const beforeMidnight = serviceDateInTimeZone(new Date('2027-01-01T02:59:00Z'))
    const afterMidnight = serviceDateInTimeZone(new Date('2027-01-01T03:00:00Z'))
    expect(formatCompactServiceDate('2027-01-01', beforeMidnight)).toBe('Amanhã')
    expect(formatCompactServiceDate('2027-01-01', afterMidnight)).toBe('Hoje')
    expect(formatCompactServiceDate('2026-11-02', '2026-10-28')).toBe('Seg, 02 nov')
    expect(formatCompactServiceDate('2026-11-02', afterMidnight)).toBe('Seg, 02 nov 2026')
    expect(shiftCalendarDate('2028-02-28', 1)).toBe('2028-02-29')
  })
})
