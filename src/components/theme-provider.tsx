import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

const mql = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function subscribeSystem(cb: () => void) {
  mql?.addEventListener('change', cb)
  return () => mql?.removeEventListener('change', cb)
}

function getSystemTheme(): 'dark' | 'light' {
  return mql?.matches ? 'dark' : 'light'
}

function readStored(storageKey: string): Theme | null {
  try {
    return localStorage.getItem(storageKey) as Theme | null
  } catch {
    return null
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'super-app-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStored(storageKey) ?? defaultTheme)
  const systemTheme = useSyncExternalStore(subscribeSystem, getSystemTheme, () => 'light' as const)
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  // Sync the DOM (external system) with the resolved theme.
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
    // Keep the browser chrome (address bar) in sync in installed mode.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#202124' : '#2563eb')
  }, [resolvedTheme])

  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      /* storage unavailable */
    }
    setThemeState(next)
  }

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeProviderContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
