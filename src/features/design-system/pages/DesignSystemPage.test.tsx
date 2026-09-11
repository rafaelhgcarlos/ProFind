import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '../../../components/ui/tooltip'
import { THEME_STORAGE_KEY, type ResolvedTheme } from '../../../lib/theme'
import { ThemeProvider } from '../../../providers/theme-provider'
import { DesignSystemPage } from './DesignSystemPage'

function renderCatalog(theme: ResolvedTheme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)

  return render(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter>
          <DesignSystemPage />
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

describe.each(['light', 'dark'] as const)('DesignSystemPage no tema %s', (theme) => {
  beforeEach(() => window.localStorage.clear())

  it('renderiza os componentes principais e seus estados', () => {
    renderCatalog(theme)

    expect(document.documentElement).toHaveAttribute('data-theme', theme)
    expect(screen.getByRole('button', { name: 'Primária' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Indisponível' })).toBeDisabled()
    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /receber atualizações/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Urgente' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Ativar notificações' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Recentes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir diálogo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir painel' })).toBeInTheDocument()
    expect(screen.getByText('Nenhum item por aqui')).toBeInTheDocument()
  })
})
