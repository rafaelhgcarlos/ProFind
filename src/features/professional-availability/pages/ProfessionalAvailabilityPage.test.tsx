import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { professionalAvailabilityService } from '../../../services/professional-availability.service'
import { ProfessionalAvailabilityPage } from './ProfessionalAvailabilityPage'

vi.mock('../../../services/professional-availability.service', () => ({
  professionalAvailabilityService: {
    loadDay: vi.fn(),
    saveDay: vi.fn(),
  },
}))

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

const availabilityMock = vi.mocked(professionalAvailabilityService)

describe('ProfessionalAvailabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    availabilityMock.loadDay.mockResolvedValue({
      serviceDate: '2026-11-03',
      periods: [
        { period: 'MORNING', available: true, reserved: true },
        { period: 'AFTERNOON', available: false, reserved: false },
        { period: 'EVENING', available: false, reserved: false },
      ],
    })
    availabilityMock.saveDay.mockResolvedValue({
      serviceDate: '2026-11-03',
      periods: [
        { period: 'MORNING', available: true, reserved: true },
        { period: 'AFTERNOON', available: true, reserved: false },
        { period: 'EVENING', available: false, reserved: false },
      ],
    })
  })

  it('preserva período reservado e salva a seleção editável da data', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/profissional/disponibilidade']}>
        <ProfessionalAvailabilityPage />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('Atendimento confirmado preservado'),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Manhã: disponível' })).toBeDisabled()

    await user.click(screen.getByRole('switch', { name: 'Tarde: disponível' }))
    await user.click(
      screen.getByRole('button', { name: 'Salvar disponibilidade' }),
    )

    await waitFor(() =>
      expect(availabilityMock.saveDay).toHaveBeenCalledWith(
        expect.any(String),
        { MORNING: true, AFTERNOON: true, EVENING: false },
      ),
    )
    expect(await screen.findByText('Disponibilidade salva')).toBeInTheDocument()
  })
})
