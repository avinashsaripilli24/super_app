import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MoneyWords } from '@/components/ui/money'
import { formatMoney } from '@/lib/utils'
import type { CategoryTotal } from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'

/**
 * Stacked bar + per-category rows (spending or income). With `onSelect` the
 * rows are buttons (e.g. to open that category's transactions), so the figure
 * is plain text there — the opened sheet shows the amount in words.
 */
export function CategoryBreakdown({
  rows,
  emptyText = 'No spending recorded this month.',
  limit = 6,
  onSelect,
}: {
  rows: CategoryTotal[]
  emptyText?: string
  limit?: number
  onSelect?: (row: CategoryTotal) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }
  const visible = showAll ? rows : rows.slice(0, limit)
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {rows.map((r) => (
          <span
            key={r.id}
            title={`${r.name}: ${Math.round(r.share * 100)}%`}
            style={{ width: `${r.share * 100}%`, backgroundColor: r.color }}
          />
        ))}
      </div>
      <ul className={onSelect ? '-mx-2 space-y-0.5' : 'space-y-2'}>
        {visible.map((r) =>
          onSelect ? (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60 active:bg-accent"
              >
                <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                <span className="min-w-0 flex-1 break-words">{r.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{Math.round(r.share * 100)}%</span>
                <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{formatMoney(r.total)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ) : (
            <li key={r.id} className="flex items-center gap-3 text-sm">
              <CategoryIcon icon={r.icon} color={r.color} size="sm" />
              <span className="min-w-0 flex-1 break-words">{r.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{Math.round(r.share * 100)}%</span>
              <MoneyWords
                amount={r.total}
                label={r.name}
                align="end"
                className="shrink-0 whitespace-nowrap font-medium tabular-nums"
              />
            </li>
          ),
        )}
      </ul>
      {rows.length > limit && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show less' : `Show all ${rows.length} categories`}
        </Button>
      )}
    </div>
  )
}
