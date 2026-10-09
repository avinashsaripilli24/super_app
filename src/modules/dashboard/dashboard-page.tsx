import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowRight, Landmark, LockKeyhole, TrendingDown, TrendingUp, Wallet } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MoneyWords } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { locksEnabled } from '@/lib/app-lock'
import { cn, formatCompactINR, formatMoney } from '@/lib/utils'
import { fetchAssetsOverview } from '@/modules/assets/api'
import {
  fetchLedgerSummary,
  listBudgetsForMonth,
  monthKey,
  monthRange,
  toMonthSummary,
} from '@/modules/expenses/api'
import { RecurringReminder } from '@/modules/expenses/components/recurring-reminder'
import { modulesForRole } from '@/modules/registry'
import { useAuthStore } from '@/store/auth-store'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const profile = useAuthStore((s) => s.profile)
  const tiles = modulesForRole(profile?.role).filter((m) => m.onDashboard)

  const { data, loading, reload } = useAsyncData(
    async () => {
      const key = monthKey(new Date())
      const { start, end } = monthRange(key)
      // Asset figures sit behind the Assets lock: only fetched here when the
      // locks are off (dev server without VITE_APP_LOCK).
      const [s, b, nw] = await Promise.all([
        fetchLedgerSummary(start, end),
        listBudgetsForMonth(key),
        locksEnabled ? null : fetchAssetsOverview(),
      ])
      return {
        summary: toMonthSummary(s),
        budget: Number(b.find((x) => x.category_id === null)?.amount ?? 0),
        networth: nw && { assets: nw.assets, debts: nw.debts, count: nw.holdings_count },
      }
    },
    'dashboard',
    'Failed to load this month',
  )
  const summary = data?.summary
  const budget = data?.budget ?? 0
  const networth = data?.networth

  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()}</p>
        <h2 className="text-2xl font-semibold tracking-tight">{firstName ?? 'there'} 👋</h2>
      </div>

      <RecurringReminder onAdded={reload} />

      {/* This month */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wallet className="size-4 text-muted-foreground" /> {format(new Date(), 'MMMM')} so far
          </CardTitle>
          <Link to="/expenses" className="flex items-center gap-1 text-xs font-medium text-primary">
            Open <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {loading || !summary ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={TrendingDown} label="Spent" value={formatMoney(summary.spent)} tone="destructive" />
                <Stat icon={TrendingUp} label="Income" value={formatMoney(summary.income)} tone="success" />
              </div>
              {budget > 0 && (
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        summary.spent >= budget
                          ? 'bg-destructive'
                          : summary.spent >= budget * 0.8
                            ? 'bg-warning'
                            : 'bg-primary',
                      )}
                      style={{ width: `${Math.min(100, (summary.spent / budget) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {summary.spent > budget
                      ? `${formatMoney(summary.spent - budget)} over your ${formatMoney(budget)} budget`
                      : `${formatMoney(budget - summary.spent)} left of your ${formatMoney(budget)} budget`}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Net worth */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Landmark className="size-4 text-muted-foreground" /> Net worth
          </CardTitle>
          <Link to="/assets" className="flex items-center gap-1 text-xs font-medium text-primary">
            Open <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {locksEnabled ? (
            // Masked: the figures only show inside Assets, behind its PIN / fingerprint lock.
            <Link to="/assets" className="block space-y-3" aria-label="Unlock Assets to see your net worth">
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={TrendingUp} label="Assets" value="₹ ••••" tone="success" />
                <Stat icon={TrendingDown} label="Debts" value="₹ ••••" tone="destructive" />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5 shrink-0" /> Unlock Assets to see your net worth
              </p>
            </Link>
          ) : loading || !networth ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : networth.count === 0 ? (
            <p className="text-sm text-muted-foreground">Add your first asset or loan to see the household net worth.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Lakh/crore figures overflow the small boxes; the exact net figure sits below. */}
                <Stat icon={TrendingUp} label="Assets" value={`₹${formatCompactINR(networth.assets)}`} tone="success" />
                <Stat icon={TrendingDown} label="Debts" value={`₹${formatCompactINR(networth.debts)}`} tone="destructive" />
              </div>
              <p className="text-xs text-muted-foreground">
                Net worth{' '}
                <MoneyWords
                  amount={networth.assets - networth.debts}
                  label="Net worth"
                  align="start"
                  className="font-semibold text-foreground"
                />
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module tiles */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Modules</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((m) => (
            <Link
              key={m.id}
              to={m.path}
              className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-accent/50 active:bg-accent"
            >
              <span
                className="grid size-11 place-items-center rounded-xl text-white"
                style={{ backgroundColor: m.color }}
              >
                <m.icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{m.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  tone: 'success' | 'destructive'
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          tone === 'success' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}
