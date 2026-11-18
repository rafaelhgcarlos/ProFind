import type { Firestore } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  openReport: vi.fn(),
  listOwnReports: vi.fn(),
  acknowledgeProposal: vi.fn(),
  listReports: vi.fn(),
  getAdminDetail: vi.fn(),
  reviewReport: vi.fn(),
  resolveReport: vi.fn(),
}))

vi.mock('../repositories/service-report.repository', () => ({
  createServiceReportRepository: () => repository,
}))

import { createServiceReportService } from './service-report.service'

function service(options?: { online?: boolean }) {
  return createServiceReportService({
    firestore: {} as Firestore,
    getActorId: () => 'client-1',
    isOnline: () => options?.online ?? true,
    now: () => new Date('2026-11-17T12:00:00.000Z'),
  })
}

describe('serviceReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('compartilha a mesma persistÃªncia em duplo clique e retry concorrente', async () => {
    let resolve!: (value: unknown) => void
    repository.openReport.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const reports = service()
    const input = {
      operationKey: 'report-operation-key-0001',
      requestId: 'request-1',
      reason: 'NO_SHOW' as const,
      description: 'O profissional nÃ£o compareceu no perÃ­odo combinado.',
    }

    const first = reports.openReport(input)
    const second = reports.openReport(input)
    expect(repository.openReport).toHaveBeenCalledOnce()

    resolve({ idempotent: false })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { idempotent: false },
      { idempotent: false },
    ])
  })

  it('libera a mesma chave para retry depois de falha sem alterar os dados', async () => {
    repository.openReport
      .mockRejectedValueOnce(new Error('indisponÃ­vel'))
      .mockResolvedValueOnce({ idempotent: false })
    const reports = service()
    const input = {
      operationKey: 'report-operation-key-0002',
      requestId: 'request-1',
      reason: 'SERVICE_PROBLEM' as const,
      description: 'O atendimento apresentou um problema que precisa de anÃ¡lise.',
    }

    await expect(reports.openReport(input)).rejects.toThrow()
    await expect(reports.openReport(input)).resolves.toEqual({ idempotent: false })
    expect(repository.openReport).toHaveBeenCalledTimes(2)
    expect(repository.openReport.mock.calls[0][0]).toEqual(repository.openReport.mock.calls[1][0])
  })

  it('bloqueia descriÃ§Ã£o invÃ¡lida e envio offline antes do repositÃ³rio', () => {
    const reports = service({ online: false })
    expect(() => reports.openReport({
      operationKey: 'report-operation-key-0003',
      requestId: 'request-1',
      reason: 'OTHER',
      description: 'curto',
    })).toThrow(/conecte-se/i)
    expect(repository.openReport).not.toHaveBeenCalled()
  })
})
