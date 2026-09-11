import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ThemeProvider } from '../../providers/theme-provider'
import { PublicLayout } from './PublicLayout'

describe('PublicLayout', () => {
  it('mantém apenas o controle de tema quando não há opções de navegação', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <PublicLayout>Conteúdo</PublicLayout>
        </MemoryRouter>
      </ThemeProvider>,
    )

    expect(screen.getByRole('button', { name: /Tema atual:/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('mantém a navegação opcional pronta para evoluir', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <PublicLayout navigation={[{ label: 'Seção atual', href: '/secao' }]}>Conteúdo</PublicLayout>
        </MemoryRouter>
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))

    expect(
      await screen.findByRole('heading', { name: 'Navegação' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Acesse as opções disponíveis no ProFind.'),
    ).toBeInTheDocument()

    const navigation = screen.getByRole('navigation', {
      name: 'Navegação mobile',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Seção atual' }),
    ).toHaveAttribute('href', '/secao')
    expect(screen.getByText('Escolha com confiança')).toBeInTheDocument()
  })
})
