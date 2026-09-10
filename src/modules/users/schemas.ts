import { z } from 'zod'

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')

export const createUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email'),
  role: z.enum(['admin', 'user']),
  password: passwordRule,
})
export type CreateUserValues = z.infer<typeof createUserSchema>

export const resetPasswordSchema = z.object({
  password: passwordRule,
})
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
