import { useMemo, useReducer, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, Plus, Settings2, Target } from 'lucide-react'
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
  EMPTY_SUMMARY,
  canEdit,
  deleteTransaction,
  fetchLedgerSummary,
  listBudgetsForMonth,
  listCategories,
  listUserNames,
  monthKey,
  monthRange,
  toMonthSummary,
  type LedgerRow,
} from '@/modules/expenses/api'
import { CategoryBreakdown } from '@/modules/expenses/components/category-breakdown'
import { ExportSheet } from '@/modules/expenses/components/export-sheet'
import { MonthSwitcher } from '@/modules/expenses/components/month-switcher'
import { StatTile } from '@/modules/expenses/components/stat-tile'
import { TransactionList } from '@/modules/expenses/components/transaction-list'
import { TransactionSheet } from '@/modules/expenses/components/transaction-sheet'
import { ViewToggle } from '@/modules/expenses/components/view-toggle'
import { useAuthStore } from '@/store/auth-store'

const EMPTY_NAMES = new Map<string, string>()

export function ExpensesPage() {
  const search = useSearch({ from: '/_authed/expenses' })
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const month = search.month ?? monthKey(new Date())

  const { data, loading, reload } = useAsyncData(
    async () => {
      const { start, end } = monthRange(month)
      const [summaryRpc, categories, budgets, names] = await Promise.all([
        fetchLedgerSummary(start, end),
        listCategories(),
        listBudgetsForMonth(month),
        listUserNames(),
      ])
      return { summaryRpc, categories, budgets, names }
    },
    month,
    'Failed to load this month',
  )
  const categories = data?.categories ?? []
  const budgets = data?.budgets ?? []
  const names = data?.names ?? EMPTY_NAMES
  const summary = useMemo(() => (data ? toMonthSummary(data.summaryRpc) : EMPTY_SUMMARY), [data])

  // The list pages on its own; bump this after a write so it re-fetches.
  const [listToken, bumpList] = useReducer((n: number) => n + 1, 0)
  const refreshAll = () => {
    reload()
    bumpList()
  }

  const [sheetOpen, setSheetOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<LedgerRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const overallBudget = budgets.find((b) => b.category_id === null)
  const budgetAmount = overallBudget ? Number(overallBudget.amount) : 0
  const budgetPct = budgetAmount > 0 ? Math.min(1, summary.spent / budgetAmount) : 0

  const setMonth = (m: string) =>
    void navigate({ to: '/expenses', search: m === monthKey(new Date()) ? {} : { month: m } })

  const openAdd = () => {
    setEditing(null)
    setSheetOpen(true)
  }
  const openRow = (t: LedgerRow) => {
    setEditing(t)
    setSheetOpen(true)
  }

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteTransaction(confirmDelete.id)
      toast.success('Transaction deleted')
      setConfirmDelete(null)
      setSheetOpen(false)
      refreshAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // Default date for new transactions: today if viewing current month, else the 1st.
  const defaultDate = month === monthKey(new Date()) ? undefined : `${month}-01`
  const year = Number(month.slice(0, 4))

  return (
    // Bottom padding keeps the last row clear of the floating + button.
    <div className="space-y-4 pb-16 md:pb-0">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ViewToggle active="month" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download /> Export
        </Button>
      </div>

      <MonthSwitcher value={month} onChange={setMonth} />

      {/* Totals */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Spent" value={formatMoney(summary.spent)} amount={summary.spent} tone="destructive" />
          <StatTile label="Income" value={formatMoney(summary.income)} amount={summary.income} tone="success" />
          <StatTile
            label="Net"
            value={formatMoney(summary.net)}
            amount={summary.net}
            tone={summary.net < 0 ? 'destructive' : 'default'}
          />
        </div>
      )}

      {/* Budget */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="size-4 text-muted-foreground" /> Monthly budget
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/expenses/budgets" search={month === monthKey(new Date()) ? {} : { month }}>
              Manage
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10" />
          ) : budgetAmount > 0 ? (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    budgetPct >= 1 ? 'bg-destructive' : budgetPct >= 0.8 ? 'bg-warning' : 'bg-primary',
                  )}
                  style={{ width: `${budgetPct * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatMoney(summary.spent)} of <MoneyWords amount={budgetAmount} label="Monthly budget" align="start" />
                </span>
                {summary.spent > budgetAmount ? (
                  <MoneyWords amount={summary.spent - budgetAmount} label="Over budget" align="end">
                    {`${formatMoney(summary.spent - budgetAmount)} over`}
                  </MoneyWords>
                ) : (
                  <MoneyWords amount={budgetAmount - summary.spent} label="Left to spend" align="end">
                    {`${formatMoney(budgetAmount - summary.spent)} left`}
                  </MoneyWords>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No budget set for this month.</p>
          )}
        </CardContent>
      </Card>

      {/* Breakdown */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">Spending by category</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/expenses/categories">
              <Settings2 /> Categories
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <CategoryBreakdown rows={summary.byCategory} />
          )}
        </CardContent>
      </Card>

      {/* Income */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Income by category</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <CategoryBreakdown rows={summary.incomeByCategory} emptyText="No income recorded this month." />
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Transactions</h3>
        {loading ? (
          <ListSkeleton rows={6} />
        ) : (
          <TransactionList
            month={month}
            categories={categories}
            names={names}
            onSelect={openRow}
            refreshToken={listToken}
          />
        )}
      </section>

      {/* FAB */}
      <Button
        size="icon"
        aria-label="Add transaction"
        onClick={openAdd}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-full shadow-lg keyboard-open:hidden md:bottom-6 md:right-6"
      >
        <Plus className="size-6" />
      </Button>

      <TransactionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={categories}
        people={names}
        editing={editing}
        readOnly={!!editing && !canEdit(editing, profile)}
        defaultDate={defaultDate}
        onSaved={refreshAll}
        onDelete={() => editing && setConfirmDelete(editing)}
        onCategoriesChanged={reload}
      />

      <ExportSheet open={exportOpen} onOpenChange={setExportOpen} month={month} year={year} defaultScope="month" />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this transaction?"
        description="This cannot be undone."
        tone="destructive"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}
