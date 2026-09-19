import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { HomePage } from './HomePage'
import { useCatalog } from '../use-catalog'

vi.mock('../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock('../use-catalog', () => ({
  useCatalog: vi.fn(),
}))

const catalog = {
  categories: [
    { id: 'construction', name: 'Construção Civil', active: true, order: 10 },
    { id: 'domestic', name: 'Serviços Domésticos', active: true, order: 20 },
  ],
  specialties: [
    { id: 'electrician', categoryId: 'construction', name: 'Eletricista', active: true, order: 10 },
    { id: 'cleaner', categoryId: 'domestic', name: 'Diarista/Faxineiro', active: true, order: 10 },
  ],
}

describe('HomePage catalog', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('renderiza categorias e especialidades carregadas e permite selecionar uma categoria', async () => {
    vi.mocked(useCatalog).mockReturnValue({
      status: 'ready',
      catalog,
      error: null,
      retry: vi.fn(),
    })
    const user = userEvent.setup()

    render(<MemoryRouter><HomePage /></MemoryRouter>)

    expect(screen.getByRole('button', { name: /Construção Civil/ })).toHaveTextContent('Eletricista')
    expect(screen.getByRole('button', { name: /Serviços Domésticos/ })).toHaveTextContent('Diarista/Faxineiro')
    expect(document.querySelector('option[value="Eletricista"]')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Construção Civil/ }))

    expect(screen.getByLabelText('Qual serviço você precisa?')).toHaveValue('Construção Civil')
  })

  it('oferece nova tentativa quando o catálogo falha', async () => {
    const retry = vi.fn()
    vi.mocked(useCatalog).mockReturnValue({
      status: 'error',
      catalog: null,
      error: 'Falha ao carregar.',
      retry,
    })
    const user = userEvent.setup()

    render(<MemoryRouter><HomePage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar.')
  })
})
