import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { FingerprintPattern } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ForgotPinSheet } from '@/components/app-lock/forgot-pin-sheet'
import { PinInput } from '@/components/app-lock/pin-input'
import { PinSetupForm } from '@/components/app-lock/pin-setup-form'
import {
  changePinSchema,
  unlockSchema,
  type ChangePinValues,
  type UnlockValues,
} from '@/components/app-lock/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  biometricAvailable,
  disableBiometric,
  enrollBiometric,
  isBiometricCancel,
  lockSupported,
  locksEnabled,
  setPin,
  useLockRecord,
  verifyPin,
  type PinResult,
} from '@/lib/app-lock'
import { errorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

function wrongPinMessage(result: Extract<PinResult, { ok: false }>) {
  return result.remaining > 0
    ? `Wrong PIN. ${result.remaining} ${result.remaining === 1 ? 'attempt' : 'attempts'} left.`
    : 'Too many wrong PINs. Use “Forgot PIN?” below.'
}

/** Settings → App lock (shared by the app-open and Assets locks): PIN, fingerprint / Face ID, forgot PIN. */
export function SecurityCard() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const record = useLockRecord(userId)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [enableOpen, setEnableOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  useEffect(() => {
    void biometricAvailable().then(setBioAvailable)
  }, [])

  const setBiometric = (on: boolean) => {
    if (!userId) return
    if (on) {
      setEnableOpen(true)
      return
    }
    disableBiometric(userId)
    toast.success('Fingerprint / Face ID turned off')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>App lock</CardTitle>
        <CardDescription>
          Asked when you open the app and every time you open Assets. The PIN and fingerprint / Face ID are stored on
          this device only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!locksEnabled && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Locks are off in development. Set <code className="font-mono">VITE_APP_LOCK=on</code> in{' '}
            <code className="font-mono">.env.local</code> to test them.
          </p>
        )}
        {!lockSupported() ? (
          <p className="text-sm text-muted-foreground">The app lock needs https:// or localhost.</p>
        ) : !userId ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !record ? (
          <PinSetupForm userId={userId} onDone={() => toast.success('PIN set')} />
        ) : (
          <>
            {bioAvailable && (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="biometric-switch" className="flex min-w-0 items-center gap-3">
                  <FingerprintPattern className="size-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">Unlock with fingerprint / Face ID</span>
                </label>
                <Switch id="biometric-switch" checked={!!record.credentialId} onCheckedChange={setBiometric} />
              </div>
            )}
            <ChangePinForm userId={userId} />
            <Button variant="link" className="h-10 px-0" onClick={() => setForgotOpen(true)}>
              Forgot PIN?
            </Button>
          </>
        )}
      </CardContent>
      {userId && <EnableBiometricSheet userId={userId} open={enableOpen} onOpenChange={setEnableOpen} />}
      <ForgotPinSheet open={forgotOpen} onOpenChange={setForgotOpen} />
    </Card>
  )
}

function ChangePinForm({ userId }: { userId: string }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePinValues>({
    resolver: zodResolver(changePinSchema),
    defaultValues: { current: '', pin: '', confirm: '' },
  })

  const onSubmit = async (values: ChangePinValues) => {
    try {
      const result = await verifyPin(userId, values.current)
      if (!result.ok) {
        setError('current', { message: wrongPinMessage(result) })
        return
      }
      await setPin(userId, values.pin)
      reset()
      toast.success('PIN changed')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Current PIN" htmlFor="current-pin" error={errors.current?.message}>
        <PinInput id="current-pin" aria-invalid={!!errors.current} {...register('current')} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="New PIN" htmlFor="change-pin" error={errors.pin?.message}>
          <PinInput id="change-pin" aria-invalid={!!errors.pin} {...register('pin')} />
        </Field>
        <Field label="Confirm new PIN" htmlFor="change-pin-confirm" error={errors.confirm?.message}>
          <PinInput id="change-pin-confirm" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Change PIN'}
      </Button>
    </form>
  )
}

/** Turning fingerprint on needs the PIN, so someone holding an open phone can't add theirs. */
function EnableBiometricSheet({
  userId,
  open,
  onOpenChange,
}: {
  userId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const profile = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UnlockValues>({ resolver: zodResolver(unlockSchema), defaultValues: { pin: '' } })

  useEffect(() => {
    if (open) reset({ pin: '' })
  }, [open, reset])

  const onSubmit = async ({ pin }: UnlockValues) => {
    try {
      const result = await verifyPin(userId, pin)
      if (!result.ok) {
        setError('pin', { message: wrongPinMessage(result) })
        return
      }
      await enrollBiometric({ id: userId, phone: profile?.phone, name: profile?.full_name })
      toast.success('Fingerprint / Face ID turned on')
      onOpenChange(false)
    } catch (err) {
      if (!isBiometricCancel(err)) toast.error(errorMessage(err))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Turn on fingerprint / Face ID</SheetTitle>
          <SheetDescription>Enter your PIN, then confirm with your fingerprint or face.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody>
            <Field label="PIN" htmlFor="enable-bio-pin" error={errors.pin?.message}>
              <PinInput id="enable-bio-pin" aria-invalid={!!errors.pin} {...register('pin')} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Waiting…' : 'Continue'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
