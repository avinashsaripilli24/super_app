import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { FingerprintPattern, LockKeyhole } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ForgotPinSheet } from '@/components/app-lock/forgot-pin-sheet'
import { LockShell } from '@/components/app-lock/lock-shell'
import { PinInput } from '@/components/app-lock/pin-input'
import { unlockSchema, type UnlockValues } from '@/components/app-lock/schemas'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { attemptsLeft, isBiometricCancel, verifyBiometric, verifyPin, type LockRecord } from '@/lib/app-lock'
import { errorMessage } from '@/lib/utils'

/** PIN / fingerprint prompt shared by the app lock and the Assets lock. */
export function UnlockScreen({
  userId,
  record,
  title,
  what,
  onUnlock,
  onForgotReset,
}: {
  userId: string
  record: LockRecord
  title: string
  /** Finishes "Enter your PIN to open …". */
  what: string
  onUnlock: () => void
  /** The account password was verified in Forgot PIN (a new PIN is set next). */
  onForgotReset?: () => void
}) {
  const [forgotOpen, setForgotOpen] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const hasBio = !!record.credentialId
  const left = attemptsLeft(record)

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<UnlockValues>({ resolver: zodResolver(unlockSchema), defaultValues: { pin: '' } })

  const onSubmit = async ({ pin }: UnlockValues) => {
    try {
      const result = await verifyPin(userId, pin)
      if (result.ok) {
        onUnlock()
        return
      }
      reset({ pin: '' })
      if (result.remaining > 0) setFocus('pin')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  const submit = handleSubmit(onSubmit)

  const tryBiometric = async (auto: boolean) => {
    setBioBusy(true)
    try {
      if (await verifyBiometric(userId)) onUnlock()
      else if (!auto) toast.error('Fingerprint / Face ID could not be verified')
    } catch (err) {
      // Cancelled, or the browser wants a tap before prompting: the button stays.
      if (!auto && !isBiometricCancel(err)) toast.error(errorMessage(err))
    } finally {
      setBioBusy(false)
    }
  }

  // Offer the fingerprint prompt straight away, once per lock screen.
  const autoTried = useRef(false)
  const autoBiometric = useEffectEvent(() => {
    if (!hasBio || autoTried.current) return
    autoTried.current = true
    void tryBiometric(true)
  })
  useEffect(() => autoBiometric(), [])

  const pinError =
    errors.pin?.message ??
    (record.failed > 0 && left > 0 ? `Wrong PIN. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : undefined)

  return (
    <LockShell
      icon={LockKeyhole}
      title={title}
      description={hasBio ? 'Enter your PIN or use fingerprint / Face ID.' : `Enter your PIN to open ${what}.`}
    >
      {left > 0 ? (
        <form onSubmit={submit} className="space-y-3 text-left">
          <Field label="PIN" htmlFor="unlock-pin" error={pinError}>
            <PinInput
              id="unlock-pin"
              autoFocus={!hasBio}
              aria-invalid={!!pinError}
              {...register('pin', {
                // Submit on the last digit; the button covers desktop Enter too.
                onChange: (e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.value.length >= record.length && !isSubmitting) void submit()
                },
              })}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Checking…' : 'Unlock'}
          </Button>
        </form>
      ) : (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Too many wrong PINs. {hasBio ? 'Use fingerprint / Face ID, or reset' : 'Reset'} the PIN with your account
          password.
        </p>
      )}
      {hasBio && (
        <Button variant="outline" className="w-full" onClick={() => void tryBiometric(false)} disabled={bioBusy}>
          <FingerprintPattern /> Use fingerprint / Face ID
        </Button>
      )}
      <Button variant={left > 0 ? 'link' : 'default'} className="w-full" onClick={() => setForgotOpen(true)}>
        Forgot PIN?
      </Button>
      <ForgotPinSheet open={forgotOpen} onOpenChange={setForgotOpen} onReset={onForgotReset} />
    </LockShell>
  )
}
