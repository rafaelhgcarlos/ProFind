import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCatalog } from '../../home/use-catalog'
import { useProfile } from '../../onboarding/use-profile'
import { ClientHomePage } from './ClientHomePage'

vi.mock('../../../components/layout/ClientLayout', () => ({
  ClientLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock('../../onboarding/components/ModeSwitcher', () => ({
  ModeSwitcher: () => null,
}))

vi.mock('../../home/use-catalog', () => ({
  useCatalog: vi.fn(),
}))

vi.mock('../../onboarding/use-profile', () => ({
  useProfile: vi.fn(),
}))

const catalog = {
  categories: [
    {
      id: 'construction',
      name: 'Construção e manutenção',
      active: true,
      order: 10,
    },
    {
      id: 'residential',
      name: 'Serviços residenciais',
      active: true,
      order: 20,
    },
  ],
  specialties: [
    {
      id: 'electrician',
      categoryId: 'construction',
      name: 'Eletricista',
      active: true,
      order: 10,
    },
    {
      id: 'gardener',
      categoryId: 'residential',
      name: 'Jardineiro',
      active: true,
      order: 10,
    },
  ],
}

function renderPage(path = '/cliente') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ClientHomePage />
    </MemoryRouter>,
  )
}

describe('ClientHomePage', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useProfile).mockReturnValue({
      profile: {
        userId: 'client-123',
        name: 'Marina Souza',
        email: 'marina@example.com',
        roles: ['client'],
        activeMode: 'client',
        professionalProfileStatus: 'not-started',
      },
    } as ReturnType<typeof useProfile>)
    vi.mocked(useCatalog).mockReturnValue({
      status: 'ready',
      catalog,
      error: null,
      retry: vi.fn(),
    })
  })

  it('saúda o cliente e usa categorias e especialidades do catálogo carregado', () => {
    renderPage()

    expect(
      screen.getByRole('heading', {
        name: /olá, marina.*de qual serviço você precisa/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Construção e manutenção' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eletricista' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jardineiro' })).toBeInTheDocument()
    expect(
      screen.getByText(/em breve você poderá acompanhar suas solicitações/i),
    ).toBeInTheDocument()
  })

  it('leva o foco ao catálogo ao abrir a ação da navegação por hash', () => {
    renderPage('/cliente#catalogo-servicos')

    expect(
      screen.getByLabelText('Filtrar categorias e especialidades'),
    ).toHaveFocus()
  })

  it('filtra com teclado e preserva a especialidade ao abrir a solicitação', async () => {
    const user = userEvent.setup()
    renderPage()

    const filter = screen.getByLabelText('Filtrar categorias e especialidades')
    await user.type(filter, 'jardi')

    expect(screen.queryByRole('button', { name: 'Eletricista' })).not.toBeInTheDocument()
    const gardener = screen.getByRole('button', { name: 'Jardineiro' })
    gardener.focus()
    await user.keyboard('{Enter}')

    expect(gardener).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/continue para informar.*local.*data.*período/i)
    expect(screen.getByRole('link', { name: 'Continuar para a solicitação' })).toHaveAttribute(
      'href',
      '/cliente/solicitar?specialty=gardener',
    )
  })

  it('trata nenhum resultado e permite limpar o filtro', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(
      screen.getByLabelText('Filtrar categorias e especialidades'),
      'serviço inexistente',
    )
    expect(screen.getByText('Nenhum serviço encontrado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpar filtro' }))
    expect(screen.getByRole('button', { name: 'Eletricista' })).toBeInTheDocument()
  })

  it('oferece nova tentativa quando o catálogo falha', async () => {
    const retry = vi.fn()
    vi.mocked(useCatalog).mockReturnValue({
      status: 'error',
      catalog: null,
      error: 'Verifique sua conexão e tente novamente.',
      retry,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent(/verifique sua conexão/i)
  })
})
