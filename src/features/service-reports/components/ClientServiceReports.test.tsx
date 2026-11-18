import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reports = vi.hoisted(() => ({
  openReport: vi.fn(),
  listOwnReports: vi.fn(),
  acknowledgeProposal: vi.fn(),
}))

vi.mock('../../../services/service-report.service', () => ({
  serviceReportService: reports,
}))

import { ClientServiceReports } from './ClientServiceReports'

describe('ClientServiceReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reports.listOwnReports.mockResolvedValue([])
  })

  it('preserva motivo, descrição e chave idempotente quando a persistência falha', async () => {
    reports.openReport
      .mockRejectedValueOnce(new Error('Falha temporária.'))
      .mockResolvedValueOnce({ idempotent: false })
    const user = userEvent.setup()
    render(<ClientServiceReports requestId="request-1" />)

    await screen.findByText('Relatos deste pedido')
    await user.click(screen.getByRole('button', { name: 'Relatar problema' }))
    await user.selectOptions(screen.getByLabelText('Motivo'), 'SERVICE_PROBLEM')
    await user.type(
      screen.getByLabelText('Descrição curta'),
      'O serviço foi iniciado, mas houve um problema durante a execução.',
    )
    await user.click(screen.getByRole('button', { name: 'Enviar relato' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/campos foram preservados/i)
    expect(screen.getByLabelText('Motivo')).toHaveValue('SERVICE_PROBLEM')
    expect(screen.getByLabelText('Descrição curta')).toHaveValue(
      'O serviço foi iniciado, mas houve um problema durante a execução.',
    )
    const firstKey = reports.openReport.mock.calls[0][0].operationKey

    await user.click(screen.getByRole('button', { name: 'Enviar relato' }))
    expect(await screen.findByText('Relato enviado')).toBeInTheDocument()
    expect(reports.openReport.mock.calls[1][0].operationKey).toBe(firstKey)
  })
})
