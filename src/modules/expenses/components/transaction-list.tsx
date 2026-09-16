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
  groupByDay,
  listTransactionsPage,
  monthRange,
  withNames,
  type Category,
  type DayGroup,
  type LedgerRow,
  type TransactionFilters,
  type TxnKind,
  type UserNames,
} from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'

/**
 * Month transaction list (shared ledger). Pages come from the server 25 at a
 * time as the user scrolls; filters are pushed into the query and grouped by
 * day on the client.
 */
export function TransactionList({
  month,
  categories,
  names,
  onSelect,
  refreshToken,
}: {
  /** `YYYY-MM` */
  month: string
  categories: Category[]
  names: UserNames
  onSelect: (t: LedgerRow) => void
  /** Bump after an add/edit/delete; the list re-fetches what it has loaded. */
  refreshToken: number
}) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | TxnKind>('all')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [personId, setPersonId] = useState<string>('all')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const filterCategories = useMemo(
    () => (kind === 'all' ? categories : categories.filter((c) => c.kind === kind)),
    [categories, kind],
  )
  const changeKind = (v: 'all' | TxnKind) => {
    setKind(v)
    if (v !== 'all' && categoryId !== 'all' && !categories.some((c) => c.id === categoryId && c.kind === v)) {
      setCategoryId('all')
    }
  }

  const filters = useMemo<TransactionFilters>(
    () => ({
      kind: kind === 'all' ? undefined : kind,
      categoryId: categoryId === 'all' ? undefined : categoryId,
      personId: personId === 'all' ? undefined : personId,
      search: debouncedSearch || undefined,
    }),
    [kind, categoryId, personId, debouncedSearch],
  )
  const hasFilters = !!(filters.kind || filters.categoryId || filters.personId || filters.search)
  const key = [month, kind, categoryId, personId, debouncedSearch.toLowerCase()].join('|')

  const list = useInfiniteList<LedgerRow>(
    async (offset, limit, signal) => {
      const { start, end } = monthRange(month)
      const rows = await listTransactionsPage(
        { start, end, offset, limit, filters, lookup: { categories, names } },
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

  const people = useMemo(() => [...names.entries()].sort((a, b) => a[1].localeCompare(b[1])), [names])

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search notes, categories or people"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={kind} onValueChange={(v) => changeKind(v as typeof kind)}>
            <SelectTrigger aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Types</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Categories</SelectItem>
              {filterCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={personId} onValueChange={setPersonId}>
            <SelectTrigger aria-label="Person">
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
      </div>

      {list.loading ? (
        <ListSkeleton rows={6} />
      ) : list.items.length === 0 ? (
        list.error ? null : (
          <EmptyState
            title={hasFilters ? 'Nothing matches your filters' : 'No transactions this month'}
            description={hasFilters ? 'Try clearing the search or filters.' : 'Tap the + button to add the first one.'}
          />
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
          endLabel={list.items.length > DEFAULT_PAGE_SIZE ? 'That’s everything for this month' : undefined}
        />
      )}
    </div>
  )
}

/** Day headings, each over a card of tappable transaction rows. */
export function DayGroups({ groups, onSelect }: { groups: DayGroup[]; onSelect: (t: LedgerRow) => void }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {format(parseISO(g.day), 'EEE, d MMM')}
          </h3>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {g.items.map((t) => (
              <li key={t.id} data-id={t.id}>
                <TransactionRow t={t} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function TransactionRow({ t, onSelect }: { t: LedgerRow; onSelect: (t: LedgerRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(t)}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
    >
      <CategoryIcon icon={t.category?.icon} color={t.category?.color} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{t.note || t.category?.name || 'Transaction'}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {t.kind === 'income' ? <IncomeMeta t={t} /> : <ExpenseMeta t={t} />}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums',
          t.kind === 'income' ? 'text-success' : 'text-foreground',
        )}
      >
        {t.kind === 'income' ? '+' : '−'}
        {formatMoney(Number(t.amount), t.currency)}
      </span>
    </button>
  )
}

/** `Added by · Category · METHOD` */
function ExpenseMeta({ t }: { t: LedgerRow }) {
  return (
    <>
      <span className="font-medium text-foreground/80">{t.added_by}</span>
      {` · ${t.category?.name ?? 'Uncategorised'}`}
      {t.payment_method ? ` · ${t.payment_method.toUpperCase()}` : ''}
    </>
  )
}

/** `Earned by · Category · added by X` (or the method when the earner added it). */
function IncomeMeta({ t }: { t: LedgerRow }) {
  const earner = t.earned_by_name ?? t.added_by
  const addedByOther = t.added_by !== earner
  return (
    <>
      <span className="font-medium text-foreground/80">{earner}</span>
      {` · ${t.category?.name ?? 'Uncategorised'}`}
      {addedByOther ? ` · added by ${t.added_by}` : t.payment_method ? ` · ${t.payment_method.toUpperCase()}` : ''}
    </>
  )
}
