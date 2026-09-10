import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyWords } from '@/components/ui/money'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { amountInWords } from '@/lib/money-words'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  canEdit,
  deleteBudget,
  fetchLedgerSummary,
  listBudgetsForMonth,
  listCategories,
  monthKey,
  monthRange,
  toMonthSummary,
  upsertBudget,
  type Budget,
  type Category,
} from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { MonthSwitcher } from '@/modules/expenses/components/month-switcher'
import { budgetSchema, type BudgetFormValues } from '@/modules/expenses/schemas'
import { useAuthStore } from '@/store/auth-store'

const OVERALL = '__overall__'

export function BudgetsPage() {
  const search = useSearch({ from: '/_authed/expenses/budgets' })
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const month = search.month ?? monthKey(new Date())

  const { data, loading, reload } = useAsyncData(
    async () => {
      const { start, end } = monthRange(month)
      const [b, c, rpc] = await Promise.all([
        listBudgetsForMonth(month),
        listCategories(),
        fetchLedgerSummary(start, end),
      ])
      const s = toMonthSummary(rpc)
      return {
        budgets: b,
        categories: c.filter((x) => x.kind === 'expense'),
        spentByCategory: Object.fromEntries(s.byCategory.map((x) => [x.id, x.total])) as Record<string, number>,
        totalSpent: s.spent,
      }
    },
    month,
    'Failed to load budgets',
  )
  const budgets: Budget[] = data?.budgets ?? []
  const categories: Category[] = data?.categories ?? []
  const spentByCategory = data?.spentByCategory ?? {}
  const totalSpent = data?.totalSpent ?? 0
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const setMonth = (m: string) =>
    void navigate({ to: '/expenses/budgets', search: m === monthKey(new Date()) ? {} : { month: m } })

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteBudget(confirmDelete.id)
      toast.success('Budget removed')
      setConfirmDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const rows = [...budgets].sort((a, b) => (a.category_id === null ? -1 : b.category_id === null ? 1 : 0))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budgets"
        description="Household limits, overall or per category, shared by everyone."
        backTo="/expenses"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            <Plus /> Set
          </Button>
        }
      />
      <MonthSwitcher value={month} onChange={setMonth} />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No budgets for this month" description="Set an overall limit or one per category." />
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => {
            const cat = b.category_id ? categories.find((c) => c.id === b.category_id) : null
            const spent = b.category_id ? (spentByCategory[b.category_id] ?? 0) : totalSpent
            const limit = Number(b.amount)
            const pct = limit > 0 ? Math.min(1, spent / limit) : 0
            return (
              <li key={b.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-center gap-3">
                  {cat ? (
                    <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                  ) : (
                    <CategoryIcon icon="coins" color="#2563eb" size="sm" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{cat?.name ?? 'Overall'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(spent)} of{' '}
                      <MoneyWords amount={limit} label={`${cat?.name ?? 'Overall'} budget`} align="start" />
                    </p>
                  </div>
                  {canEdit(b, profile) ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(b)
                          setSheetOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(b)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" /> Shared
                    </span>
                  )}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      pct >= 1 ? 'bg-destructive' : pct >= 0.8 ? 'bg-warning' : 'bg-primary',
                    )}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <BudgetSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        month={month}
        categories={categories}
        editing={editing}
        onSaved={reload}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Remove this budget?"
        tone="destructive"
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}

function BudgetSheet({
  open,
  onOpenChange,
  month,
  categories,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  month: string
  categories: Category[]
  editing: Budget | null
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { category_id: OVERALL, amount: undefined as unknown as number },
  })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { category_id: editing.category_id ?? OVERALL, amount: Number(editing.amount) }
        : { category_id: OVERALL, amount: undefined as unknown as number },
    )
  }, [open, editing, reset])

  const onSubmit = async (values: BudgetFormValues) => {
    try {
      await upsertBudget({
        month: monthRange(month).start,
        category_id: values.category_id === OVERALL ? null : values.category_id,
        amount: values.amount,
      })
      toast.success('Budget saved')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{editing ? 'Edit budget' : 'Set budget'}</SheetTitle>
          <SheetDescription>For {monthRange(month).date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Applies to" error={errors.category_id?.message}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!editing}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OVERALL}>Overall (all spending)</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label="Limit"
              htmlFor="budget-amount"
              error={errors.amount?.message}
              hint={amountInWords(watch('amount')) ?? undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="budget-amount"
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  placeholder="0"
                  className="pl-8 text-lg font-semibold"
                  {...register('amount', { valueAsNumber: true })}
                />
              </div>
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
