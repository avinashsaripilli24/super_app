import { useState } from 'react'
import { format } from 'date-fns'
import { Repeat, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/use-async-data'
import { listRecurring, monthKey, recurringAddedInMonth } from '@/modules/expenses/api'
import { AddRecurringSheet } from '@/modules/expenses/components/add-recurring-sheet'
import { useAuthStore } from '@/store/auth-store'

const DISMISS_KEY = 'recurring-reminder-dismissed:'

function readDismissed(userId: string | undefined) {
  if (!userId) return null
  try {
    return localStorage.getItem(DISMISS_KEY + userId)
  } catch {
    return null
  }
}

function writeDismissed(userId: string | undefined, month: string) {
  if (!userId) return
  try {
    localStorage.setItem(DISMISS_KEY + userId, month)
  } catch {
    // Storage unavailable: the banner just comes back next visit.
  }
}

/**
 * From the 1st of each month: nudges when active recurring expenses have not
 * been added for the current month yet. Dismissal lasts until the next month.
 */
export function RecurringReminder({ onAdded }: { onAdded?: () => void }) {
  const userId = useAuthStore((s) => s.profile?.id)
  const month = monthKey(new Date())
  const [dismissed, setDismissed] = useState(() => readDismissed(userId))
  const [addOpen, setAddOpen] = useState(false)

  const { data, reload } = useAsyncData(
    async () => {
      const [items, added] = await Promise.all([listRecurring(), recurringAddedInMonth(month)])
      return items.filter((r) => r.active && r.category_id && !added.has(r.id)).length
    },
    `recurring-reminder:${month}`,
    'Failed to check recurring expenses',
  )

  const pending = data ?? 0
  if (pending === 0 || dismissed === month) return null

  const dismiss = () => {
    writeDismissed(userId, month)
    setDismissed(month)
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Repeat className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          {pending} recurring {pending === 1 ? 'expense' : 'expenses'} not added for {format(new Date(), 'MMMM')}
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          Add now
        </Button>
        <Button size="icon" variant="ghost" className="-mr-1" aria-label="Dismiss for this month" onClick={dismiss}>
          <X />
        </Button>
      </div>
      <AddRecurringSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultMonth={month}
        onSaved={() => {
          reload()
          onAdded?.()
        }}
      />
    </>
  )
}
