import { useMemo, useReducer, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { format } from 'date-fns'
import { BarChart3, Download, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { MoneyWords } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  EMPTY_ACTIVITY,
  canEdit,
  deleteHoldingTransaction,
  fetchAssetsActivity,
  fetchNetworthHistory,
  listAssetCategories,
  listUserNames,
  monthKey,
  monthRange,
  toFlowSeries,
  toNetworthSeries,
  yearRange,
  type ActivityRow,
} from '@/modules/assets/api'
import { ActivityList } from '@/modules/assets/components/activity-list'
import { AssetsExportSheet } from '@/modules/assets/components/export-sheet'
import { HoldingTxnSheet } from '@/modules/assets/components/holding-txn-sheet'
import { PairedBars } from '@/modules/assets/components/paired-bars'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { MonthSwitcher } from '@/modules/expenses/components/month-switcher'
import { StatTile } from '@/modules/expenses/components/stat-tile'
import { YearSwitcher } from '@/modules/expenses/components/year-switcher'
import { useAuthStore } from '@/store/auth-store'

const EMPTY_NAMES = new Map<string, string>()

export function AssetsActivityPage() {
  const search = useSearch({ from: '/_authed/_assetsLock/assets/activity' })
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const currentYear = new Date().getFullYear()
  const currentMonth = monthKey(new Date())
  const view: 'month' | 'year' = search.view ?? 'month'
  const month = search.month ?? currentMonth
  const year = search.year ?? currentYear
  const range = view === 'month' ? monthRange(month) : yearRange(year)
  const periodLabel = view === 'month' ? 'this month' : `in ${year}`

  const { data, loading, reload } = useAsyncData(
    async () => {
      const [activity, categories, names, history] = await Promise.all([
        fetchAssetsActivity(range.start, range.end),
        listAssetCategories(),
        listUserNames(),
        view === 'year' ? fetchNetworthHistory(year) : Promise.resolve([]),
      ])
      return { activity, categories, names, history }
    },
    `${view}|${month}|${year}`,
    'Failed to load activity',
  )
  const activity = data?.activity ?? EMPTY_ACTIVITY
  const categories = data?.categories ?? []
  const names = data?.names ?? EMPTY_NAMES
  const networthSeries = useMemo(() => toNetworthSeries(data?.history ?? [], year), [data, year])
  const flowSeries = useMemo(() => toFlowSeries(activity, year), [activity, year])

  const [listToken, bumpList] = useReducer((n: number) => n + 1, 0)
  const refreshAll = () => {
    reload()
    bumpList()
  }

  const [exportOpen, setExportOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)
  const [editing, setEditing] = useState<ActivityRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ActivityRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const goMonth = (m: string) =>
    void navigate({ to: '/assets/activity', search: m === currentMonth ? {} : { month: m } })
  const goYear = (y: number) =>
    void navigate({ to: '/assets/activity', search: y === currentYear ? { view: 'year' } : { view: 'year', year: y } })

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteHoldingTransaction(confirmDelete.id)
      toast.success('Transaction deleted')
      setConfirmDelete(null)
      setTxnOpen(false)
      refreshAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const toggleItem = (key: 'month' | 'year', label: string) => (
    <Link
      to="/assets/activity"
      search={
        key === 'month'
          ? month === currentMonth
            ? {}
            : { month }
          : year === currentYear
            ? { view: 'year' }
            : { view: 'year', year }
      }
      className={cn(
        'rounded-md py-1.5 text-center text-sm font-medium transition-colors',
        view === key ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {toggleItem('month', 'Month')}
            {toggleItem('year', 'Year')}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download /> Export
        </Button>
      </div>

      {view === 'month' ? (
        <MonthSwitcher value={month} onChange={goMonth} />
      ) : (
        <YearSwitcher value={year} onChange={goYear} />
      )}

      {/* Flow totals: two across on a phone so lakh figures stay readable. */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Invested" value={formatMoney(activity.invested)} amount={activity.invested} />
          <StatTile label="Redeemed" value={formatMoney(activity.redeemed)} amount={activity.redeemed} tone="success" />
          <StatTile label="Income" value={formatMoney(activity.income)} amount={activity.income} tone="success" />
          <StatTile label="Borrowed" value={formatMoney(activity.borrowed)} amount={activity.borrowed} tone="destructive" />
          <StatTile label="Repaid" value={formatMoney(activity.repaid)} amount={activity.repaid} />
          <StatTile
            label="Interest paid"
            value={formatMoney(activity.interest_paid)}
            amount={activity.interest_paid}
            tone="destructive"
          />
        </div>
      )}

      {view === 'year' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-muted-foreground" /> Net worth trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <PairedBars
                  data={networthSeries}
                  series={{
                    a: { name: 'Assets', cssVar: '--chart-assets', swatchClass: 'bg-chart-assets' },
                    b: { name: 'Debts', cssVar: '--chart-debts', swatchClass: 'bg-chart-debts' },
                  }}
                  title={`Assets and debts at each month end of ${year}`}
                  emptyText="No holdings valued this year"
                  readout={(r) => (
                    <span className="flex gap-3 tabular-nums">
                      <span>
                        <span className="text-muted-foreground">Net worth </span>
                        {formatMoney((r.a ?? 0) - (r.b ?? 0))}
                      </span>
                      <span className="hidden sm:inline">
                        <span className="text-muted-foreground">Assets </span>
                        {formatMoney(r.a ?? 0)}
                      </span>
                      <span className="hidden sm:inline">
                        <span className="text-muted-foreground">Debts </span>
                        {formatMoney(r.b ?? 0)}
                      </span>
                    </span>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="size-4 text-muted-foreground" /> Money into and out of assets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <PairedBars
                  data={flowSeries}
                  series={{
                    a: { name: 'Invested', cssVar: '--chart-income', swatchClass: 'bg-chart-income' },
                    b: { name: 'Redeemed + income', cssVar: '--chart-spent', swatchClass: 'bg-chart-spent' },
                  }}
                  title={`Invested versus redeemed per month of ${year}`}
                  emptyText="No asset transactions this year"
                  onSelect={goMonth}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* By type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">By type</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : activity.by_category.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions {periodLabel}.</p>
          ) : (
            <ul className="divide-y">
              {activity.by_category.map((c) => {
                const isAsset = c.kind === 'asset'
                const inAmt = isAsset ? c.invested : c.borrowed + c.charged
                const outAmt = isAsset ? c.redeemed + c.income : c.repaid
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.count} transaction{c.count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums">
                      {inAmt > 0 && (
                        <p className={isAsset ? 'text-foreground' : 'text-destructive'}>
                          <MoneyWords amount={inAmt} label={`${c.name} · ${isAsset ? 'invested' : 'borrowed'}`} align="end">
                            {`${isAsset ? '−' : '+'}${formatMoney(inAmt)}`}
                          </MoneyWords>{' '}
                          <span className="text-muted-foreground">{isAsset ? 'invested' : 'borrowed'}</span>
                        </p>
                      )}
                      {outAmt > 0 && (
                        <p className="text-success">
                          <MoneyWords amount={outAmt} label={`${c.name} · ${isAsset ? 'redeemed' : 'repaid'}`} align="end">
                            {`${isAsset ? '+' : '−'}${formatMoney(outAmt)}`}
                          </MoneyWords>{' '}
                          <span className="text-muted-foreground">{isAsset ? 'redeemed' : 'repaid'}</span>
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Transactions</h3>
        {loading ? (
          <ListSkeleton rows={6} />
        ) : (
          <ActivityList
            start={range.start}
            end={range.end}
            periodLabel={periodLabel}
            categories={categories}
            names={names}
            onSelect={(row) => {
              setEditing(row)
              setTxnOpen(true)
            }}
            refreshToken={listToken}
          />
        )}
      </section>

      <HoldingTxnSheet
        open={txnOpen}
        onOpenChange={setTxnOpen}
        holding={
          editing
            ? {
                id: editing.holding.id,
                name: editing.holding.name,
                kind: editing.holding.category.kind,
                valuation_mode: editing.holding.category.valuation_mode,
                unit_price: null,
              }
            : null
        }
        editing={editing}
        readOnly={!!editing && !canEdit(editing, profile)}
        addedBy={editing?.added_by}
        onSaved={refreshAll}
        onDelete={() => editing && setConfirmDelete(editing)}
      />

      <AssetsExportSheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        month={month}
        year={year}
        defaultScope={view}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this transaction?"
        description={`${confirmDelete ? format(new Date(confirmDelete.occurred_on), 'd MMM yyyy') : ''} · ${confirmDelete?.holding.name ?? ''}. This changes the holding’s figures and cannot be undone.`}
        tone="destructive"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}
