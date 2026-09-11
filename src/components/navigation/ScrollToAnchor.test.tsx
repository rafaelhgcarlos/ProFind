import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScrollToAnchor } from './ScrollToAnchor'

const scrollIntoView = vi.fn()

function NavigationFixture() {
  const navigate = useNavigate()

  return (
    <>
      <ScrollToAnchor />
      <button onClick={() => navigate('/#como-funciona')}>Ir para seção</button>
      <section id="como-funciona">Como funciona</section>
    </>
  )
}

describe('ScrollToAnchor', () => {
  beforeEach(() => {
    scrollIntoView.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
  })

  it('reposiciona a âncora após uma navegação real do router', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationFixture />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ir para seção' }))

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'start',
      })
    })

    scrollIntoView.mockClear()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ir para seção' }))
      await Promise.resolve()
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('trata uma navegação inicial que contém âncora', async () => {
    render(
      <MemoryRouter initialEntries={['/#como-funciona']}>
        <ScrollToAnchor />
        <section id="como-funciona">Como funciona</section>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'start',
      })
    })
  })
})
