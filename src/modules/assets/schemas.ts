import { z } from 'zod'

import { Constants } from '@/lib/database.types'
import type { ValuationMode } from '@/modules/assets/api'

const E = Constants.public.Enums
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_MONEY = 999_999_999_999

/**
 * `register()` options for an optional numeric input: an empty field becomes
 * `undefined` (so `.optional()` passes) instead of NaN.
 */
export const optionalNumber = {
  setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
}

const optionalDate = z.string().refine((v) => v === '' || ISO_DATE.test(v), 'Pick a date')

export const holdingSchema = z.object({
  kind: z.enum(E.asset_kind),
  category_id: z.string().min(1, 'Pick a type'),
  name: z.string().trim().min(1, 'Name is required').max(80, 'Keep it under 80 characters'),
  institution: z.string().trim().max(80, 'Keep it under 80 characters'),
  identifier: z.string().trim().max(60, 'Keep it under 60 characters'),
  holder_id: z.string().min(1, 'Pick a holder'),
  opened_on: optionalDate,
  maturity_on: optionalDate,
  interest_rate: z
    .number()
    .min(0, 'Rate cannot be negative')
    .max(100, 'Rate is a percentage')
    .optional(),
  notes: z.string().trim().max(300, 'Keep notes under 300 characters'),
})
export type HoldingFormValues = z.infer<typeof holdingSchema>

const txnBase = z.object({
  type: z.enum(E.holding_txn_type),
  occurred_on: z.string().regex(ISO_DATE, 'Pick a date'),
  amount: z.number().min(0, 'Amount cannot be negative').max(MAX_MONEY, 'Amount is too large').optional(),
  quantity: z.number().positive('Units must be greater than 0').optional(),
  unit_price: z.number().positive('Price must be greater than 0').optional(),
  interest_amount: z.number().min(0, 'Interest cannot be negative').optional(),
  note: z.string().trim().max(200, 'Keep the note under 200 characters'),
})
export type HoldingTxnFormValues = z.infer<typeof txnBase>

/** Transaction rules depend on how the holding is valued. */
export function holdingTxnSchemaFor(mode: ValuationMode) {
  return txnBase.superRefine((v, ctx) => {
    if (v.type !== 'bonus' && !(v.amount !== undefined && v.amount > 0)) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount' })
    }
    const needsUnits = mode === 'units' && (v.type === 'invest' || v.type === 'redeem' || v.type === 'bonus')
    if (needsUnits && v.quantity === undefined) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter the number of units' })
    }
    if (v.type === 'repay' && v.interest_amount !== undefined && v.amount !== undefined && v.interest_amount > v.amount) {
      ctx.addIssue({ code: 'custom', path: ['interest_amount'], message: 'Interest cannot exceed the amount paid' })
    }
  })
}

const valuationBase = z.object({
  as_of: z.string().regex(ISO_DATE, 'Pick a date'),
  value: z.number().min(0, 'Value cannot be negative').max(MAX_MONEY, 'Value is too large').optional(),
  unit_price: z.number().positive('Price must be greater than 0').optional(),
  note: z.string().trim().max(200, 'Keep the note under 200 characters'),
})
export type ValuationFormValues = z.infer<typeof valuationBase>

export function valuationSchemaFor(mode: ValuationMode) {
  return valuationBase.superRefine((v, ctx) => {
    if (mode === 'units' && v.unit_price === undefined) {
      ctx.addIssue({ code: 'custom', path: ['unit_price'], message: 'Enter the price per unit' })
    }
    if (mode === 'value' && v.value === undefined) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the current value' })
    }
  })
}

export const assetTypeSchema = z
  .object({
    kind: z.enum(E.asset_kind),
    name: z.string().trim().min(1, 'Name is required').max(40, 'Keep it under 40 characters'),
    icon: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
    valuation_mode: z.enum(E.valuation_mode),
    asset_class: z.enum(E.asset_class).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'asset' && !v.asset_class) {
      ctx.addIssue({ code: 'custom', path: ['asset_class'], message: 'Pick an asset class' })
    }
  })
export type AssetTypeFormValues = z.infer<typeof assetTypeSchema>

export const targetSchema = z.object({
  category_id: z.string().min(1, 'Pick a type'),
  amount: z
    .number({ error: 'Enter an amount' })
    .min(0, 'Amount cannot be negative')
    .max(MAX_MONEY, 'Amount is too large'),
})
export type TargetFormValues = z.infer<typeof targetSchema>

export const updateValuesSchema = z.object({
  as_of: z.string().regex(ISO_DATE, 'Pick a date'),
  rows: z.array(
    z.object({
      holding_id: z.string(),
      input: z.number().min(0, 'Cannot be negative').max(MAX_MONEY, 'Too large').optional(),
    }),
  ),
})
export type UpdateValuesFormValues = z.infer<typeof updateValuesSchema>
