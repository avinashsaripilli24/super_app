import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'

import { AppLockOverlay } from '@/components/app-lock/app-lock-overlay'
import { PwaUpdateToast } from '@/components/pwa-update-toast'
import { ThemedToaster } from '@/components/themed-toaster'
import { SplashScreen } from '@/components/splash-screen'
import { locksEnabled } from '@/lib/app-lock'
import { syncPush } from '@/lib/push'
import { router } from '@/router'
import { useAuthStore } from '@/store/auth-store'

function App() {
  const status = useAuthStore((s) => s.status)
  const profileId = useAuthStore((s) => s.profile?.id)
  const role = useAuthStore((s) => s.profile?.role)
  const init = useAuthStore((s) => s.init)

  useEffect(() => init(), [init])

  // Re-run route guards whenever auth changes so redirects fire immediately.
  useEffect(() => {
    if (status !== 'loading') void router.invalidate()
  }, [status, profileId, role])

  // A device already subscribed to notifications follows whoever signs in on it.
  useEffect(() => {
    if (profileId) syncPush().catch(() => {})
  }, [profileId])

  // Notification tapped while the app was open: the service worker focuses
  // this window and asks for an in-app navigation (no reload).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent<{ type?: string; url?: string }>) => {
      if (event.data?.type !== 'notification-navigate' || !event.data.url) return
      const url = new URL(event.data.url)
      const base = import.meta.env.BASE_URL
      if (url.origin !== window.location.origin || !url.pathname.startsWith(base)) return
      void router.navigate({
        to: '/' + url.pathname.slice(base.length),
        search: Object.fromEntries(url.searchParams),
      } as never)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  return (
    <>
      {status === 'loading' ? <SplashScreen /> : <RouterProvider router={router} />}
      {status === 'signedIn' && locksEnabled && <AppLockOverlay />}
      <PwaUpdateToast />
      <ThemedToaster />
    </>
  )
}

export default App
