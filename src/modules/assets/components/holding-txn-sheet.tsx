import { useEffect, useMemo, useRef } from 'react'
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
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  createHoldingTransaction,
  todayKey,
  updateHoldingTransaction,
  type HoldingRow,
  type HoldingTxn,
  type HoldingTxnInput,
  type HoldingTxnType,
} from '@/modules/assets/api'
import { TXN_TYPE_LABEL, txnTypesFor } from '@/modules/assets/labels'
import { holdingTxnSchemaFor, optionalNumber, type HoldingTxnFormValues } from '@/modules/assets/schemas'

/** What the transaction sheet needs to know about its holding. */
export type TxnHolding = Pick<HoldingRow, 'id' | 'name' | 'kind' | 'valuation_mode' | 'unit_price'>

const AMOUNT_LABEL: Record<HoldingTxnType, string> = {
  invest: 'Amount invested',
  redeem: 'Amount received',
  income: 'Amount received',
  bonus: 'Amount',
  borrow: 'Amount borrowed',
  repay: 'Amount paid',
  charge: 'Interest / charge added',
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** Record or edit one cash flow on a holding (buy, sale, dividend, EMI…). */
export function HoldingTxnSheet({
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
  holding: TxnHolding | null
  editing?: HoldingTxn | null
  /** Viewer may not edit this row (not the creator and not an admin). */
  readOnly?: boolean
  /** Creator's name, for the read-only banner. */
  addedBy?: string
  onSaved: () => void
  onDelete?: () => void
}) {
  const kind = holding?.kind ?? 'asset'
  const mode = holding?.valuation_mode ?? 'value'
  const holdingId = holding?.id
  const lastPrice = holding?.unit_price ?? null
  const schema = useMemo(() => holdingTxnSchemaFor(mode), [mode])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<HoldingTxnFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'invest', occurred_on: todayKey(), note: '' },
  })

  // Hydrate when opened.
  useEffect(() => {
    if (!open || !holdingId) return
    if (editing) {
      reset({
        type: editing.type,
        occurred_on: editing.occurred_on,
        amount: Number(editing.amount),
        quantity: editing.quantity === null ? undefined : Number(editing.quantity),
        unit_price: editing.unit_price === null ? undefined : Number(editing.unit_price),
        interest_amount: editing.interest_amount === null ? undefined : Number(editing.interest_amount),
        note: editing.note ?? '',
      })
    } else {
      reset({
        type: kind === 'asset' ? 'invest' : 'repay',
        occurred_on: todayKey(),
        amount: undefined,
        quantity: undefined,
        unit_price: mode === 'units' && lastPrice ? lastPrice : undefined,
        interest_amount: undefined,
        note: '',
      })
    }
  }, [open, editing, holdingId, kind, mode, lastPrice, reset])

  const type = watch('type')
  const showUnits = mode === 'units' && (type === 'invest' || type === 'redeem' || type === 'bonus')
  const showAmount = type !== 'bonus'
  const showInterest = type === 'repay'

  // Amount follows units × price until the user types their own figure.
  const autoAmount = useRef<number | null>(null)
  const syncAmount = () => {
    const q = getValues('quantity')
    const p = getValues('unit_price')
    const current = getValues('amount')
    if (!q || !p) return
    if (current !== undefined && current !== autoAmount.current) return
    const next = round2(q * p)
    autoAmount.current = next
    setValue('amount', next, { shouldValidate: isSubmitted })
  }
  const qtyReg = register('quantity', optionalNumber)
  const priceReg = register('unit_price', optionalNumber)

  const onSubmit = async (values: HoldingTxnFormValues) => {
    if (readOnly || !holdingId) return
    const payload: HoldingTxnInput = {
      holding_id: holdingId,
      occurred_on: values.occurred_on,
      type: values.type,
      amount: values.type === 'bonus' ? 0 : (values.amount ?? 0),
      quantity: showUnits ? (values.quantity ?? null) : null,
      unit_price: showUnits ? (values.unit_price ?? null) : null,
      interest_amount: values.type === 'repay' ? (values.interest_amount ?? null) : null,
      note: values.note ? values.note : null,
    }
    try {
      if (editing) {
        await updateHoldingTransaction(editing.id, payload)
        toast.success('Transaction updated')
      } else {
        await createHoldingTransaction(payload)
        toast.success('Transaction added')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const disabled = readOnly || isSubmitting
  const title = readOnly ? 'Transaction' : editing ? 'Edit transaction' : 'Add transaction'
  const interest = watch('interest_amount')
  const amount = watch('amount')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{holding?.name ?? ''}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {readOnly && (
              <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Only {addedBy ?? 'the person who added it'} or an admin can change this
                transaction.
              </p>
            )}

            <Field label="What happened" error={errors.type?.message}>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {txnTypesFor(kind).map((t) => {
                      const active = field.value === t
                      if (readOnly && !active) return null
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            field.onChange(t)
                            if (t === 'bonus') setValue('amount', undefined)
                          }}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-default',
                            active ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent',
                          )}
                        >
                          {TXN_TYPE_LABEL[t]}
                        </button>
                      )
                    })}
                  </div>
                )}
              />
            </Field>

            {showUnits && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Units" htmlFor="txn-qty" error={errors.quantity?.message}>
                  <Input
                    id="txn-qty"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    placeholder="0"
                    disabled={disabled}
                    aria-invalid={!!errors.quantity}
                    {...qtyReg}
                    onChange={(e) => {
                      void qtyReg.onChange(e)
                      syncAmount()
                    }}
                  />
                </Field>
                <Field label="Price per unit" htmlFor="txn-price" error={errors.unit_price?.message}>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      id="txn-price"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      className="pl-8"
                      disabled={disabled}
                      aria-invalid={!!errors.unit_price}
                      {...priceReg}
                      onChange={(e) => {
                        void priceReg.onChange(e)
                        syncAmount()
                      }}
                    />
                  </div>
                </Field>
              </div>
            )}

            {showAmount && (
              <Field
                label={AMOUNT_LABEL[type]}
                htmlFor="txn-amount"
                error={errors.amount?.message}
                hint={amountInWords(amount ?? Number.NaN) ?? undefined}
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="txn-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-8 text-lg font-semibold"
                    disabled={disabled}
                    aria-invalid={!!errors.amount}
                    {...register('amount', optionalNumber)}
                  />
                </div>
              </Field>
            )}

            {showInterest && (
              <Field
                label="Of which interest"
                htmlFor="txn-interest"
                error={errors.interest_amount?.message}
                hint={
                  interest !== undefined && amount !== undefined && interest <= amount
                    ? `${formatMoney(amount - interest)} reduces the outstanding principal.`
                    : 'Optional. The rest of the payment reduces the outstanding principal.'
                }
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="txn-interest"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-8"
                    disabled={disabled}
                    aria-invalid={!!errors.interest_amount}
                    {...register('interest_amount', optionalNumber)}
                  />
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="txn-date" error={errors.occurred_on?.message}>
                <Controller
                  control={control}
                  name="occurred_on"
                  render={({ field }) => (
                    <DatePicker
                      id="txn-date"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={disabled}
                      aria-invalid={!!errors.occurred_on}
                    />
                  )}
                />
              </Field>
              <Field label="Note" htmlFor="txn-note" error={errors.note?.message}>
                <Input id="txn-note" placeholder="Optional" autoComplete="off" disabled={disabled} {...register('note')} />
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
                  {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add'}
                </Button>
              </>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
