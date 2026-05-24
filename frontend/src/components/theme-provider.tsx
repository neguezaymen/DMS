import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '@/services/api/client'

export type Theme = 'light' | 'dark' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeClass(resolved: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
}

let backendSyncTimer: ReturnType<typeof setTimeout> | null = null

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'dms-ui-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof localStorage === 'undefined') return defaultTheme
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    const legacy = localStorage.getItem('theme')
    if (legacy === 'dark') return 'dark'
    if (legacy === 'light') return 'light'
    return defaultTheme
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? getSystemTheme() : theme,
  )

  useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme
    setResolvedTheme(resolved)
    applyThemeClass(resolved)

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        const r = mql.matches ? 'dark' : 'light'
        setResolvedTheme(r)
        applyThemeClass(r)
      }
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
  }, [theme])

  const setTheme = useCallback(
    (next: Theme) => {
      localStorage.setItem(storageKey, next)
      localStorage.setItem('theme', next === 'system' ? getSystemTheme() : next)
      setThemeState(next)
      window.dispatchEvent(new Event('dms-theme-change'))

      // Persiste côté serveur (uniquement light|dark, debounced 600ms)
      if (next === 'light' || next === 'dark') {
        if (backendSyncTimer) clearTimeout(backendSyncTimer)
        backendSyncTimer = setTimeout(() => {
          api.put('/users/profile', { theme: next }).catch(() => {
            /* silencieux : user peut-être non connecté */
          })
        }, 600)
      }
    },
    [storageKey],
  )

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
