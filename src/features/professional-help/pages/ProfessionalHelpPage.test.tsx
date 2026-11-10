import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useProfile } from '../../onboarding/use-profile'
import { ProfessionalHelpPage } from './ProfessionalHelpPage'

vi.mock('../../../components/layout/ProfessionalLayout', () => ({
  ProfessionalLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../onboarding/use-profile', () => ({ useProfile: vi.fn() }))

vi.mock('../../professional-profile/components/ProfessionalRegistrationSupport', () => ({
  ProfessionalRegistrationSupport: () => <section>Canal de suporte</section>,
}))

describe('ProfessionalHelpPage', () => {
  it('oferece destinos reais para cadastro, análise, atendimentos e suporte', () => {
    vi.mocked(useProfile).mockReturnValue({
      profile: { name: 'Marina Souza' },
    } as ReturnType<typeof useProfile>)

    render(
      <MemoryRouter initialEntries={['/profissional/ajuda']}>
        <ProfessionalHelpPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'Como podemos ajudar?' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Abrir meu perfil' })).toHaveAttribute(
      'href',
      '/profissional/perfil',
    )
    expect(screen.getByRole('link', { name: 'Ver análise' })).toHaveAttribute(
      'href',
      '/profissional/analise',
    )
    expect(screen.getByRole('link', { name: 'Ver atendimentos' })).toHaveAttribute(
      'href',
      '/profissional/atendimentos',
    )
    expect(screen.getByText('Canal de suporte')).toBeVisible()
  })
})
