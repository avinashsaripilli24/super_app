import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { passwordSchema, type PasswordValues } from '@/components/app-lock/schemas'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { clearLock } from '@/lib/app-lock'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

/**
 * Forgot PIN: prove it's you with the account password, then the lock (PIN and
 * fingerprint) is wiped on this device and a new PIN is set.
 */
export function ForgotPinSheet({
  open,
  onOpenChange,
  onReset,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Runs once the password checked out, just before the lock is wiped. */
  onReset?: () => void
}) {
  const userId = useAuthStore((s) => s.session?.user.id)
  const email = useAuthStore((s) => s.session?.user.email ?? s.profile?.email)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '' } })

  useEffect(() => {
    if (open) reset({ password: '' })
  }, [open, reset])

  const onSubmit = async (values: PasswordValues) => {
    if (!userId || !email) return
    const { error } = await supabase.auth.signInWithPassword({ email, password: values.password })
    if (error) {
      if (error.code === 'invalid_credentials') setError('password', { message: 'Incorrect password' })
      else toast.error(errorMessage(error))
      return
    }
    onReset?.()
    clearLock(userId)
    onOpenChange(false)
    toast.success('PIN cleared. Set a new one.')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Forgot PIN</SheetTitle>
          <SheetDescription>
            Enter your account password to reset the PIN on this device. Fingerprint / Face ID is turned off too.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Account password" htmlFor="lock-password" error={errors.password?.message}>
              <Input
                id="lock-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Checking…' : 'Reset PIN'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
