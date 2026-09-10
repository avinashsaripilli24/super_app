import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** localStorage flag set when the install banner is dismissed. */
export const INSTALL_DISMISS_KEY = 'super-app-install-dismissed'

// A dismissal only lasts until the app is installed, so if it is later
// uninstalled the browser's next beforeinstallprompt brings the banner back.
function clearInstallDismissal() {
  try {
    localStorage.removeItem(INSTALL_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

// Capture the event as early as possible: it can fire before React mounts.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    clearInstallDismissal()
    listeners.forEach((l) => l())
  })
  // Installed via the browser menu with no tab listening: the installed app
  // shares storage with the browser on Chrome/Edge, so clear it from here.
  if (isStandalone()) clearInstallDismissal()
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Exposes the PWA install state:
 *  - canPrompt: Chrome/Edge/Android captured beforeinstallprompt
 *  - installed: running in standalone mode
 *  - ios: iOS Safari has no prompt; show the "Share → Add to Home Screen" hint
 */
export function usePwaInstall() {
  const [, force] = useState(0)

  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') deferredPrompt = null
    force((n) => n + 1)
    return outcome
  }, [])

  return {
    canPrompt: deferredPrompt !== null,
    installed: isStandalone(),
    ios: isIos(),
    promptInstall,
  }
}
