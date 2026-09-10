import { z } from 'zod'

import { mobileSchema } from '@/lib/phone'

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')

export const createUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120),
  phone: mobileSchema,
  role: z.enum(['admin', 'user']),
  password: passwordRule,
})
export type CreateUserValues = z.infer<typeof createUserSchema>

export const resetPasswordSchema = z.object({
  password: passwordRule,
})
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export const changePhoneSchema = z.object({
  phone: mobileSchema,
})
export type ChangePhoneValues = z.infer<typeof changePhoneSchema>
