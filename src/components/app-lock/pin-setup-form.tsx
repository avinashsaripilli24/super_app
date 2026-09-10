import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PinInput } from '@/components/app-lock/pin-input'
import { pinSetupSchema, type PinSetupValues } from '@/components/app-lock/schemas'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PIN_MAX, PIN_MIN, setPin } from '@/lib/app-lock'
import { errorMessage } from '@/lib/utils'

/** New PIN + confirm. Used by the first-visit setup screen and the Settings card. */
export function PinSetupForm({
  userId,
  submitLabel = 'Set PIN',
  autoFocus = false,
  beforeSave,
  onDone,
}: {
  userId: string
  submitLabel?: string
  autoFocus?: boolean
  /** Runs just before the PIN is written (the record appearing re-renders lock gates). */
  beforeSave?: () => void
  onDone: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PinSetupValues>({ resolver: zodResolver(pinSetupSchema), defaultValues: { pin: '', confirm: '' } })

  const onSubmit = async (values: PinSetupValues) => {
    try {
      beforeSave?.()
      await setPin(userId, values.pin)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
      <Field label="New PIN" htmlFor="new-pin" error={errors.pin?.message} hint={`${PIN_MIN} to ${PIN_MAX} digits`}>
        <PinInput id="new-pin" autoFocus={autoFocus} aria-invalid={!!errors.pin} {...register('pin')} />
      </Field>
      <Field label="Confirm PIN" htmlFor="confirm-pin" error={errors.confirm?.message}>
        <PinInput id="confirm-pin" aria-invalid={!!errors.confirm} {...register('confirm')} />
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
