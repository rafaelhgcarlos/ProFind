import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeToggle } from '../components/theme/ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '../lib/theme'
import { ThemeProvider } from './theme-provider'

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div>
      <output aria-label="Preferência">{theme}</output>
      <output aria-label="Tema resolvido">{resolvedTheme}</output>
      <button onClick={() => setTheme('light')}>Definir claro</button>
      <button onClick={() => setTheme('dark')}>Definir escuro</button>
      <button onClick={() => setTheme('system')}>Definir sistema</button>
    </div>
  )
}

function createMediaQuery(initialMatches = false) {
  let matches = initialMatches
  const listeners = new Set<() => void>()

  return {
    mediaQuery: {
      get matches() {
        return matches
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
      dispatchEvent: vi.fn(),
    } as MediaQueryList,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      listeners.forEach((listener) => listener())
    },
  }
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('usa system como fallback e reage à preferência do dispositivo', () => {
    const media = createMediaQuery(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(media.mediaQuery)

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('Preferência')).toHaveTextContent(DEFAULT_THEME)
    expect(screen.getByLabelText('Tema resolvido')).toHaveTextContent('light')

    act(() => media.setMatches(true))

    expect(screen.getByLabelText('Tema resolvido')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('alterna entre claro, escuro e sistema e persiste a preferência', async () => {
    const user = userEvent.setup()
    const media = createMediaQuery(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(media.mediaQuery)

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Definir escuro' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Definir claro' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Definir sistema' }))
    expect(screen.getByLabelText('Preferência')).toHaveTextContent('system')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })

  it('restaura a preferência salva entre renderizações', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('Preferência')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('permite operar o seletor de tema somente pelo teclado', async () => {
    const user = userEvent.setup()

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    const trigger = screen.getByRole('button', { name: /alterar tema/i })
    trigger.focus()
    await user.keyboard('{Enter}')

    const darkOption = await screen.findByRole('menuitemradio', { name: 'Escuro' })
    darkOption.focus()
    await user.keyboard('{Enter}')

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })
})
