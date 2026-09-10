import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ShieldAlert } from 'lucide-react'

import { BiometricOfferSheet } from '@/components/app-lock/biometric-offer-sheet'
import { LockShell } from '@/components/app-lock/lock-shell'
import { PinSetupScreen } from '@/components/app-lock/pin-setup-screen'
import { UnlockScreen } from '@/components/app-lock/unlock-screen'
import { biometricAvailable, biometricPending, lockSupported, useLockRecord } from '@/lib/app-lock'
import { useAppLock } from '@/store/app-lock-store'
import { useAuthStore } from '@/store/auth-store'

/**
 * App-open lock: a full-screen dialog over the whole signed-in app, shown on
 * launch and again the moment the app goes to the background. The app stays
 * mounted underneath, so one unlock returns you exactly where you were (the
 * Assets lock keeps its own state). A Radix dialog so it stacks above any open
 * bottom sheet and takes over focus from it.
 */
export function AppLockOverlay() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const appUnlocked = useAppLock((s) => s.appUnlocked)
  const unlockApp = useAppLock((s) => s.unlockApp)
  const record = useLockRecord(userId)
  const [offerBiometric, setOfferBiometric] = useState(false)

  // Lock as soon as the app is hidden (not on return), so the lock screen is
  // already up for the app switcher's snapshot. The OS fingerprint prompt can
  // hide the page on some phones; that must not re-lock mid-unlock.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !biometricPending()) useAppLock.getState().lockApp()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (!userId) return null

  const supported = lockSupported()
  const open = !supported || !appUnlocked || !record
  const onSaved = () => void biometricAvailable().then(setOfferBiometric)

  return (
    <>
      <DialogPrimitive.Root open={open}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            // Focus the PIN field (also over an open sheet, whose focus trap
            // would otherwise win), but keep the keyboard down while the
            // fingerprint prompt is offered.
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const content = e.currentTarget as HTMLElement
              const field = record?.credentialId ? null : content.querySelector('input')
              ;(field ?? content).focus()
            }}
            className="fixed inset-0 z-[100] overflow-y-auto bg-background px-4 pt-safe pb-safe outline-none"
          >
            <DialogPrimitive.Title className="sr-only">Super App is locked</DialogPrimitive.Title>
            <div className="py-8">
              {!supported ? (
                <LockShell
                  icon={ShieldAlert}
                  title="App lock unavailable"
                  description="The app lock needs a secure connection (https:// or localhost). Open the app from its secure address."
                />
              ) : !record ? (
                <PinSetupScreen
                  userId={userId}
                  description="Protect Super App on this device. You'll enter it every time you open the app and Assets."
                  onUnlock={unlockApp}
                  onSaved={onSaved}
                />
              ) : (
                <UnlockScreen
                  userId={userId}
                  record={record}
                  title="Super App is locked"
                  what="the app"
                  onUnlock={unlockApp}
                  onForgotReset={unlockApp}
                />
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <BiometricOfferSheet open={offerBiometric} onOpenChange={setOfferBiometric} />
    </>
  )
}
