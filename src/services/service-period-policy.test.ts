import { describe, expect, it } from 'vitest'

import {
  ACCEPTANCE_CUTOFF_MINUTES,
  getServicePeriodWindow,
  getServiceRequestSchedulingWindow,
  serviceSlotId,
  SERVICE_TIME_ZONE,
} from './service-period-policy'

describe('service period policy', () => {
  it('centraliza os períodos no fuso de São Paulo e o limite de aceite', () => {
    const window = getServicePeriodWindow('2026-11-05', 'MORNING')

    expect(SERVICE_TIME_ZONE).toBe('America/Sao_Paulo')
    expect(ACCEPTANCE_CUTOFF_MINUTES).toBe(30)
    expect(window.startsAt.toISOString()).toBe('2026-11-05T11:00:00.000Z')
    expect(window.endsAt.toISOString()).toBe('2026-11-05T15:00:00.000Z')
    expect(window.acceptUntil.toISOString()).toBe('2026-11-05T10:30:00.000Z')
    expect(serviceSlotId('2026-11-05', 'MORNING')).toBe(
      '2026-11-05_MORNING',
    )
  })

  it.each(['2026-02-30', '05/11/2026', ''])('rejeita data inválida: %s', (date) => {
    expect(() => getServicePeriodWindow(date, 'AFTERNOON')).toThrow(
      'Data de atendimento inválida.',
    )
  })

  it('rejeita período depois do corte e datas além de 90 dias', () => {
    expect(() =>
      getServiceRequestSchedulingWindow(
        '2026-11-05',
        'MORNING',
        new Date('2026-11-05T10:30:00.000Z'),
      ),
    ).toThrow('pelo menos 30 minutos')

    expect(() =>
      getServiceRequestSchedulingWindow(
        '2027-02-10',
        'MORNING',
        new Date('2026-11-05T09:00:00.000Z'),
      ),
    ).toThrow('próximos 90 dias')
  })
})
