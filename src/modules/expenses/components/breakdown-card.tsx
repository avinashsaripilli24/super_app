import { useState, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { BreakdownBy, CategoryTotal, MonthSummary, TxnKind } from '@/modules/expenses/api'
import { CategoryBreakdown } from '@/modules/expenses/components/category-breakdown'

/**
 * "Spending by" / "Income by" card with a Category | Paid via (Received via)
 * switch. Both breakdowns come from the same `ledger_summary` call.
 */
export function BreakdownCard({
  kind,
  summary,
  loading,
  emptyText,
  action,
  onSelect,
}: {
  kind: TxnKind
  summary: MonthSummary
  loading: boolean
  emptyText: string
  /** Extra header control, e.g. the month page's Categories link. */
  action?: ReactNode
  onSelect: (row: CategoryTotal, by: BreakdownBy) => void
}) {
  const [by, setBy] = useState<BreakdownBy>('category')
  const income = kind === 'income'
  const rows =
    by === 'method'
      ? income
        ? summary.incomeByMethod
        : summary.byMethod
      : income
        ? summary.incomeByCategory
        : summary.byCategory

  const option = (key: BreakdownBy, label: string) => (
    <button
      type="button"
      aria-pressed={by === key}
      onClick={() => setBy(key)}
      className={cn(
        'min-h-9 rounded-md px-2 text-center text-sm font-medium transition-colors',
        by === key ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <Card>
      <CardHeader className={cn(action && 'flex-row items-center justify-between gap-2 space-y-0')}>
        <CardTitle className="text-sm">{income ? 'Income by' : 'Spending by'}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {option('category', 'Category')}
          {option('method', income ? 'Received via' : 'Paid via')}
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <CategoryBreakdown
            // Reset "Show all" when switching dimension.
            key={by}
            rows={rows}
            emptyText={emptyText}
            noun={by === 'method' ? 'methods' : 'categories'}
            onSelect={(row) => onSelect(row, by)}
          />
        )}
      </CardContent>
    </Card>
  )
}
