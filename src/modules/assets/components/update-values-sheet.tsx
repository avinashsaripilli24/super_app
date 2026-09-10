import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { Lock } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { errorMessage, formatMoney } from '@/lib/utils'
import {
  canEdit,
  listHoldingsAll,
  listValuationsOn,
  todayKey,
  upsertValuations,
  type HoldingRow,
  type UserNames,
  type Valuation,
  type ValuationInput,
} from '@/modules/assets/api'
import { optionalNumber, updateValuesSchema, type UpdateValuesFormValues } from '@/modules/assets/schemas'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { useAuthStore } from '@/store/auth-store'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Refresh the current value (or price per unit) of every active holding in
 * one go. Only rows the user actually types into are saved.
 */
export function UpdateValuesSheet({
  open,
  onOpenChange,
  names,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  names: UserNames
  onSaved: () => void
}) {
  const profile = useAuthStore((s) => s.profile)
  const { data, loading } = useAsyncData(
    async () => {
      if (!open) return null
      const holdings = await listHoldingsAll({ status: 'active' })
      const todays = await listValuationsOn(
        todayKey(),
        holdings.map((h) => h.id),
      )
      return { holdings, todays }
    },
    open ? 'open' : 'closed',
    'Failed to load holdings',
  )
  const holdings = useMemo(() => data?.holdings ?? [], [data])
  const todayByHolding = useMemo(() => {
    const m = new Map<string, Valuation>()
    for (const v of data?.todays ?? []) m.set(v.holding_id, v)
    return m
  }, [data])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateValuesFormValues>({
    resolver: zodResolver(updateValuesSchema),
    defaultValues: { as_of: todayKey(), rows: [] },
  })

  useEffect(() => {
    if (!open || !data) return
    reset({ as_of: todayKey(), rows: data.holdings.map((h) => ({ holding_id: h.id, input: undefined })) })
  }, [open, data, reset])

  const locked = (h: HoldingRow) => {
    const v = todayByHolding.get(h.id)
    return v && !canEdit(v, profile) ? v : null
  }

  const onSubmit = async (values: UpdateValuesFormValues) => {
    const byId = new Map(holdings.map((h) => [h.id, h]))
    const rows: ValuationInput[] = []
    for (const r of values.rows) {
      const h = byId.get(r.holding_id)
      if (!h || r.input === undefined || locked(h)) continue
      rows.push(
        h.valuation_mode === 'units'
          ? { holding_id: h.id, as_of: values.as_of, value: round2(h.units_held * r.input), unit_price: r.input, note: null }
          : { holding_id: h.id, as_of: values.as_of, value: r.input, unit_price: null, note: null },
      )
    }
    if (rows.length === 0) {
      toast.info('No values changed')
      return
    }
    try {
      await upsertValuations(rows)
      toast.success(`${rows.length} value${rows.length === 1 ? '' : 's'} updated`)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const groups: { kind: 'asset' | 'debt'; title: string }[] = [
    { kind: 'asset', title: 'Assets' },
    { kind: 'debt', title: 'Debts (outstanding)' },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Update values</SheetTitle>
          <SheetDescription>
            Type the latest value or price for whichever holdings you have fresh numbers for; the rest stay as they are.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="As of" htmlFor="values-date" error={errors.as_of?.message}>
              <Controller
                control={control}
                name="as_of"
                render={({ field }) => (
                  <DatePicker
                    id="values-date"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={isSubmitting}
                    aria-invalid={!!errors.as_of}
                  />
                )}
              />
            </Field>

            {loading || !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : holdings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active holdings yet.</p>
            ) : (
              groups.map((g) => {
                const rows = holdings.map((h, i) => ({ h, i })).filter(({ h }) => h.kind === g.kind)
                if (rows.length === 0) return null
                return (
                  <section key={g.kind} className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h3>
                    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                      {rows.map(({ h, i }) => {
                        const lock = locked(h)
                        const isUnits = h.valuation_mode === 'units'
                        const last = h.last_valued_on
                          ? `${isUnits && h.unit_price ? formatMoney(h.unit_price) + '/unit' : formatMoney(h.current_value)} on ${format(parseISO(h.last_valued_on), 'd MMM')}`
                          : isUnits && h.unit_price
                            ? `${formatMoney(h.unit_price)}/unit from last buy`
                            : h.current_value > 0
                              ? `${formatMoney(h.current_value)} from transactions`
                              : 'Not valued yet'
                        const err = errors.rows?.[i]?.input?.message
                        return (
                          <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                            <CategoryIcon icon={h.category_icon} color={h.category_color} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium">{h.name}</p>
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {isUnits ? `${h.units_held} units · ` : ''}
                                {last}
                              </p>
                              {err && <p className="text-xs text-destructive">{err}</p>}
                            </div>
                            {lock ? (
                              <span className="flex w-28 shrink-0 items-start gap-1 text-right text-xs text-muted-foreground">
                                <Lock className="mt-0.5 size-3 shrink-0" />
                                <span className="min-w-0 flex-1 text-left">
                                  Valued today by {names.get(lock.user_id) ?? 'someone else'}
                                </span>
                              </span>
                            ) : (
                              <div className="relative w-28 shrink-0 sm:w-32">
                                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                                  ₹
                                </span>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  min="0"
                                  aria-label={`${h.name}: new ${isUnits ? 'price per unit' : 'value'}`}
                                  placeholder={isUnits ? (h.unit_price ? String(h.unit_price) : 'price') : String(h.current_value)}
                                  className="pl-7 text-right"
                                  disabled={isSubmitting}
                                  aria-invalid={!!err}
                                  {...register(`rows.${i}.input` as const, optionalNumber)}
                                />
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })
            )}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || loading}>
              {isSubmitting ? 'Saving…' : 'Save values'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
