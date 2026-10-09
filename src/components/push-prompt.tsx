import { useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { enablePush, pushPermission, pushSupported } from '@/lib/push'
import { errorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

const DISMISS_KEY = 'push-prompt-dismissed:'

function readDismissed(userId: string | undefined) {
  if (!userId) return true
  try {
    return localStorage.getItem(DISMISS_KEY + userId) === '1'
  } catch {
    return false
  }
}

function writeDismissed(userId: string | undefined) {
  if (!userId) return
  try {
    localStorage.setItem(DISMISS_KEY + userId, '1')
  } catch {
    // Storage unavailable: the banner just comes back next visit.
  }
}

/**
 * Dashboard nudge to turn on reminders, shown until this browser has been
 * asked once (permission no longer "default") or the user dismisses it.
 * Settings → Notifications has the full controls.
 */
export function PushPrompt() {
  const userId = useAuthStore((s) => s.profile?.id)
  const [hidden, setHidden] = useState(
    () => !pushSupported() || pushPermission() !== 'default' || readDismissed(userId),
  )
  const [busy, setBusy] = useState(false)

  if (hidden) return null

  const dismiss = () => {
    writeDismissed(userId)
    setHidden(true)
  }

  const turnOn = async () => {
    setBusy(true)
    try {
      await enablePush()
      toast.success('Reminders on. Try a test from Settings → Notifications.')
      setHidden(true)
    } catch (err) {
      toast.error(errorMessage(err))
      if (pushPermission() !== 'default') setHidden(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <BellRing className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm">Get a reminder at 1 pm and 10 pm to update your expenses</p>
      <Button size="sm" onClick={() => void turnOn()} disabled={busy}>
        {busy ? 'Turning on…' : 'Turn on'}
      </Button>
      <Button size="icon" variant="ghost" className="-mr-1" aria-label="Dismiss" onClick={dismiss}>
        <X />
      </Button>
    </div>
  )
}
