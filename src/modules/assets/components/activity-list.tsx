import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Search } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { LoadMoreSentinel } from '@/components/ui/load-more-sentinel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { DEFAULT_PAGE_SIZE, useInfiniteList } from '@/hooks/use-infinite-list'
import { cn, formatMoney } from '@/lib/utils'
import {
  listActivityPage,
  withActivityNames,
  type ActivityFilters,
  type ActivityRow,
  type AssetCategory,
  type AssetKind,
  type UserNames,
} from '@/modules/assets/api'
import { TXN_SIGN, TXN_TONE, TXN_TYPE_SHORT } from '@/modules/assets/labels'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'

/**
 * Transactions across every holding in `[start, end]`, newest first, 25 per
 * page as the user scrolls. Filters are pushed into the query; rows are
 * grouped by day on the client.
 */
export function ActivityList({
  start,
  end,
  periodLabel,
  categories,
  names,
  onSelect,
  refreshToken,
}: {
  start: string
  end: string
  /** e.g. "this month" / "in 2026" for the empty state. */
  periodLabel: string
  categories: AssetCategory[]
  names: UserNames
  onSelect: (row: ActivityRow) => void
  refreshToken: number
}) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | AssetKind>('all')
  const [categoryId, setCategoryId] = useState('all')
  const [holderId, setHolderId] = useState('all')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const filterCategories = useMemo(
    () => (kind === 'all' ? categories : categories.filter((c) => c.kind === kind)),
    [categories, kind],
  )
  const changeKind = (v: 'all' | AssetKind) => {
    setKind(v)
    if (v !== 'all' && categoryId !== 'all' && !categories.some((c) => c.id === categoryId && c.kind === v)) {
      setCategoryId('all')
    }
  }

  const filters = useMemo<ActivityFilters>(
    () => ({
      kind: kind === 'all' ? undefined : kind,
      categoryId: categoryId === 'all' ? undefined : categoryId,
      holderId: holderId === 'all' ? undefined : holderId,
      search: debouncedSearch || undefined,
    }),
    [kind, categoryId, holderId, debouncedSearch],
  )
  const hasFilters = !!(filters.kind || filters.categoryId || filters.holderId || filters.search)
  const key = [start, end, kind, categoryId, holderId, debouncedSearch.toLowerCase()].join('|')

  const list = useInfiniteList<ActivityRow>(
    async (offset, limit, signal) => {
      const rows = await listActivityPage({ start, end, offset, limit, filters }, signal)
      return withActivityNames(rows, names)
    },
    key,
    { errorLabel: 'Failed to load activity' },
  )

  const { reload } = list
  useEffect(() => {
    if (refreshToken > 0) reload()
  }, [refreshToken, reload])

  const groups = useMemo(() => {
    const out: { day: string; items: ActivityRow[] }[] = []
    for (const t of list.items) {
      const last = out[out.length - 1]
      if (last && last.day === t.occurred_on) last.items.push(t)
      else out.push({ day: t.occurred_on, items: [t] })
    }
    return out
  }, [list.items])

  const people = useMemo(() => [...names.entries()].sort((a, b) => a[1].localeCompare(b[1])), [names])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search holdings or notes"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Kind and holder are short; the type names are long, so that one
            gets a full-width row of its own on a phone. */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onValueChange={(v) => changeKind(v as typeof kind)}>
            <SelectTrigger aria-label="Kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="asset">Assets</SelectItem>
              <SelectItem value="debt">Debts</SelectItem>
            </SelectContent>
          </Select>
          <Select value={holderId} onValueChange={setHolderId}>
            <SelectTrigger aria-label="Holder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {people.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {filterCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.loading ? (
        <ListSkeleton rows={6} />
      ) : list.items.length === 0 ? (
        list.error ? null : (
          <EmptyState
            title={hasFilters ? 'Nothing matches your filters' : `No transactions ${periodLabel}`}
            description={
              hasFilters ? 'Try clearing the search or filters.' : 'Open a holding to record a buy, sale or repayment.'
            }
          />
        )
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day}>
              <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {format(parseISO(g.day), 'EEE, d MMM')}
              </h3>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {g.items.map((t) => {
                  const tone = TXN_TONE[t.type]
                  const qty = t.quantity !== null ? Number(t.quantity) : null
                  return (
                    <li key={t.id} data-id={t.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(t)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
                      >
                        <CategoryIcon icon={t.holding.category.icon} color={t.holding.category.color} />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium">{t.holding.name}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">{TXN_TYPE_SHORT[t.type]}</span>
                            {` · ${t.holder_name}`}
                            {qty !== null && t.unit_price !== null
                              ? ` · ${qty} @ ${formatMoney(Number(t.unit_price))}`
                              : qty !== null
                                ? ` · ${qty} units`
                                : ''}
                            {t.note ? ` · ${t.note}` : ''}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums',
                            tone === 'success' && 'text-success',
                            tone === 'destructive' && 'text-destructive',
                          )}
                        >
                          {TXN_SIGN[t.type]}
                          {formatMoney(Number(t.amount))}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!list.loading && (
        <LoadMoreSentinel
          sentinelRef={list.sentinelRef}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          error={list.error}
          onRetry={list.items.length === 0 ? reload : list.loadMore}
          rows={3}
          endLabel={list.items.length > DEFAULT_PAGE_SIZE ? `That’s everything ${periodLabel}` : undefined}
        />
      )}
    </div>
  )
}
