import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/components/theme-provider'
import { installKeyboardSupport } from '@/lib/keyboard'

installKeyboardSupport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="super-app-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
)
