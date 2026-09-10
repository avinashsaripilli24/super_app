import { z } from 'zod'

import { PAYMENT_METHODS } from '@/modules/expenses/api'

export const transactionSchema = z
  .object({
    kind: z.enum(['expense', 'income']),
    // Inputs register with `valueAsNumber`, so an empty field arrives as NaN and
    // fails the number check with the message below.
    amount: z
      .number({ error: 'Enter an amount' })
      .positive('Amount must be greater than 0')
      .max(99_999_999, 'Amount is too large'),
    category_id: z.string().min(1, 'Pick a category'),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    note: z.string().trim().max(200, 'Keep the note under 200 characters'),
    payment_method: z.enum(PAYMENT_METHODS),
    /** Household member who earned an income row. Ignored for expenses. */
    earned_by: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'income' && !v.earned_by) {
      ctx.addIssue({ code: 'custom', path: ['earned_by'], message: 'Pick who earned it' })
    }
  })
export type TransactionFormValues = z.infer<typeof transactionSchema>

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Keep it under 40 characters'),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
  kind: z.enum(['expense', 'income']),
})
export type CategoryFormValues = z.infer<typeof categorySchema>

export const budgetSchema = z.object({
  category_id: z.string(), // '' = overall
  amount: z
    .number({ error: 'Enter an amount' })
    .min(0, 'Amount cannot be negative')
    .max(99_999_999, 'Amount is too large'),
})
export type BudgetFormValues = z.infer<typeof budgetSchema>
