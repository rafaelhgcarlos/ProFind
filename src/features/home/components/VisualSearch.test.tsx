import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { VisualSearch } from './VisualSearch'

function renderSearch(props: React.ComponentProps<typeof VisualSearch> = {}) {
  return render(<MemoryRouter><VisualSearch {...props} /></MemoryRouter>)
}

describe('VisualSearch', () => {
  it('mostra indisponibilidade sem fabricar resultados', async () => {
    const user = userEvent.setup()
    renderSearch()
    const form = screen.getByRole('search', { name: 'Buscar profissionais' })
    await user.click(within(form).getByRole('button', { name: 'Encontrar profissionais' }))
    expect(screen.getByText('Busca em preparação')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'criar sua conta' })).toHaveAttribute('href', '/cadastro')
  })

  it('entrega campos preenchidos apenas ao integrador e respeita disabled e loading', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    const view = renderSearch({ onSearch })
    await user.type(screen.getByLabelText('Qual serviço você precisa?'), '  Pintura  ')
    await user.type(screen.getByLabelText('Onde?'), '  Campinas  ')
    await user.click(screen.getByRole('button', { name: 'Encontrar profissionais' }))
    expect(onSearch).toHaveBeenCalledWith({ service: 'Pintura', location: 'Campinas' })

    view.rerender(<MemoryRouter><VisualSearch disabled onSearch={onSearch} /></MemoryRouter>)
    expect(screen.getByLabelText('Onde?')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Encontrar profissionais' })).toBeDisabled()
    view.rerender(<MemoryRouter><VisualSearch loading onSearch={onSearch} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Buscando…' })).toBeDisabled()
  })

  it('associa o erro ao campo de serviço', () => {
    renderSearch({ error: 'Revise o serviço informado.' })
    expect(screen.getByLabelText('Qual serviço você precisa?')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Revise o serviço informado.')
  })

  it('oferece somente as especialidades recebidas pelo catálogo', () => {
    const { container } = renderSearch({
      serviceOptions: ['Eletricista', 'Diarista/Faxineiro'],
    })

    expect(screen.getByLabelText('Qual serviço você precisa?')).toHaveAttribute(
      'list',
      'service-options',
    )
    expect(
      Array.from(container.querySelectorAll('datalist option')).map(
        (option) => option.getAttribute('value'),
      ),
    ).toEqual(['Eletricista', 'Diarista/Faxineiro'])
  })
})
