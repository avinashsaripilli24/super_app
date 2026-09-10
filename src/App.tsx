import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'

import { AppLockOverlay } from '@/components/app-lock/app-lock-overlay'
import { PwaUpdateToast } from '@/components/pwa-update-toast'
import { ThemedToaster } from '@/components/themed-toaster'
import { SplashScreen } from '@/components/splash-screen'
import { locksEnabled } from '@/lib/app-lock'
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
