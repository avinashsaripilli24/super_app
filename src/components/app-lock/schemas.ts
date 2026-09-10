import { z } from 'zod'

import { PIN_MAX, PIN_MIN } from '@/lib/app-lock'

export const pinSchema = z
  .string()
  .regex(new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`), `Use ${PIN_MIN} to ${PIN_MAX} digits`)

export const pinSetupSchema = z
  .object({ pin: pinSchema, confirm: z.string() })
  .refine((v) => v.pin === v.confirm, { path: ['confirm'], message: 'PINs do not match' })
export type PinSetupValues = z.infer<typeof pinSetupSchema>

export const unlockSchema = z.object({ pin: z.string().min(1, 'Enter your PIN') })
export type UnlockValues = z.infer<typeof unlockSchema>

export const changePinSchema = z
  .object({ current: z.string().min(1, 'Enter your current PIN'), pin: pinSchema, confirm: z.string() })
  .refine((v) => v.pin === v.confirm, { path: ['confirm'], message: 'PINs do not match' })
export type ChangePinValues = z.infer<typeof changePinSchema>

export const passwordSchema = z.object({ password: z.string().min(1, 'Enter your account password') })
export type PasswordValues = z.infer<typeof passwordSchema>
