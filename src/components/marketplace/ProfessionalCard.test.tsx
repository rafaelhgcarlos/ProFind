import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ProfessionalCard } from './ProfessionalCard'

describe('ProfessionalCard', () => {
  it('apresenta somente dados recebidos e desabilita ações sem integração', () => {
    render(<MemoryRouter><ProfessionalCard name="Ana Lima" specialty="Pintura" /></MemoryRouter>)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.queryByText('Verificado')).not.toBeInTheDocument()
    expect(screen.queryByText(/avaliações/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solicitar orçamento' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ver perfil' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Favoritar/ })).not.toBeInTheDocument()
  })

  it('mostra dados completos sem persistir favoritos por conta própria', async () => {
    const user = userEvent.setup()
    const onFavorite = vi.fn()
    const onRequestQuote = vi.fn()
    render(<MemoryRouter><ProfessionalCard name="Marina Souza" specialty="Elétrica" photoUrl="/foto.jpg" verified rating={4.8} reviewCount={12} area="Campinas" availability="Disponível" portfolioImages={['/trabalho.jpg']} profileHref="/perfil-exemplo" onRequestQuote={onRequestQuote} onFavorite={onFavorite} /></MemoryRouter>)
    expect(screen.getByText('MS')).toBeInTheDocument()
    expect(screen.getByText('Verificado')).toBeInTheDocument()
    expect(screen.getByText(/12 avaliações/)).toBeInTheDocument()
    expect(screen.getByText('Campinas')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Trabalho 1 de Marina Souza' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver perfil' })).toHaveAttribute('href', '/perfil-exemplo')
    await user.click(screen.getByRole('button', { name: 'Favoritar Marina Souza' }))
    await user.click(screen.getByRole('button', { name: 'Solicitar orçamento' }))
    expect(onFavorite).toHaveBeenCalledOnce()
    expect(onRequestQuote).toHaveBeenCalledOnce()
  })
})
