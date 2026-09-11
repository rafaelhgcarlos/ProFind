import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { ThemeContext, type ThemeContextValue } from '../contexts/theme-context'
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme'

function getMediaQuery() {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    getStoredTheme(typeof window === 'undefined' ? undefined : window.localStorage),
  )
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'light'
    return resolveTheme(theme, getMediaQuery().matches)
  })

  useEffect(() => {
    const mediaQuery = getMediaQuery()

    const syncTheme = () => {
      const nextTheme = resolveTheme(theme, mediaQuery.matches)
      setResolvedTheme(nextTheme)
      applyTheme(nextTheme)
    }

    syncTheme()
    mediaQuery.addEventListener('change', syncTheme)
    return () => mediaQuery.removeEventListener('change', syncTheme)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme(nextTheme) {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
        } catch {
          // A preferência segue válida na sessão quando o storage não está disponível.
        }
        setThemeState(nextTheme)
      },
    }),
    [resolvedTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
