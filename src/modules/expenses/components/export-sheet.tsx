import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-picker'
import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn, errorMessage } from '@/lib/utils'
import {
  listTransactionsBetween,
  listUserNames,
  monthRange,
  withNames,
  yearRange,
} from '@/modules/expenses/api'
import { exportLedgerToExcel, type ExportKind } from '@/modules/expenses/export'

const schema = z
  .object({
    scope: z.enum(['month', 'year', 'custom']),
    kind: z.enum(['all', 'expense', 'income']),
    from: z.string(),
    to: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.scope !== 'custom') return
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (!re.test(v.from)) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Pick a start date' })
    if (!re.test(v.to)) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Pick an end date' })
    if (re.test(v.from) && re.test(v.to) && v.from > v.to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'End date must be after start date' })
    }
  })
type FormValues = z.infer<typeof schema>

export function ExportSheet({
  open,
  onOpenChange,
  month,
  year,
  defaultScope,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `YYYY-MM` shown for the "This month" option. */
  month: string
  /** Year shown for the "This year" option. */
  year: number
  defaultScope: 'month' | 'year'
}) {
  const [busy, setBusy] = useState(false)

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { scope: defaultScope, kind: 'all', from: '', to: '' },
  })

  useEffect(() => {
    if (open) reset({ scope: defaultScope, kind: 'all', from: '', to: '' })
  }, [open, defaultScope, reset])

  const scope = watch('scope')

  const onSubmit = async (v: FormValues) => {
    setBusy(true)
    try {
      let start: string
      let end: string
      let title: string
      let fileLabel: string
      let yearForSummary: number | undefined
      if (v.scope === 'month') {
        const r = monthRange(month)
        start = r.start
        end = r.end
        title = format(r.date, 'MMMM yyyy')
        fileLabel = month
      } else if (v.scope === 'year') {
        const r = yearRange(year)
        start = r.start
        end = r.end
        title = String(year)
        fileLabel = String(year)
        yearForSummary = year
      } else {
        start = v.from
        end = v.to
        title = `${format(parseISO(v.from), 'd MMM yyyy')} – ${format(parseISO(v.to), 'd MMM yyyy')}`
        fileLabel = `${v.from}_to_${v.to}`
        if (v.from.slice(0, 4) === v.to.slice(0, 4)) yearForSummary = Number(v.from.slice(0, 4))
      }

      const [rows, names] = await Promise.all([listTransactionsBetween(start, end), listUserNames()])
      const ledger = withNames(rows, names)
      if (ledger.length === 0) {
        toast.info('Nothing to export in that range')
        return
      }
      const fileName = await exportLedgerToExcel({
        title,
        fileLabel,
        rows: ledger,
        kind: v.kind as ExportKind,
        year: yearForSummary,
      })
      toast.success('Export ready', { description: fileName })
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'))
    } finally {
      setBusy(false)
    }
  }

  const scopeOptions: { value: FormValues['scope']; label: string; hint: string }[] = [
    { value: 'month', label: 'This month', hint: format(monthRange(month).date, 'MMMM yyyy') },
    { value: 'year', label: 'This year', hint: String(year) },
    { value: 'custom', label: 'Custom range', hint: 'Pick start and end dates' },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Export to Excel</SheetTitle>
          <SheetDescription>Expenses and income sheets plus a summary, as an .xlsx file.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Range" error={errors.scope?.message}>
              <Controller
                control={control}
                name="scope"
                render={({ field }) => (
                  <div className="space-y-2" role="radiogroup" aria-label="Range">
                    {scopeOptions.map((o) => {
                      const active = field.value === o.value
                      return (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => field.onChange(o.value)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                            active ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                          )}
                        >
                          <span className="font-medium">{o.label}</span>
                          <span className="text-xs text-muted-foreground">{o.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              />
            </Field>

            {scope === 'custom' && (
              <Field label="Dates" htmlFor="export-range" error={errors.from?.message ?? errors.to?.message}>
                <Controller
                  control={control}
                  name="from"
                  render={({ field }) => (
                    <DateRangePicker
                      id="export-range"
                      from={field.value}
                      to={watch('to')}
                      onChange={(r) => {
                        field.onChange(r.from)
                        setValue('to', r.to, { shouldValidate: isSubmitted })
                      }}
                      onBlur={field.onBlur}
                      aria-invalid={!!(errors.from || errors.to)}
                    />
                  )}
                />
              </Field>
            )}

            <Field label="Include" error={errors.kind?.message}>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Include">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Expenses and income</SelectItem>
                      <SelectItem value="expense">Expenses only</SelectItem>
                      <SelectItem value="income">Income only</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Preparing…' : 'Download .xlsx'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
