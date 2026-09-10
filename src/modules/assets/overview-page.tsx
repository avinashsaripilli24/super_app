import { useMemo, useReducer, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { Activity, CalendarClock, Download, Plus, RefreshCw, Settings2, Target } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { MoneyWords } from '@/components/ui/money'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, formatMoney } from '@/lib/utils'
import {
  EMPTY_OVERVIEW,
  fetchAssetsOverview,
  formatPct,
  listAssetCategories,
  listUserNames,
  monthKey,
  toClassBreakdown,
  type MaturingHolding,
  type OverviewCategory,
} from '@/modules/assets/api'
import { AssetsExportSheet } from '@/modules/assets/components/export-sheet'
import { HoldingList } from '@/modules/assets/components/holding-list'
import { HoldingSheet } from '@/modules/assets/components/holding-sheet'
import { UpdateValuesSheet } from '@/modules/assets/components/update-values-sheet'
import { CategoryBreakdown } from '@/modules/expenses/components/category-breakdown'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { StatTile } from '@/modules/expenses/components/stat-tile'

const EMPTY_NAMES = new Map<string, string>()
const EVERYONE = 'all'

export function AssetsOverviewPage() {
  const search = useSearch({ from: '/_authed/_assetsLock/assets' })
  const navigate = useNavigate()
  const holder = search.holder

  const { data, loading, reload } = useAsyncData(
    async () => {
      const [overview, categories, names] = await Promise.all([
        fetchAssetsOverview(holder),
        listAssetCategories(),
        listUserNames(),
      ])
      return { overview, categories, names }
    },
    holder ?? EVERYONE,
    'Failed to load assets',
  )
  const overview = data?.overview ?? EMPTY_OVERVIEW
  const categories = data?.categories ?? []
  const names = data?.names ?? EMPTY_NAMES
  const people = useMemo(() => [...names.entries()].sort((a, b) => a[1].localeCompare(b[1])), [names])
  const allocation = useMemo(() => toClassBreakdown(overview), [overview])
  const assetTypes = overview.by_category.filter((c) => c.kind === 'asset')
  const debtTypes = overview.by_category.filter((c) => c.kind === 'debt')
  const netWorth = overview.assets - overview.debts

  // The holdings list pages on its own; bump this after a write so it re-fetches.
  const [listToken, bumpList] = useReducer((n: number) => n + 1, 0)
  const refreshAll = () => {
    reload()
    bumpList()
  }

  const [sheetOpen, setSheetOpen] = useState(false)
  const [valuesOpen, setValuesOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const setHolder = (id: string) => void navigate({ to: '/assets', search: id === EVERYONE ? {} : { holder: id } })
  const openHolding = (id: string) => void navigate({ to: '/assets/holdings/$holdingId', params: { holdingId: id } })

  return (
    // Bottom padding keeps the last row clear of the floating + button.
    <div className="space-y-4 pb-16 md:pb-0">
      <div className="flex items-center gap-2">
        <Select value={holder ?? EVERYONE} onValueChange={setHolder}>
          <SelectTrigger aria-label="Holder" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EVERYONE}>Whole household</SelectItem>
            {people.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download /> Export
        </Button>
      </div>

      {/* Totals: net worth leads, assets and debts sit under it. Three money
          tiles across a phone clipped lakh/crore figures. */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <MoneyWords
            amount={netWorth}
            label="Net worth"
            className="block w-full rounded-xl border bg-card p-4 text-left no-underline transition-colors hover:bg-accent/40 active:bg-accent"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Net worth</p>
            <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums', netWorth < 0 && 'text-destructive')}>
              {formatMoney(netWorth)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {overview.holdings_count} holding{overview.holdings_count === 1 ? '' : 's'}
              {overview.invested > 0 ? ` · ${formatPct(overview.gain / overview.invested)} overall` : ''}
            </p>
          </MoneyWords>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Assets" value={formatMoney(overview.assets)} amount={overview.assets} tone="success" />
            <StatTile label="Debts" value={formatMoney(overview.debts)} amount={overview.debts} tone="destructive" />
          </div>
        </div>
      )}

      {!loading && (
        <button
          type="button"
          onClick={() => setValuesOpen(true)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-accent/60',
            overview.stale_count > 0 ? 'border-warning/50 bg-warning/10' : 'bg-card',
          )}
        >
          <RefreshCw className={cn('size-3.5 shrink-0', overview.stale_count > 0 ? 'text-warning' : 'text-muted-foreground')} />
          <span className="min-w-0 flex-1 truncate">
            {overview.stale_count > 0
              ? `${overview.stale_count} asset${overview.stale_count === 1 ? '' : 's'} not valued in the last 30 days`
              : overview.last_valued_on
                ? `Values last updated ${format(parseISO(overview.last_valued_on), 'd MMM')}`
                : 'No values recorded yet'}
          </span>
          <span className="shrink-0 font-medium text-primary">Update values</span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/assets/activity">
            <Activity /> Activity
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/assets/types">
            <Settings2 /> Types
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/assets/targets">
            <Target /> Targets
          </Link>
        </Button>
      </div>

      {/* Assets by type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Assets by type</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-2 px-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : assetTypes.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">No assets yet. Tap + to add the first one.</p>
          ) : (
            <ul className="divide-y">
              {assetTypes.map((c) => (
                <li key={c.id}>
                  <TypeRow c={c} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Debts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Debts</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-2 px-4">
              <Skeleton className="h-12" />
            </div>
          ) : debtTypes.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">Nothing owed. Add a loan or card with the + button.</p>
          ) : (
            <ul className="divide-y">
              {debtTypes.map((c) => (
                <li key={c.id}>
                  <TypeRow c={c} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Allocation + holders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Asset allocation</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <CategoryBreakdown rows={allocation} emptyText="No assets with a value yet." />
          )}
        </CardContent>
      </Card>

      {!holder && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By holder</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : overview.by_holder.length === 0 ? (
              <p className="text-sm text-muted-foreground">No holdings yet.</p>
            ) : (
              <ul className="divide-y">
                {overview.by_holder.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setHolder(h.id)}
                        className="truncate font-medium text-primary hover:underline"
                      >
                        {names.get(h.id) ?? 'Unknown'}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {h.count} holding{h.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums sm:text-sm">
                      <p>
                        <MoneyWords amount={h.assets - h.debts} label={`${names.get(h.id) ?? 'Unknown'} · net`} align="end" className="font-medium" />
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-success">{formatMoney(h.assets)}</span>
                        {h.debts > 0 && <span className="text-destructive"> − {formatMoney(h.debts)}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Maturing soon */}
      {!loading && overview.maturing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-muted-foreground" /> Maturing soon
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {overview.maturing.map((m) => (
                <li key={m.id}>
                  <MaturingRow m={m} onOpen={openHolding} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Holdings */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Holdings</h3>
        {loading ? (
          <ListSkeleton rows={6} />
        ) : (
          <HoldingList fixed={{ holderId: holder }} names={names} refreshToken={listToken} />
        )}
      </section>

      {/* FAB */}
      <Button
        size="icon"
        aria-label="Add holding"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-full shadow-lg keyboard-open:hidden md:bottom-6 md:right-6"
      >
        <Plus className="size-6" />
      </Button>

      <HoldingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={categories}
        people={names}
        onSaved={(id) => {
          refreshAll()
          openHolding(id)
        }}
      />
      <UpdateValuesSheet open={valuesOpen} onOpenChange={setValuesOpen} names={names} onSaved={refreshAll} />
      <AssetsExportSheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        month={monthKey(new Date())}
        year={new Date().getFullYear()}
        defaultScope="year"
      />
    </div>
  )
}

/** One type with its current total, and progress towards its target (assets) or payoff (debts). */
function TypeRow({ c }: { c: OverviewCategory }) {
  const isAsset = c.kind === 'asset'
  const pct = isAsset
    ? c.target && c.target > 0
      ? Math.min(1, c.current / c.target)
      : null
    : c.invested > 0
      ? Math.min(1, Math.max(0, 1 - c.current / c.invested))
      : null
  const ret = isAsset && c.invested > 0 ? c.gain / c.invested : null
  return (
    <Link
      to="/assets/types/$typeId"
      params={{ typeId: c.id }}
      className="block px-4 py-2.5 transition-colors hover:bg-accent/60 active:bg-accent"
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={c.icon} color={c.color} size="sm" />
        <div className="min-w-0 flex-1">
          {/* Wraps: "Post Office Schemes (NSC/KVP/SSY/SCSS)" must stay readable. */}
          <p className="break-words text-sm font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {c.holdings_count} holding{c.holdings_count === 1 ? '' : 's'}
            {isAsset && ret !== null && (
              <>
                {' · '}
                <span className={ret < 0 ? 'text-destructive' : 'text-success'}>{formatPct(ret)}</span>
              </>
            )}
            {!isAsset && pct !== null && ` · ${Math.round(pct * 100)}% repaid`}
          </p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <p className={cn('text-sm font-semibold tabular-nums', !isAsset && 'text-destructive')}>{formatMoney(c.current)}</p>
          {isAsset && c.target !== null && (
            <p className="text-xs text-muted-foreground">of {formatMoney(c.target)}</p>
          )}
        </div>
      </div>
      {pct !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', isAsset ? (pct >= 1 ? 'bg-success' : 'bg-primary') : 'bg-success')}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </Link>
  )
}

function MaturingRow({ m, onOpen }: { m: MaturingHolding; onOpen: (id: string) => void }) {
  const days = differenceInCalendarDays(parseISO(m.maturity_on), new Date())
  const when = days < 0 ? 'Matured' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
  return (
    <button
      type="button"
      onClick={() => onOpen(m.id)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
    >
      <CategoryIcon icon={m.category_icon} color={m.category_color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{m.name}</p>
        <p className="text-xs text-muted-foreground">
          {m.category_name} · {format(parseISO(m.maturity_on), 'd MMM yyyy')}
        </p>
      </div>
      <div className="shrink-0 whitespace-nowrap text-right">
        <p className="text-sm font-semibold tabular-nums">{formatMoney(m.current)}</p>
        <p className={cn('text-xs', days < 0 ? 'text-warning' : 'text-muted-foreground')}>{when}</p>
      </div>
    </button>
  )
}
