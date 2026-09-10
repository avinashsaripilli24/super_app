import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
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
import { amountInWords } from '@/lib/money-words'
import { errorMessage, formatMoney } from '@/lib/utils'
import {
  todayKey,
  updateValuation,
  upsertValuations,
  type HoldingRow,
  type Valuation,
  type ValuationInput,
} from '@/modules/assets/api'
import { optionalNumber, valuationSchemaFor, type ValuationFormValues } from '@/modules/assets/schemas'

/** What the valuation sheet needs to know about its holding. */
export type ValuationHolding = Pick<
  HoldingRow,
  'id' | 'name' | 'kind' | 'valuation_mode' | 'units_held' | 'unit_price' | 'current_value'
>

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Record today's value (or price per unit) for a holding, or edit an earlier
 * valuation. Creating on a date that already has a value updates that row.
 */
export function ValuationSheet({
  open,
  onOpenChange,
  holding,
  editing,
  readOnly = false,
  addedBy,
  onSaved,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  holding: ValuationHolding | null
  editing?: Valuation | null
  readOnly?: boolean
  addedBy?: string
  onSaved: () => void
  onDelete?: () => void
}) {
  const mode = holding?.valuation_mode ?? 'value'
  const kind = holding?.kind ?? 'asset'
  const holdingId = holding?.id
  const units = holding?.units_held ?? 0
  const schema = useMemo(() => valuationSchemaFor(mode), [mode])

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ValuationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { as_of: todayKey(), note: '' },
  })

  useEffect(() => {
    if (!open || !holdingId) return
    if (editing) {
      reset({
        as_of: editing.as_of,
        value: Number(editing.value),
        unit_price: editing.unit_price === null ? undefined : Number(editing.unit_price),
        note: editing.note ?? '',
      })
    } else {
      reset({ as_of: todayKey(), value: undefined, unit_price: undefined, note: '' })
    }
  }, [open, editing, holdingId, reset])

  const price = watch('unit_price')
  const value = watch('value')
  const computed = mode === 'units' && price ? round2(units * price) : null

  const onSubmit = async (values: ValuationFormValues) => {
    if (readOnly || !holdingId) return
    const payload: ValuationInput = {
      holding_id: holdingId,
      as_of: values.as_of,
      value: mode === 'units' ? round2(units * (values.unit_price ?? 0)) : (values.value ?? 0),
      unit_price: mode === 'units' ? (values.unit_price ?? null) : null,
      note: values.note ? values.note : null,
    }
    try {
      if (editing) {
        await updateValuation(editing.id, payload)
        toast.success('Valuation updated')
      } else {
        await upsertValuations([payload])
        toast.success('Value updated')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const disabled = readOnly || isSubmitting
  const description =
    mode === 'units'
      ? `Latest price / NAV per unit. ${units} units held.`
      : kind === 'debt'
        ? 'Outstanding balance as per your latest statement.'
        : 'Current value as per your statement or best estimate.'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{readOnly ? 'Valuation' : editing ? 'Edit valuation' : 'Update value'}</SheetTitle>
          <SheetDescription>
            {holding?.name ?? ''} · {description}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {readOnly && (
              <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Only {addedBy ?? 'the person who added it'} or an admin can change this
                valuation.
              </p>
            )}

            {mode === 'units' ? (
              <Field
                label="Price per unit"
                htmlFor="val-price"
                error={errors.unit_price?.message}
                hint={computed !== null ? `${units} units × ${formatMoney(price ?? 0)} = ${formatMoney(computed)}` : undefined}
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="val-price"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    placeholder={holding?.unit_price ? String(holding.unit_price) : '0.00'}
                    className="pl-8 text-lg font-semibold"
                    disabled={disabled}
                    aria-invalid={!!errors.unit_price}
                    {...register('unit_price', optionalNumber)}
                  />
                </div>
              </Field>
            ) : (
              <Field
                label={kind === 'debt' ? 'Outstanding balance' : 'Current value'}
                htmlFor="val-value"
                error={errors.value?.message}
                hint={amountInWords(value ?? Number.NaN) ?? undefined}
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="val-value"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder={holding ? String(holding.current_value) : '0.00'}
                    className="pl-8 text-lg font-semibold"
                    disabled={disabled}
                    aria-invalid={!!errors.value}
                    {...register('value', optionalNumber)}
                  />
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="As of" htmlFor="val-date" error={errors.as_of?.message}>
                <Controller
                  control={control}
                  name="as_of"
                  render={({ field }) => (
                    <DatePicker
                      id="val-date"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={disabled || !!editing}
                      aria-invalid={!!errors.as_of}
                    />
                  )}
                />
              </Field>
              <Field label="Note" htmlFor="val-note" error={errors.note?.message}>
                <Input id="val-note" placeholder="e.g. Statement" autoComplete="off" disabled={disabled} {...register('note')} />
              </Field>
            </div>
          </SheetBody>
          <SheetFooter>
            {readOnly ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            ) : (
              <>
                {editing && onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mr-auto text-destructive hover:text-destructive"
                    onClick={onDelete}
                    disabled={isSubmitting}
                  >
                    <Trash2 /> Delete
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save'}
                </Button>
              </>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
