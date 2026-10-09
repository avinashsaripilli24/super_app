import { useEffect, useState } from 'react'
import { Bell, BellRing, Repeat, Smartphone, Target } from 'lucide-react'
import { toast } from 'sonner'

import { PushProgress } from '@/components/push-progress'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  disablePush,
  enablePush,
  isPushEnabled,
  onPushChange,
  pushPermission,
  pushUnsupportedReason,
  sendTestPush,
  showLocalTest,
  type EnableStep,
  type TestSample,
} from '@/lib/push'
import { errorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

const TESTS: { sample: TestSample; label: string; hint: string; icon: typeof Bell }[] = [
  { sample: 'daily', label: 'Daily reminder', hint: 'Opens a new expense', icon: BellRing },
  { sample: 'budget', label: 'Budget alert', hint: 'Opens Budgets', icon: Target },
  { sample: 'recurring', label: 'Recurring due', hint: 'Opens Expenses', icon: Repeat },
]

type Busy = 'toggle' | TestSample | 'local' | null

/** Settings → Notifications: turn push on for this device and send test notifications. */
export function NotificationsCard() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const unsupported = pushUnsupportedReason()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [blocked, setBlocked] = useState(() => !unsupported && pushPermission() === 'denied')
  const [busy, setBusy] = useState<Busy>(null)
  // Set while turning on: drives the progress shimmer under the switch.
  const [step, setStep] = useState<EnableStep | null>(null)

  useEffect(() => {
    if (unsupported || !userId) return
    let live = true
    const load = () =>
      isPushEnabled()
        .then((on) => live && setEnabled(on))
        .catch(() => live && setEnabled(false))
    void load()
    // Also turned on/off from the prompt sheet.
    const off = onPushChange(() => void load())
    return () => {
      live = false
      off()
    }
  }, [unsupported, userId])

  const toggle = async (on: boolean) => {
    setBusy('toggle')
    if (on) setStep('permission')
    try {
      if (on) {
        await enablePush(setStep)
        setEnabled(true)
        toast.success('Notifications turned on')
      } else {
        await disablePush()
        setEnabled(false)
        toast.success('Notifications turned off on this device')
      }
    } catch (err) {
      setBlocked(pushPermission() === 'denied')
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
      setStep(null)
    }
  }

  const test = async (sample: TestSample) => {
    setBusy(sample)
    try {
      const sent = await sendTestPush(sample)
      if (sent > 0) toast.success('Test sent')
      else toast.error('The server couldn’t reach this phone. Turn notifications off and on again.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const localTest = async () => {
    setBusy('local')
    try {
      await showLocalTest()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          A reminder to update your expenses at 1 pm and 10 pm, budget alerts at 80% and 100%, and recurring expenses
          on the day they are due. Set per device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {unsupported ? (
          <p className="text-sm text-muted-foreground">{unsupported}</p>
        ) : enabled === null ? (
          <Skeleton className="h-10" />
        ) : (
          <>
            <div className="flex min-h-10 items-center justify-between gap-3">
              <label htmlFor="push-switch" className="flex min-w-0 items-center gap-3">
                <Bell className="size-5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">Notifications on this device</span>
              </label>
              <Switch
                id="push-switch"
                // Flips at once; the progress below shows the setup still running.
                checked={enabled || step !== null}
                disabled={busy !== null || (blocked && !enabled)}
                onCheckedChange={(on) => void toggle(on)}
              />
            </div>

            {step && <PushProgress step={step} />}

            {blocked && !enabled && (
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Notifications are blocked for this app. In Chrome, open the site settings (the icon next to the
                address, or Settings → Site settings → Notifications), allow them, then come back.
              </p>
            )}

            {enabled && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Test notifications</p>
                {TESTS.map((t) => (
                  <Button
                    key={t.sample}
                    variant="outline"
                    className="h-auto min-h-10 w-full justify-start py-2"
                    disabled={busy !== null}
                    onClick={() => void test(t.sample)}
                  >
                    <t.icon className="text-muted-foreground" />
                    <span className="flex-1 text-left">{t.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {busy === t.sample ? 'Sending…' : t.hint}
                    </span>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="h-auto min-h-10 w-full justify-start py-2"
                  disabled={busy !== null}
                  onClick={() => void localTest()}
                >
                  <Smartphone className="text-muted-foreground" />
                  <span className="flex-1 text-left">Show local test</span>
                  <span className="text-xs font-normal text-muted-foreground">Without the server</span>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sent to this phone only. Lock the screen or switch apps to see it the way a real one arrives. If
                  the local test shows but the others don’t, the server isn’t reaching the phone.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
