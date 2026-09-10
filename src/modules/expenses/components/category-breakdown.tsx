import { MoneyWords } from '@/components/ui/money'
import type { CategoryTotal } from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'

/** Stacked bar + per-category rows (spending or income). */
export function CategoryBreakdown({
  rows,
  emptyText = 'No spending recorded this month.',
  limit = 6,
}: {
  rows: CategoryTotal[]
  emptyText?: string
  limit?: number
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }
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
      <ul className="space-y-2">
        {rows.slice(0, limit).map((r) => (
          <li key={r.id} className="flex items-center gap-3 text-sm">
            <CategoryIcon icon={r.icon} color={r.color} size="sm" />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="text-xs text-muted-foreground">{Math.round(r.share * 100)}%</span>
            <MoneyWords amount={r.total} label={r.name} align="end" className="font-medium tabular-nums" />
          </li>
        ))}
      </ul>
    </div>
  )
}
