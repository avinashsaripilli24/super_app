import { useEffect, useMemo } from 'react'

import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { LoadMoreSentinel } from '@/components/ui/load-more-sentinel'
import { MoneyWords } from '@/components/ui/money'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DEFAULT_PAGE_SIZE, useInfiniteList } from '@/hooks/use-infinite-list'
import { cn } from '@/lib/utils'
import {
  groupByDay,
  listTransactionsPage,
  withNames,
  type Category,
  type CategoryTotal,
  type LedgerRow,
  type TxnKind,
  type UserNames,
} from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { DayGroups } from '@/modules/expenses/components/transaction-list'

interface ListProps {
  category: CategoryTotal
  kind: TxnKind
  /** `YYYY-MM-DD`, inclusive */
  start: string
  end: string
  categories: Category[]
  names: UserNames
  onSelect: (t: LedgerRow) => void
  /** Bump after an add/edit/delete; the list re-fetches what it has loaded. */
  refreshToken: number
}

/**
 * Every transaction behind one breakdown row for a period, paged from the
 * server. Header figures come from the summary row (the RPC), not the list.
 */
export function CategoryTransactionsSheet({
  open,
  onOpenChange,
  category,
  periodLabel,
  ...rest
}: Omit<ListProps, 'category'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: CategoryTotal | null
  /** e.g. "September 2026" or "2026" */
  periodLabel: string
}) {
  const count = category?.count ?? 0
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <div className="flex items-start gap-3">
            {category && <CategoryIcon icon={category.icon} color={category.color} />}
            <div className="min-w-0 flex-1 space-y-0.5">
              <SheetTitle className="break-words">{category?.name ?? 'Category'}</SheetTitle>
              <SheetDescription>
                {periodLabel} · {count} {count === 1 ? 'transaction' : 'transactions'}
                {category ? ` · ${Math.round(category.share * 100)}% of ${rest.kind === 'income' ? 'income' : 'spending'}` : ''}
              </SheetDescription>
            </div>
          </div>
          {category && (
            <MoneyWords
              amount={category.total}
              label={`${category.name} · ${periodLabel}`}
              align="start"
              className={cn(
                'self-start text-xl font-semibold tabular-nums',
                rest.kind === 'income' ? 'text-success' : 'text-foreground',
              )}
            />
          )}
        </SheetHeader>
        <SheetBody>{open && category && <CategoryTransactionList category={category} {...rest} />}</SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function CategoryTransactionList({ category, kind, start, end, categories, names, onSelect, refreshToken }: ListProps) {
  const key = [start, end, kind, category.id].join('|')
  const list = useInfiniteList<LedgerRow>(
    async (offset, limit, signal) => {
      const rows = await listTransactionsPage(
        { start, end, offset, limit, filters: { kind, categoryId: category.id }, lookup: { categories, names } },
        signal,
      )
      return withNames(rows, names)
    },
    key,
    { errorLabel: 'Failed to load transactions' },
  )

  const { reload } = list
  useEffect(() => {
    if (refreshToken > 0) reload()
  }, [refreshToken, reload])

  const groups = useMemo(() => groupByDay(list.items), [list.items])

  return (
    <div className="space-y-3">
      {list.loading ? (
        <ListSkeleton rows={6} />
      ) : list.items.length === 0 ? (
        list.error ? null : (
          <EmptyState title="No transactions left here" description="They may have been moved or deleted." />
        )
      ) : (
        <DayGroups groups={groups} onSelect={onSelect} />
      )}

      {!list.loading && (
        <LoadMoreSentinel
          sentinelRef={list.sentinelRef}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          error={list.error}
          onRetry={list.items.length === 0 ? reload : list.loadMore}
          rows={3}
          endLabel={list.items.length > DEFAULT_PAGE_SIZE ? 'That’s everything in this category' : undefined}
        />
      )}
    </div>
  )
}
