import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { BellRing, Repeat, Target } from 'lucide-react'
import { toast } from 'sonner'

import { PushProgress } from '@/components/push-progress'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { locksEnabled } from '@/lib/app-lock'
import { enablePush, isPushEnabled, pushPermission, pushSupported, type EnableStep } from '@/lib/push'
import { errorMessage } from '@/lib/utils'
import { useAppLock } from '@/store/app-lock-store'
import { useAuthStore } from '@/store/auth-store'

// "Not now" lasts for the rest of the day; the sheet asks again the next day.
const SNOOZE_KEY = 'push-prompt-snoozed:'
const today = () => format(new Date(), 'yyyy-MM-dd')

function snoozedToday(userId: string) {
  try {
    return localStorage.getItem(SNOOZE_KEY + userId) === today()
  } catch {
    return false
  }
}

function snooze(userId: string | undefined) {
  if (!userId) return
  try {
    localStorage.setItem(SNOOZE_KEY + userId, today())
  } catch {
    // Storage unavailable: the sheet just asks again next time.
  }
}

const FEATURES = [
  { icon: BellRing, text: 'Reminder at 1 pm and 10 pm to update your expenses' },
  { icon: Target, text: 'Alert when a budget reaches 80% and 100%' },
  { icon: Repeat, text: 'Recurring expenses on the day they are due' },
]

/**
 * Asks to turn on notifications as soon as the app is open and unlocked,
 * while this device isn't subscribed. "Allow" is a tap, so Chrome shows its
 * real permission prompt. Mounted in App.tsx while signed in.
 */
export function PushPromptSheet() {
  const userId = useAuthStore((s) => s.profile?.id)
  const appUnlocked = useAppLock((s) => s.appUnlocked)
  const ready = !locksEnabled || appUnlocked
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<EnableStep | null>(null)

  useEffect(() => {
    if (!ready || !userId || !pushSupported() || pushPermission() === 'denied' || snoozedToday(userId)) return
    let live = true
    // Let the unlock screen finish closing first.
    const timer = setTimeout(() => {
      isPushEnabled()
        .then((on) => live && !on && setOpen(true))
        .catch(() => {})
    }, 700)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [ready, userId])

  const busy = step !== null

  const notNow = () => {
    snooze(userId)
    setOpen(false)
  }

  const allow = async () => {
    setStep('permission')
    try {
      await enablePush(setStep)
      toast.success('Notifications are on. Try a test from Settings → Notifications.')
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err))
      // Blocked in Chrome: asking again is pointless; Settings explains how to unblock.
      if (pushPermission() === 'denied') setOpen(false)
    } finally {
      setStep(null)
    }
  }

  return (
    <Sheet
      // Hidden while the app lock is up; it comes back on unlock.
      open={open && ready}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) notNow()
      }}
    >
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Turn on reminders?</SheetTitle>
          <SheetDescription>Chrome will ask you to allow notifications for Super App.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <f.icon className="size-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
          {step && <PushProgress step={step} />}
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={notNow} disabled={busy}>
            Not now
          </Button>
          <Button onClick={() => void allow()} disabled={busy}>
            {busy ? 'Setting up…' : 'Allow'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
