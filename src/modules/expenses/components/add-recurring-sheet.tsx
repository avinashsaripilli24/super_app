import { useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Repeat } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MoneyWords } from '@/components/ui/money'
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
import { Switch } from '@/components/ui/switch'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  addRecurringForMonth,
  listRecurring,
  monthKey,
  monthRange,
  recurringAddedInMonth,
  recurringDate,
  type RecurringWithCategory,
} from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { MonthSwitcher } from '@/modules/expenses/components/month-switcher'

/** `YYYY-MM-DD` → "5 Sep" without a timezone shift. */
function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y!, m! - 1, d!), 'd MMM')
}

/**
 * Adds the chosen active recurring expenses to a month in one insert. Items
 * already added that month start switched off but can still be added again.
 */
export function AddRecurringSheet({
  open,
  onOpenChange,
  defaultMonth,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `YYYY-MM`; defaults to the current month. */
  defaultMonth?: string
  onSaved: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        {/* SheetContent mounts only while open, so each opening starts fresh. */}
        <AddRecurringBody
          initialMonth={defaultMonth ?? monthKey(new Date())}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </SheetContent>
    </Sheet>
  )
}

function AddRecurringBody({
  initialMonth,
  onClose,
  onSaved,
}: {
  initialMonth: string
  onClose: () => void
  onSaved: () => void
}) {
  const [month, setMonth] = useState(initialMonth)
  // Switches the user flipped, per month; everything else uses the default.
  const [overrides, setOverrides] = useState<{ month: string; on: Map<string, boolean> }>({
    month: initialMonth,
    on: new Map(),
  })
  const [saving, setSaving] = useState(false)

  const { data: ready } = useAsyncData(
    async () => {
      const [all, added] = await Promise.all([listRecurring(), recurringAddedInMonth(month)])
      return { items: all.filter((r) => r.active), added }
    },
    month,
    'Failed to load recurring expenses',
  )

  const flipped = overrides.month === month ? overrides.on : null
  const isOn = (r: RecurringWithCategory) =>
    !!r.category_id && (flipped?.get(r.id) ?? !ready?.added.has(r.id))
  const chosen = ready?.items.filter(isOn) ?? []
  const total = chosen.reduce((sum, r) => sum + Number(r.amount), 0)

  const toggle = (id: string, on: boolean) =>
    setOverrides((prev) => {
      const next = new Map(prev.month === month ? prev.on : [])
      next.set(id, on)
      return { month, on: next }
    })

  const submit = async () => {
    if (chosen.length === 0) return
    setSaving(true)
    try {
      await addRecurringForMonth(chosen, month)
      toast.success(`${chosen.length} ${chosen.length === 1 ? 'expense' : 'expenses'} added`)
      onClose()
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Add recurring expenses</SheetTitle>
        <SheetDescription>Each one is dated on its day in the chosen month.</SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-3">
        <MonthSwitcher value={month} onChange={setMonth} />

        {!ready ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : ready.items.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No active recurring expenses"
            description="Set them up under Settings → Recurring expenses."
          />
        ) : (
          <>
            <ul className="space-y-2">
              {ready.items.map((r) => {
                const addedOn = ready.added.get(r.id)
                const missingCategory = !r.category_id
                const on = isOn(r)
                const switchId = `recurring-${r.id}`
                return (
                  <li
                    key={r.id}
                    className={cn('flex items-start gap-3 rounded-xl border bg-card p-3', !on && 'opacity-70')}
                  >
                    <CategoryIcon icon={r.category?.icon} color={r.category?.color} size="sm" />
                    <label htmlFor={switchId} className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium">
                        {r.note || r.category?.name || 'Recurring expense'}
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {shortDate(recurringDate(month, r.day_of_month))}
                        {r.note && r.category ? ` · ${r.category.name}` : ''}
                      </span>
                      {missingCategory ? (
                        <span className="mt-1 flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3 shrink-0" /> Category deleted — edit it to add
                        </span>
                      ) : addedOn ? (
                        <span className="mt-1 flex items-center gap-1 text-xs text-warning">
                          <AlertTriangle className="size-3 shrink-0" /> Already added on{' '}
                          {addedOn.map(shortDate).join(', ')}
                        </span>
                      ) : null}
                    </label>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                        {formatMoney(Number(r.amount))}
                      </span>
                      <Switch
                        id={switchId}
                        checked={on}
                        disabled={missingCategory || saving}
                        onCheckedChange={(v) => toggle(r.id, v)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between gap-2 px-1 text-sm">
              <span className="text-muted-foreground">
                {chosen.length} of {ready.items.length} selected
              </span>
              <MoneyWords
                amount={total}
                label={`Total for ${format(monthRange(month).date, 'MMMM')}`}
                align="end"
                className="shrink-0 whitespace-nowrap font-semibold tabular-nums"
              />
            </div>
          </>
        )}
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving || chosen.length === 0}>
          {saving ? 'Adding…' : `Add ${chosen.length} ${chosen.length === 1 ? 'expense' : 'expenses'}`}
        </Button>
      </SheetFooter>
    </>
  )
}
