import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AppRouter } from './routes/AppRouter'

describe('AppRouter', () => {
  it('renderiza a página inicial', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', {
        name: /encontre o profissional certo para cada necessidade/i,
      }),
    ).toBeInTheDocument()
  })

  it('renderiza a página de rota inexistente', () => {
    render(
      <MemoryRouter initialEntries={['/nao-existe']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /página não encontrada/i }),
    ).toBeInTheDocument()
  })
})
