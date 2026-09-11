import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    expect(
      screen.getByRole('link', { name: /criar minha conta/i }),
    ).toHaveAttribute('href', '/cadastro')
    expect(screen.getByText(/permanecem privados/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /design system/i }),
    ).not.toBeInTheDocument()
  })

  it('renderiza o cadastro com os campos obrigatórios', async () => {
    renderRoute('/cadastro')

    expect(
      await screen.findByRole('heading', { name: /crie sua conta no profind/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/nome completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^e-mail$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirmar senha/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Termos de Uso' }),
    ).toHaveAttribute('href', '/termos-de-uso')
    expect(
      screen.getByRole('link', { name: 'Política de Privacidade' }),
    ).toHaveAttribute('href', '/politica-de-privacidade')
  })

  it('preserva o rascunho em memória durante a consulta aos termos', async () => {
    const user = userEvent.setup()
    renderRoute('/cadastro')

    await user.type(
      await screen.findByLabelText(/nome completo/i),
      'Marina Souza',
    )
    await user.type(screen.getByLabelText(/^senha$/i), 'senha-segura')
    await user.click(screen.getByRole('link', { name: 'Termos de Uso' }))

    expect(
      await screen.findByRole('heading', { name: 'Termos de Uso' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1. Aceitação e escopo')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Voltar ao cadastro' }))

    expect(await screen.findByLabelText(/nome completo/i)).toHaveValue(
      'Marina Souza',
    )
    expect(screen.getByLabelText(/^senha$/i)).toHaveValue('senha-segura')
  })

  it('renderiza a política com versão e data de vigência', async () => {
    renderRoute('/politica-de-privacidade')

    expect(
      await screen.findByRole('heading', { name: 'Política de Privacidade' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('11 de setembro de 2026')).toBeInTheDocument()
    expect(screen.getByText(/versão jurídica inicial/i)).toBeInTheDocument()
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
