import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wrench } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { CategoryTile } from './CategoryTile'

describe('CategoryTile', () => {
  it('aceita nome longo, estado ativo e seleção por teclado', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<CategoryTile name="Manutenção residencial especializada" icon={Wrench} active onSelect={onSelect} />)
    const tile = screen.getByRole('button', { name: 'Manutenção residencial especializada' })
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    tile.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
