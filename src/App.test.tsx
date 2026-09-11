import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './providers/theme-provider'
import { AppRouter } from './routes/AppRouter'

function renderRoute(path: string) {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRouter />
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

describe('AppRouter', () => {
  it('renderiza a página inicial', () => {
    renderRoute('/')

    expect(
      screen.getByRole('heading', {
        name: /encontre o profissional certo para cada necessidade/i,
      }),
    ).toBeInTheDocument()
  })

  it('renderiza a página de rota inexistente', () => {
    renderRoute('/nao-existe')

    expect(
      screen.getByRole('heading', { name: /página não encontrada/i }),
    ).toBeInTheDocument()
  })

  it('renderiza o catálogo do design system', async () => {
    renderRoute('/design-system')

    expect(
      await screen.findByRole('heading', { name: /componentes profind/i }),
    ).toBeInTheDocument()
  })
})
