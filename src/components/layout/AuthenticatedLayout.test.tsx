import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ThemeProvider } from '../../providers/theme-provider'
import { AdminLayout } from './AdminLayout'
import { ClientLayout } from './ClientLayout'
import { ProfessionalLayout } from './ProfessionalLayout'

function renderLayout(path: string, layout: React.ReactNode) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>{layout}</MemoryRouter>
    </ThemeProvider>,
  )
}

describe('layouts autenticados', () => {
  it('prioriza as tarefas do cliente em navegações mobile e desktop', () => {
    renderLayout(
      '/cliente',
      <ClientLayout pageTitle="Início">Conteúdo do cliente</ClientLayout>,
    )

    expect(screen.getByRole('navigation', { name: 'Área do cliente' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Área do cliente — navegação mobile' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Buscar' })).toHaveLength(2)
  })

  it('prioriza oportunidades no modo profissional', () => {
    renderLayout(
      '/profissional',
      <ProfessionalLayout pageTitle="Oportunidades">
        Conteúdo profissional
      </ProfessionalLayout>,
    )

    expect(screen.getAllByRole('link', { name: 'Oportunidades' })).toHaveLength(2)
    expect(screen.getByText('Conteúdo profissional')).toBeInTheDocument()
  })

  it('mantém uma estrutura de navegação administrativa separada', () => {
    renderLayout(
      '/admin',
      <AdminLayout pageTitle="Visão geral">Conteúdo administrativo</AdminLayout>,
    )

    expect(screen.getByRole('navigation', { name: 'Administração' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Oportunidades' })).not.toBeInTheDocument()
  })

  it('mantém a tarefa atual destacada em rotas aninhadas', () => {
    renderLayout(
      '/cliente/buscar/filtros',
      <ClientLayout pageTitle="Buscar">Conteúdo da busca</ClientLayout>,
    )

    for (const link of screen.getAllByRole('link', { name: 'Buscar' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }

    for (const link of screen.getAllByRole('link', { name: 'Início' })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })
})
