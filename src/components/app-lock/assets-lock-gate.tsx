import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { LockShell } from '@/components/app-lock/lock-shell'
import { UnlockScreen } from '@/components/app-lock/unlock-screen'
import { lockSupported, locksEnabled, useLockRecord } from '@/lib/app-lock'
import { useAppLock } from '@/store/app-lock-store'
import { useAuthStore } from '@/store/auth-store'

/**
 * Layout route around every /assets page. Nothing below it mounts (so nothing
 * is fetched) until the shared PIN or fingerprint unlocks it, and it locks
 * again as soon as you navigate out of Assets (this layout unmounts). PIN
 * setup and returns from the background are handled by the app lock overlay.
 */
export function AssetsLockGate() {
  if (!locksEnabled) return <Outlet />
  return <LockedAssets />
}

function LockedAssets() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const appUnlocked = useAppLock((s) => s.appUnlocked)
  const assetsUnlocked = useAppLock((s) => s.assetsUnlocked)
  const unlockAssets = useAppLock((s) => s.unlockAssets)
  const record = useLockRecord(userId)

  useEffect(() => () => useAppLock.getState().lockAssets(), [])

  if (!userId) return null

  if (!lockSupported()) {
    return (
      <LockShell
        icon={ShieldAlert}
        title="Assets lock unavailable"
        description="The Assets lock needs a secure connection (https:// or localhost). Open the app from its secure address to see your assets."
      />
    )
  }

  if (assetsUnlocked && record) return <Outlet />

  // The app lock overlay is up (it also covers first-time setup): don't start
  // a second fingerprint prompt underneath it.
  if (!appUnlocked || !record) return null

  return (
    <UnlockScreen
      userId={userId}
      record={record}
      title="Assets are locked"
      what="Assets"
      onUnlock={unlockAssets}
      // Password verified: once the new PIN is set (in the app lock), Assets opens directly.
      onForgotReset={unlockAssets}
    />
  )
}
