import { useReducer, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { Plus, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { MoneyWords } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  canEdit,
  deleteTarget,
  fetchAssetsOverview,
  formatPct,
  listAssetCategories,
  listTargets,
  listUserNames,
} from '@/modules/assets/api'
import { HoldingList } from '@/modules/assets/components/holding-list'
import { HoldingSheet } from '@/modules/assets/components/holding-sheet'
import { TargetSheet } from '@/modules/assets/components/target-sheet'
import { ASSET_CLASS_LABEL, KIND_LABEL, VALUATION_MODE_SHORT } from '@/modules/assets/labels'
import { StatTile } from '@/modules/expenses/components/stat-tile'
import { useAuthStore } from '@/store/auth-store'

const EMPTY_NAMES = new Map<string, string>()

export function AssetTypePage() {
  const { typeId } = useParams({ from: '/_authed/_assetsLock/assets/types/$typeId' })
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)

  const { data, loading, reload } = useAsyncData(
    async () => {
      const [categories, overview, targets, names] = await Promise.all([
        listAssetCategories(),
        fetchAssetsOverview(),
        listTargets(),
        listUserNames(),
      ])
      return { categories, overview, targets, names }
    },
    typeId,
    'Failed to load this type',
  )
  const category = data?.categories.find((c) => c.id === typeId)
  const stats = data?.overview.by_category.find((c) => c.id === typeId)
  const target = data?.targets.find((t) => t.category_id === typeId) ?? null
  const names = data?.names ?? EMPTY_NAMES

  const [listToken, bumpList] = useReducer((n: number) => n + 1, 0)
  const refreshAll = () => {
    reload()
    bumpList()
  }

  const [sheetOpen, setSheetOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const onRemoveTarget = async () => {
    if (!target) return
    setRemoving(true)
    try {
      await deleteTarget(target.id)
      toast.success('Target removed')
      setConfirmRemove(false)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRemoving(false)
    }
  }

  if (!loading && !category) {
    return (
      <EmptyState
        title="Type not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="outline">
            <Link to="/assets/types">Back to types</Link>
          </Button>
        }
      />
    )
  }

  const isAsset = category?.kind === 'asset'
  const current = stats?.current ?? 0
  const invested = stats?.invested ?? 0
  const gain = stats?.gain ?? 0
  const targetAmount = target ? Number(target.amount) : 0
  const pct = targetAmount > 0 ? Math.min(1, current / targetAmount) : 0

  return (
    // Bottom padding keeps the last row clear of the floating + button.
    <div className="space-y-4 pb-16 md:pb-0">
      <PageHeader
        title={category?.name ?? 'Type'}
        description={
          category
            ? `${KIND_LABEL[category.kind]} · ${VALUATION_MODE_SHORT[category.valuation_mode]}${category.asset_class ? ` · ${ASSET_CLASS_LABEL[category.asset_class]}` : ''}`
            : undefined
        }
        backTo="/assets/types"
      />

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isAsset ? (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Current value" value={formatMoney(current)} amount={current} />
          <StatTile label="Invested" value={formatMoney(invested)} amount={invested} />
          <StatTile
            label={`Gain · ${formatPct(invested > 0 ? gain / invested : null)}`}
            value={formatMoney(gain)}
            amount={gain}
            tone={gain < 0 ? 'destructive' : 'success'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Outstanding" value={formatMoney(current)} amount={current} tone="destructive" />
          <StatTile label="Borrowed" value={formatMoney(invested)} amount={invested} />
          <StatTile
            label="Repaid"
            value={formatMoney(stats?.withdrawn ?? 0)}
            amount={stats?.withdrawn ?? 0}
            tone="success"
          />
        </div>
      )}

      {isAsset && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="size-4 text-muted-foreground" /> Target
            </CardTitle>
            {!loading && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setTargetOpen(true)} disabled={!!target && !canEdit(target, profile)}>
                  {target ? 'Edit' : 'Set'}
                </Button>
                {target && canEdit(target, profile) && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove target"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10" />
            ) : targetAmount > 0 ? (
              <div className="space-y-1.5">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', pct >= 1 ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {formatMoney(current)} of <MoneyWords amount={targetAmount} label="Target" align="start" />
                  </span>
                  {current >= targetAmount ? (
                    <span className="text-success">Target reached</span>
                  ) : (
                    <MoneyWords amount={targetAmount - current} label="To go" align="end">
                      {`${formatMoney(targetAmount - current)} to go`}
                    </MoneyWords>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No target set for this type.</p>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Holdings</h3>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <HoldingList
            fixed={{ kind: category?.kind, categoryId: typeId }}
            names={names}
            refreshToken={listToken}
            emptyTitle={`No ${category?.name ?? ''} holdings yet`}
          />
        )}
      </section>

      <Button
        size="icon"
        aria-label="Add holding"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-full shadow-lg keyboard-open:hidden md:bottom-6 md:right-6"
      >
        <Plus className="size-6" />
      </Button>

      {category && (
        <>
          <HoldingSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            categories={data?.categories ?? []}
            people={names}
            defaultKind={category.kind}
            defaultCategoryId={category.id}
            onSaved={(id) => {
              refreshAll()
              void navigate({ to: '/assets/holdings/$holdingId', params: { holdingId: id } })
            }}
          />
          <TargetSheet
            open={targetOpen}
            onOpenChange={setTargetOpen}
            categories={[category]}
            editing={target}
            defaultCategoryId={category.id}
            onSaved={reload}
          />
        </>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove this target?"
        tone="destructive"
        confirmLabel="Remove"
        loading={removing}
        onConfirm={onRemoveTarget}
      />
    </div>
  )
}
