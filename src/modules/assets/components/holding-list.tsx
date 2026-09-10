import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { LoadMoreSentinel } from '@/components/ui/load-more-sentinel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { DEFAULT_PAGE_SIZE, useInfiniteList } from '@/hooks/use-infinite-list'
import { cn, formatMoney } from '@/lib/utils'
import {
  absReturn,
  formatPct,
  listHoldingsPage,
  payoffPct,
  type AssetKind,
  type HoldingFilters,
  type HoldingRow,
  type HoldingStatus,
  type UserNames,
} from '@/modules/assets/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'

type StatusFilter = HoldingStatus | 'all'

/**
 * Server-paged list of holdings (today's figures), largest first. Filters not
 * pinned by `fixed` are offered as controls; rows link to the holding page.
 */
export function HoldingList({
  fixed = {},
  names,
  refreshToken,
  emptyTitle = 'No holdings yet',
  emptyDescription = 'Tap the + button to add the first one.',
}: {
  /** Filters decided by the page (type detail, holder view…). */
  fixed?: { kind?: AssetKind; categoryId?: string; holderId?: string }
  names: UserNames
  /** Bump after an add/edit/delete; the list re-fetches what it has loaded. */
  refreshToken: number
  emptyTitle?: string
  emptyDescription?: ReactNode
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [kind, setKind] = useState<'all' | AssetKind>('all')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const filters = useMemo<HoldingFilters>(
    () => ({
      kind: fixed.kind ?? (kind === 'all' ? undefined : kind),
      categoryId: fixed.categoryId,
      holderId: fixed.holderId,
      status: status === 'all' ? undefined : status,
      search: debouncedSearch || undefined,
    }),
    [fixed.kind, fixed.categoryId, fixed.holderId, kind, status, debouncedSearch],
  )
  const hasFilters = !!(filters.search || (!fixed.kind && kind !== 'all') || status !== 'active')
  const key = [fixed.kind, fixed.categoryId, fixed.holderId, kind, status, debouncedSearch.toLowerCase()].join('|')

  const list = useInfiniteList<HoldingRow>(
    (offset, limit, signal) => listHoldingsPage({ offset, limit, filters }, signal),
    key,
    { errorLabel: 'Failed to load holdings' },
  )

  const { reload } = list
  useEffect(() => {
    if (refreshToken > 0) reload()
  }, [refreshToken, reload])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, institution or folio"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={cn('grid gap-2', fixed.kind ? 'grid-cols-1' : 'grid-cols-2')}>
          {!fixed.kind && (
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger aria-label="Kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Assets and debts</SelectItem>
                <SelectItem value="asset">Assets</SelectItem>
                <SelectItem value="debt">Debts</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.loading ? (
        <ListSkeleton rows={6} />
      ) : list.items.length === 0 ? (
        list.error ? null : (
          <EmptyState
            title={hasFilters ? 'Nothing matches your filters' : emptyTitle}
            description={hasFilters ? 'Try clearing the search or filters.' : emptyDescription}
          />
        )
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.items.map((h) => (
            <li key={h.id} data-id={h.id}>
              <HoldingRowLink row={h} holderName={names.get(h.holder_id ?? h.user_id) ?? 'Unknown'} />
            </li>
          ))}
        </ul>
      )}

      {!list.loading && (
        <LoadMoreSentinel
          sentinelRef={list.sentinelRef}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          error={list.error}
          onRetry={list.items.length === 0 ? reload : list.loadMore}
          rows={3}
          endLabel={list.items.length > DEFAULT_PAGE_SIZE ? 'That’s every holding' : undefined}
        />
      )}
    </div>
  )
}

function HoldingRowLink({ row: h, holderName }: { row: HoldingRow; holderName: string }) {
  const ret = absReturn(h)
  const payoff = payoffPct(h)
  const meta = [h.category_name, holderName, h.institution].filter(Boolean).join(' · ')
  return (
    <Link
      to="/assets/holdings/$holdingId"
      params={{ holdingId: h.id }}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
    >
      <CategoryIcon icon={h.category_icon} color={h.category_color} />
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2 text-sm font-medium">
          <span className="min-w-0 break-words">{h.name}</span>
          {h.status === 'closed' && <Badge variant="outline">Closed</Badge>}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="shrink-0 whitespace-nowrap text-right">
        <p className={cn('text-sm font-semibold tabular-nums', h.kind === 'debt' && 'text-destructive')}>
          {formatMoney(h.current_value)}
        </p>
        {h.kind === 'asset' ? (
          <p
            className={cn(
              'text-xs tabular-nums',
              ret === null ? 'text-muted-foreground' : ret < 0 ? 'text-destructive' : 'text-success',
            )}
          >
            {ret === null ? 'no return yet' : formatPct(ret)}
          </p>
        ) : (
          <p className="text-xs tabular-nums text-muted-foreground">
            {payoff === null ? 'outstanding' : `${Math.round(payoff * 100)}% repaid`}
          </p>
        )}
      </div>
    </Link>
  )
}
