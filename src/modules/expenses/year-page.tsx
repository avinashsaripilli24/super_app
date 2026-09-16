import { useMemo, useReducer, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { BarChart3, Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoneyWords } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  EMPTY_SUMMARY,
  canEdit,
  deleteTransaction,
  fetchLedgerSummary,
  liveCategoryRow,
  listCategories,
  listUserNames,
  monthKey,
  toMonthSummary,
  toMonthTotals,
  toPersonTotals,
  yearRange,
  type CategoryTotal,
  type LedgerRow,
  type MonthTotals,
  type TxnKind,
} from '@/modules/expenses/api'
import { CategoryBreakdown } from '@/modules/expenses/components/category-breakdown'
import { CategoryTransactionsSheet } from '@/modules/expenses/components/category-transactions-sheet'
import { ExportSheet } from '@/modules/expenses/components/export-sheet'
import { MonthlyBars } from '@/modules/expenses/components/monthly-bars'
import { StatTile } from '@/modules/expenses/components/stat-tile'
import { TransactionSheet } from '@/modules/expenses/components/transaction-sheet'
import { ViewToggle } from '@/modules/expenses/components/view-toggle'
import { YearSwitcher } from '@/modules/expenses/components/year-switcher'
import { useAuthStore } from '@/store/auth-store'

const EMPTY_NAMES = new Map<string, string>()
const EMPTY_RPC = { spent: 0, income: 0, by_category: [], added_by: [], earned_by: [], by_month: [] }

export function YearPage() {
  const search = useSearch({ from: '/_authed/expenses/year' })
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const year = search.year ?? currentYear
  const profile = useAuthStore((s) => s.profile)
  const [exportOpen, setExportOpen] = useState(false)

  const { data, loading, reload } = useAsyncData(
    async () => {
      const { start, end } = yearRange(year)
      const [rpc, names, categories] = await Promise.all([
        fetchLedgerSummary(start, end),
        listUserNames(),
        listCategories(),
      ])
      return { rpc, names, categories }
    },
    String(year),
    'Failed to load the year',
  )
  const summary = useMemo(() => (data ? toMonthSummary(data.rpc) : EMPTY_SUMMARY), [data])

  // Category drill-down: its transactions in a sheet, each opening the edit sheet.
  const [drill, setDrill] = useState<{ row: CategoryTotal; kind: TxnKind } | null>(null)
  const [drillOpen, setDrillOpen] = useState(false)
  const openCategory = (kind: TxnKind) => (row: CategoryTotal) => {
    setDrill({ row, kind })
    setDrillOpen(true)
  }
  const [listToken, bumpList] = useReducer((n: number) => n + 1, 0)
  const refreshAll = () => {
    reload()
    bumpList()
  }
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<LedgerRow | null>(null)
  const [deleting, setDeleting] = useState(false)
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
  const range = yearRange(year)
  const byMonth = useMemo(() => (data ? toMonthTotals(data.rpc, year) : toMonthTotals(EMPTY_RPC, year)), [data, year])
  const byPerson = useMemo(() => (data ? toPersonTotals(data.rpc, data.names) : []), [data])

  const setYear = (y: number) => void navigate({ to: '/expenses/year', search: y === currentYear ? {} : { year: y } })
  const openMonth = (key: string) =>
    void navigate({ to: '/expenses', search: key === monthKey(new Date()) ? {} : { month: key } })

  const columns = useMemo<ColumnDef<MonthTotals>[]>(
    () => [
      {
        id: 'month',
        header: 'Month',
        accessorKey: 'label',
        cell: ({ row }) => (
          <Link
            to="/expenses"
            search={row.original.key === monthKey(new Date()) ? {} : { month: row.original.key }}
            className="font-medium text-primary hover:underline"
          >
            {row.original.label} {year}
          </Link>
        ),
      },
      {
        id: 'spent',
        header: 'Spent',
        accessorKey: 'spent',
        cell: ({ row, getValue }) => (
          <MoneyWords
            amount={getValue<number>()}
            label={`${row.original.label} ${year} · Spent`}
            align="end"
            className="tabular-nums"
          />
        ),
      },
      {
        id: 'income',
        header: 'Income',
        accessorKey: 'income',
        cell: ({ row, getValue }) => (
          <MoneyWords
            amount={getValue<number>()}
            label={`${row.original.label} ${year} · Income`}
            align="end"
            className="tabular-nums"
          />
        ),
      },
      {
        id: 'net',
        header: 'Net',
        accessorKey: 'net',
        cell: ({ row, getValue }) => (
          <MoneyWords
            amount={getValue<number>()}
            label={`${row.original.label} ${year} · Net`}
            align="end"
            className={cn('tabular-nums', getValue<number>() < 0 ? 'text-destructive' : 'text-success')}
          />
        ),
      },
    ],
    [year],
  )

  // Fixed 12 aggregate rows: no pagination needed.
  const table = useReactTable({ data: byMonth, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ViewToggle active="year" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download /> Export
        </Button>
      </div>

      <YearSwitcher value={year} onChange={setYear} />

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="size-4 text-muted-foreground" /> Monthly overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-64 w-full" /> : <MonthlyBars data={byMonth} onSelectMonth={openMonth} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Spending by category</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <CategoryBreakdown
              rows={summary.byCategory}
              emptyText="No spending recorded this year."
              onSelect={openCategory('expense')}
            />
          )}
        </CardContent>
      </Card>

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
            <CategoryBreakdown
              rows={summary.incomeByCategory}
              emptyText="No income recorded this year."
              onSelect={openCategory('income')}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">By person</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : byPerson.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions this year.</p>
          ) : (
            <ul className="divide-y">
              {byPerson.map((p) => (
                <li key={p.name} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.count} transactions</p>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums sm:text-sm">
                    <p className="text-destructive">
                      <MoneyWords amount={p.spent} label={`${p.name} · spent`} align="end">
                        {`−${formatMoney(p.spent)}`}
                      </MoneyWords>{' '}
                      <span className="text-muted-foreground">spent</span>
                    </p>
                    <p className="text-success">
                      <MoneyWords amount={p.income} label={`${p.name} · earned`} align="end">
                        {`+${formatMoney(p.income)}`}
                      </MoneyWords>{' '}
                      <span className="text-muted-foreground">earned</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">By month</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-2 px-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead
                        key={h.id}
                        className={cn(
                          'px-3',
                          h.column.id !== 'month' && 'text-right',
                          h.column.id === 'net' && 'hidden sm:table-cell',
                        )}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 text-xs sm:text-sm',
                          cell.column.id !== 'month' && 'text-right',
                          cell.column.id === 'net' && 'hidden sm:table-cell',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExportSheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        month={monthKey(new Date())}
        year={year}
        defaultScope="year"
      />

      <CategoryTransactionsSheet
        open={drillOpen}
        onOpenChange={setDrillOpen}
        category={drill && liveCategoryRow(drill.row, drill.kind, summary)}
        kind={drill?.kind ?? 'expense'}
        start={range.start}
        end={range.end}
        periodLabel={String(year)}
        categories={data?.categories ?? []}
        names={data?.names ?? EMPTY_NAMES}
        onSelect={openRow}
        refreshToken={listToken}
      />

      <TransactionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={data?.categories ?? []}
        people={data?.names ?? EMPTY_NAMES}
        editing={editing}
        readOnly={!!editing && !canEdit(editing, profile)}
        onSaved={refreshAll}
        onDelete={() => editing && setConfirmDelete(editing)}
        onCategoriesChanged={reload}
      />

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
