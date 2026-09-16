import { useState } from 'react'
import { CalendarPlus, Lock, Plus, Repeat } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { MoneyWords } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  PAYMENT_METHOD_LABEL,
  canEdit,
  deleteRecurring,
  listCategories,
  listRecurring,
  listUserNames,
  ordinal,
  updateRecurring,
  type PaymentMethod,
  type RecurringWithCategory,
} from '@/modules/expenses/api'
import { AddRecurringSheet } from '@/modules/expenses/components/add-recurring-sheet'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { RecurringSheet } from '@/modules/expenses/components/recurring-sheet'
import { useAuthStore } from '@/store/auth-store'

export function RecurringPage() {
  const profile = useAuthStore((s) => s.profile)
  const { data, loading, reload } = useAsyncData(
    async () => {
      const [items, categories, names] = await Promise.all([listRecurring(), listCategories(), listUserNames()])
      return { items, categories, names }
    },
    'recurring',
    'Failed to load recurring expenses',
  )
  const items = data?.items ?? []
  const categories = data?.categories ?? []
  const names = data?.names

  const [sheetOpen, setSheetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringWithCategory | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RecurringWithCategory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const activeItems = items.filter((r) => r.active)
  const activeTotal = activeItems.reduce((sum, r) => sum + Number(r.amount), 0)

  const openAdd = () => {
    setEditing(null)
    setSheetOpen(true)
  }

  const setActive = async (r: RecurringWithCategory, active: boolean) => {
    setToggling(r.id)
    try {
      await updateRecurring(r.id, { active })
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setToggling(null)
    }
  }

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteRecurring(confirmDelete.id)
      toast.success('Recurring expense removed')
      setConfirmDelete(null)
      setSheetOpen(false)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    // Bottom padding keeps the last row clear of the floating + button.
    <div className="space-y-4 pb-16 md:pb-0">
      <PageHeader
        title="Recurring expenses"
        description="Set them up once, then add them to a month together."
        backTo="/settings"
      />

      {loading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {activeItems.length} active · every month
            </p>
            <MoneyWords
              amount={activeTotal}
              label="Recurring every month"
              align="start"
              className="whitespace-nowrap text-lg font-semibold tabular-nums"
            />
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={activeItems.length === 0}>
            <CalendarPlus /> Add to a month
          </Button>
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring expenses yet"
          description="Add rent, EMIs, subscriptions or anything you pay every month."
          action={
            <Button size="sm" onClick={openAdd}>
              <Plus /> Add one
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const editable = canEdit(r, profile)
            const method = PAYMENT_METHOD_LABEL[r.payment_method as PaymentMethod] ?? r.payment_method
            return (
              <li
                key={r.id}
                className={cn('flex items-start gap-3 rounded-xl border bg-card p-3', !r.active && 'opacity-60')}
              >
                <CategoryIcon icon={r.category?.icon} color={r.category?.color} size="sm" className="mt-0.5" />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                  disabled={!editable}
                  onClick={() => {
                    setEditing(r)
                    setSheetOpen(true)
                  }}
                >
                  <span className="block break-words text-sm font-medium">
                    {r.note || r.category?.name || 'Recurring expense'}
                  </span>
                  <span className="block break-words text-xs text-muted-foreground">
                    {ordinal(r.day_of_month)} of every month · {r.category?.name ?? 'No category'} · {method}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Added by {names?.get(r.user_id) ?? 'Unknown'}
                  </span>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {formatMoney(Number(r.amount))}
                  </span>
                  {editable ? (
                    <Switch
                      checked={r.active}
                      disabled={toggling === r.id}
                      onCheckedChange={(v) => void setActive(r, v)}
                      aria-label={r.active ? 'Pause' : 'Resume'}
                    />
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" /> Shared
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* FAB */}
      <Button
        size="icon"
        aria-label="Add recurring expense"
        onClick={openAdd}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-full shadow-lg keyboard-open:hidden md:bottom-6 md:right-6"
      >
        <Plus className="size-6" />
      </Button>

      <RecurringSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={categories}
        editing={editing}
        onSaved={reload}
        onDelete={() => editing && setConfirmDelete(editing)}
        onCategoriesChanged={reload}
      />

      <AddRecurringSheet open={addOpen} onOpenChange={setAddOpen} onSaved={reload} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Remove this recurring expense?"
        description="Expenses already added stay in the ledger."
        tone="destructive"
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}
