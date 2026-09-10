import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { MoneyWords } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  canEdit,
  deleteTarget,
  fetchAssetsOverview,
  listAssetCategories,
  listTargets,
  type AssetTarget,
} from '@/modules/assets/api'
import { TargetSheet } from '@/modules/assets/components/target-sheet'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { useAuthStore } from '@/store/auth-store'

export function AssetTargetsPage() {
  const profile = useAuthStore((s) => s.profile)
  const { data, loading, reload } = useAsyncData(
    async () => {
      const [targets, categories, overview] = await Promise.all([
        listTargets(),
        listAssetCategories(),
        fetchAssetsOverview(),
      ])
      return { targets, categories: categories.filter((c) => c.kind === 'asset'), overview }
    },
    'asset-targets',
    'Failed to load targets',
  )
  const targets = useMemo(() => data?.targets ?? [], [data])
  const categories = useMemo(() => data?.categories ?? [], [data])
  const currentByType = useMemo(
    () => new Map((data?.overview.by_category ?? []).map((c) => [c.id, c.current])),
    [data],
  )
  const rows = useMemo(
    () =>
      targets
        .map((t) => ({
          t,
          cat: categories.find((c) => c.id === t.category_id),
          current: currentByType.get(t.category_id) ?? 0,
          amount: Number(t.amount),
        }))
        .filter((r) => r.cat)
        .sort((a, b) => a.cat!.sort_order - b.cat!.sort_order || a.cat!.name.localeCompare(b.cat!.name)),
    [targets, categories, currentByType],
  )
  const totalTarget = rows.reduce((s, r) => s + r.amount, 0)
  const totalCurrent = rows.reduce((s, r) => s + r.current, 0)
  const totalPct = totalTarget > 0 ? Math.min(1, totalCurrent / totalTarget) : 0
  const untargeted = useMemo(
    () => categories.filter((c) => !targets.some((t) => t.category_id === c.id)),
    [categories, targets],
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<AssetTarget | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AssetTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteTarget(confirmDelete.id)
      toast.success('Target removed')
      setConfirmDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Targets"
        description="Where each type of asset should reach. Shared by the household."
        backTo="/assets"
        actions={
          <Button
            size="sm"
            disabled={loading || untargeted.length === 0}
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            <Plus /> Set
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Overall</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10" />
          ) : totalTarget > 0 ? (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', totalPct >= 1 ? 'bg-success' : 'bg-primary')}
                  style={{ width: `${totalPct * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatMoney(totalCurrent)} of <MoneyWords amount={totalTarget} label="All targets" align="start" />
                </span>
                <span>{Math.round(totalPct * 100)}% across targeted types</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Set a target on a type to see progress here.</p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No targets yet" description="Set one per asset type, e.g. Mutual Funds ₹25,00,000." />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ t, cat, current, amount }) => {
            const pct = amount > 0 ? Math.min(1, current / amount) : 0
            return (
              <li key={t.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Link to="/assets/types/$typeId" params={{ typeId: t.category_id }} className="flex min-w-0 flex-1 items-center gap-3">
                    <CategoryIcon icon={cat!.icon} color={cat!.color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium">{cat!.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatMoney(current)} of {formatMoney(amount)} · {Math.round(pct * 100)}%
                      </span>
                    </span>
                  </Link>
                  {canEdit(t, profile) ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(t)
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
                        onClick={() => setConfirmDelete(t)}
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
                    className={cn('h-full rounded-full', pct >= 1 ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <TargetSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={editing ? categories : untargeted}
        editing={editing}
        onSaved={reload}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Remove this target?"
        tone="destructive"
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}
