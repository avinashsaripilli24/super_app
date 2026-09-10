import { create } from 'zustand'

import { useAuthStore } from '@/store/auth-store'

/**
 * Two checkpoints sharing one PIN / fingerprint: the app lock (asked on launch
 * and every return from the background) and the Assets lock (asked every time
 * you enter Assets). In memory only, so a reload always starts locked.
 */
export interface AppLockState {
  appUnlocked: boolean
  assetsUnlocked: boolean
  unlockApp: () => void
  lockApp: () => void
  unlockAssets: () => void
  lockAssets: () => void
}

export const useAppLock = create<AppLockState>((set) => ({
  appUnlocked: false,
  assetsUnlocked: false,
  unlockApp: () => set({ appUnlocked: true }),
  lockApp: () => set({ appUnlocked: false }),
  unlockAssets: () => set({ assetsUnlocked: true }),
  lockAssets: () => set({ assetsUnlocked: false }),
}))

// Signing out or switching account locks both. (Signing in with the password
// then unlocks the app from the login page.)
useAuthStore.subscribe((s, prev) => {
  if (s.status !== 'signedIn' || s.session?.user.id !== prev.session?.user.id) {
    useAppLock.setState({ appUnlocked: false, assetsUnlocked: false })
  }
})
