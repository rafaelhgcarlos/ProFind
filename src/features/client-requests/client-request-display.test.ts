import { describe, expect, it } from 'vitest'

import type { ServiceRequestSummary } from '../../types/service-request'
import { clientRequestStatus, requestGuidance } from './client-request-display'

function request(
  status: ServiceRequestSummary['status'],
  reopenReason: ServiceRequestSummary['reopenReason'] = null,
): ServiceRequestSummary {
  return {
    requestId: 'request-1',
    operationKey: 'operation-key-0000000001',
    clientId: 'client-1',
    categoryId: 'maintenance',
    specialtyId: 'electrician',
    cityIbgeCode: '3509502',
    serviceDate: '2030-01-15',
    period: 'MORNING',
    periodStartAt: new Date('2030-01-15T11:00:00.000Z'),
    acceptUntil: new Date('2030-01-15T10:30:00.000Z'),
    status,
    round: reopenReason ? 2 : 1,
    currentRoundId: reopenReason ? 'round-2' : 'round-1',
    assignedProfessionalId: status === 'OPEN' ? null : 'professional-1',
    currentAssignmentId: status === 'OPEN' ? null : 'round-1',
    reopenReason,
    excludedProfessionalIds: [],
  }
}

describe('client request presentation', () => {
  it.each([
    ['OPEN', null, 'Procurando profissional'],
    ['OPEN', 'PROFESSIONAL_CANCELLATION', 'Procurando substituto'],
    ['ASSIGNED', null, 'Confirmado'],
    ['IN_PROGRESS', null, 'Em atendimento'],
    ['COMPLETED', null, 'Conclusão informada'],
    ['CANCELLED', null, 'Cancelado'],
  ] as const)('deriva %s sem criar estado de backend', (status, reopenReason, label) => {
    expect(clientRequestStatus(request(status, reopenReason))).toBe(label)
  })

  it('explica prazo encerrado sem afirmar falta de candidatos', () => {
    const guidance = requestGuidance(
      request('OPEN'),
      new Date('2030-01-15T11:00:00.000Z'),
    )
    expect(guidance).toContain('prazo para aceite encerrou')
    expect(guidance).toContain('ainda não tem atendimento confirmado')
    expect(guidance).not.toMatch(/candidato|ninguém/)
  })
})
