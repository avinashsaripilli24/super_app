import { ShieldCheck } from 'lucide-react'

import { LockShell } from '@/components/app-lock/lock-shell'
import { PinSetupForm } from '@/components/app-lock/pin-setup-form'

/** First PIN on this device (or after Forgot PIN), shown by either lock. */
export function PinSetupScreen({
  userId,
  description,
  onUnlock,
  onSaved,
}: {
  userId: string
  description: string
  /** Called just before the PIN is written, so the gate opens instead of flashing its lock screen. */
  onUnlock: () => void
  onSaved: () => void
}) {
  return (
    <LockShell icon={ShieldCheck} title="Set your PIN" description={description}>
      <PinSetupForm userId={userId} autoFocus beforeSave={onUnlock} onDone={onSaved} />
    </LockShell>
  )
}
