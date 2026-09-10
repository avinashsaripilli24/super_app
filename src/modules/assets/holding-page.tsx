import { useEffect, useMemo, useReducer, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { EllipsisVertical, Pencil, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { LoadMoreSentinel } from '@/components/ui/load-more-sentinel'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { DEFAULT_PAGE_SIZE, useInfiniteList } from '@/hooks/use-infinite-list'
import { cn, errorMessage, formatMoney } from '@/lib/utils'
import {
  absReturn,
  canEdit,
  deleteHolding,
  deleteHoldingTransaction,
  deleteValuation,
  formatPct,
  formatUnits,
  getHolding,
  listAssetCategories,
  listHoldingTransactionsAll,
  listHoldingTransactionsPage,
  listUserNames,
  listValuationsPage,
  payoffPct,
  setHoldingStatus,
  todayKey,
  type HoldingRow,
  type HoldingTxn,
  type UserNames,
  type Valuation,
} from '@/modules/assets/api'
import { HoldingSheet } from '@/modules/assets/components/holding-sheet'
import { HoldingTxnSheet } from '@/modules/assets/components/holding-txn-sheet'
import { ValuationSheet } from '@/modules/assets/components/valuation-sheet'
import { KIND_LABEL, TXN_SIGN, TXN_TONE, TXN_TYPE_SHORT } from '@/modules/assets/labels'
import { holdingCashFlows, xirr } from '@/modules/assets/xirr'
import { StatTile } from '@/modules/expenses/components/stat-tile'
import { useAuthStore } from '@/store/auth-store'

const EMPTY_NAMES = new Map<string, string>()

type Confirm = { kind: 'holding' } | { kind: 'txn'; id: string } | { kind: 'valuation'; id: string }

export function HoldingPage() {
  const { holdingId } = useParams({ from: '/_authed/_assetsLock/assets/holdings/$holdingId' })
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)

  const { data, loading, reload } = useAsyncData(
    async () => {
      const [holding, txns, names, categories] = await Promise.all([
        getHolding(holdingId),
        listHoldingTransactionsAll(holdingId),
        listUserNames(),
        listAssetCategories(),
      ])
      return { holding, txns, names, categories }
    },
    holdingId,
    'Failed to load this holding',
  )
  const holding = data?.holding
  const names = data?.names ?? EMPTY_NAMES
  const editable = !!holding && canEdit(holding, profile)
  const annualised = useMemo(
    () => (data ? xirr(holdingCashFlows(data.txns, data.holding, todayKey())) : null),
    [data],
  )

  // The two lists page on their own; bump this after a write so they re-fetch.
  const [listToken, bumpList] = useReducer((n: number) => n + 1, 0)
  const refreshAll = () => {
    reload()
    bumpList()
  }

  const [editOpen, setEditOpen] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<HoldingTxn | null>(null)
  const [valOpen, setValOpen] = useState(false)
  const [editingVal, setEditingVal] = useState<Valuation | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)

  const openAddTxn = () => {
    setEditingTxn(null)
    setTxnOpen(true)
  }
  const openTxn = (t: HoldingTxn) => {
    setEditingTxn(t)
    setTxnOpen(true)
  }
  const openAddVal = () => {
    setEditingVal(null)
    setValOpen(true)
  }
  const openVal = (v: Valuation) => {
    setEditingVal(v)
    setValOpen(true)
  }

  const onConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'holding') {
        await deleteHolding(holdingId)
        toast.success('Holding deleted')
        setConfirm(null)
        void navigate({ to: '/assets' })
        return
      }
      if (confirm.kind === 'txn') {
        await deleteHoldingTransaction(confirm.id)
        toast.success('Transaction deleted')
        setTxnOpen(false)
      } else {
        await deleteValuation(confirm.id)
        toast.success('Valuation deleted')
        setValOpen(false)
      }
      setConfirm(null)
      refreshAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async () => {
    if (!holding) return
    const next = holding.status === 'active' ? 'closed' : 'active'
    try {
      await setHoldingStatus(holding.id, next)
      toast.success(next === 'closed' ? 'Holding closed' : 'Holding reopened')
      refreshAll()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (!loading && !holding) {
    return (
      <EmptyState
        title="Holding not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="outline">
            <Link to="/assets">Back to assets</Link>
          </Button>
        }
      />
    )
  }

  const isAsset = holding?.kind === 'asset'
  const holderName = holding ? (names.get(holding.holder_id ?? holding.user_id) ?? 'Unknown') : ''
  const addedBy = holding ? (names.get(holding.user_id) ?? 'Unknown') : ''
  const ret = holding ? absReturn(holding) : null
  const payoff = holding ? payoffPct(holding) : null

  return (
    <div className="space-y-4">
      <PageHeader
        title={holding?.name ?? 'Holding'}
        description={
          holding
            ? [holding.category_name, `Holder ${holderName}`, holding.institution].filter(Boolean).join(' · ')
            : undefined
        }
        backTo="/assets"
        actions={
          holding && editable ? (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="Edit holding" onClick={() => setEditOpen(true)}>
                <Pencil />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="More">
                    <EllipsisVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => void toggleStatus()}>
                    {holding.status === 'active' ? 'Close holding' : 'Reopen holding'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => setConfirm({ kind: 'holding' })}>
                    Delete holding
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />

      {holding?.status === 'closed' && (
        <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Badge variant="outline">Closed</Badge>
          {holding.closed_on ? `on ${format(parseISO(holding.closed_on), 'd MMM yyyy')}` : ''} · value counts as 0;
          gain below is what it realised.
        </p>
      )}

      {/* Figures */}
      {loading || !holding ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : isAsset ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Current value" value={formatMoney(holding.current_value)} amount={holding.current_value} />
          <StatTile label="Invested" value={formatMoney(holding.invested)} amount={holding.invested} />
          <StatTile
            label="Gain"
            value={formatMoney(holding.gain ?? 0)}
            amount={holding.gain ?? 0}
            tone={(holding.gain ?? 0) < 0 ? 'destructive' : 'success'}
          />
          <StatTile label="Absolute return" value={formatPct(ret)} tone={ret === null ? 'default' : ret < 0 ? 'destructive' : 'success'} />
          <StatTile
            label="XIRR (annualised)"
            value={formatPct(annualised)}
            tone={annualised === null ? 'default' : annualised < 0 ? 'destructive' : 'success'}
          />
          {holding.valuation_mode === 'units' ? (
            <StatTile
              label="Units × price"
              value={`${formatUnits(holding.units_held)} × ${holding.unit_price === null ? '—' : formatMoney(holding.unit_price)}`}
            />
          ) : (
            <StatTile
              label="Last valued"
              value={holding.last_valued_on ? format(parseISO(holding.last_valued_on), 'd MMM yyyy') : 'Never'}
            />
          )}
          {holding.income > 0 && (
            <StatTile label="Income received" value={formatMoney(holding.income)} amount={holding.income} tone="success" />
          )}
          {holding.valuation_mode === 'units' && (
            <StatTile
              label="Last valued"
              value={holding.last_valued_on ? format(parseISO(holding.last_valued_on), 'd MMM yyyy') : 'Never'}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Outstanding" value={formatMoney(holding.current_value)} amount={holding.current_value} tone="destructive" />
          <StatTile label="Borrowed" value={formatMoney(holding.invested)} amount={holding.invested} />
          <StatTile label="Repaid" value={formatMoney(holding.withdrawn)} amount={holding.withdrawn} tone="success" />
          <StatTile label="Interest paid" value={formatMoney(holding.interest_paid)} amount={holding.interest_paid} />
          <StatTile label="Paid off" value={payoff === null ? 'n/a' : `${Math.round(payoff * 100)}%`} />
          <StatTile
            label="Last statement"
            value={holding.last_valued_on ? format(parseISO(holding.last_valued_on), 'd MMM yyyy') : 'Never'}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={openAddTxn} disabled={loading}>
          <Plus /> Add transaction
        </Button>
        <Button variant="outline" onClick={openAddVal} disabled={loading}>
          <RefreshCw /> {isAsset ? 'Update value' : 'Update balance'}
        </Button>
      </div>

      {/* Details */}
      {holding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Detail label="Kind" value={KIND_LABEL[holding.kind]} />
              <Detail label="Type" value={holding.category_name} />
              <Detail label={isAsset ? 'Holder' : 'Borrower'} value={holderName} />
              <Detail label={isAsset ? 'Institution' : 'Lender'} value={holding.institution} />
              <Detail label={isAsset ? 'Folio / account' : 'Loan / card no.'} value={holding.identifier} />
              <Detail label={isAsset ? 'Opened on' : 'Taken on'} value={holding.opened_on ? format(parseISO(holding.opened_on), 'd MMM yyyy') : null} />
              <Detail label={isAsset ? 'Matures on' : 'Ends on'} value={holding.maturity_on ? format(parseISO(holding.maturity_on), 'd MMM yyyy') : null} />
              <Detail label="Interest rate" value={holding.interest_rate === null ? null : `${holding.interest_rate}% p.a.`} />
              <Detail label="Notes" value={holding.notes} />
              <Detail label="Added by" value={`${addedBy} on ${format(new Date(holding.created_at), 'd MMM yyyy')}`} />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Transactions */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Transactions</h3>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : (
          <TxnList holdingId={holdingId} names={names} refreshToken={listToken} onSelect={openTxn} />
        )}
      </section>

      {/* Valuations */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{isAsset ? 'Recorded values' : 'Recorded balances'}</h3>
        {loading || !holding ? (
          <ListSkeleton rows={3} />
        ) : (
          <ValuationList holding={holding} names={names} refreshToken={listToken} onSelect={openVal} />
        )}
      </section>

      {holding && (
        <>
          <HoldingSheet
            open={editOpen}
            onOpenChange={setEditOpen}
            categories={data?.categories ?? []}
            people={names}
            editing={holding}
            readOnly={!editable}
            onSaved={refreshAll}
            onDelete={() => setConfirm({ kind: 'holding' })}
          />
          <HoldingTxnSheet
            open={txnOpen}
            onOpenChange={setTxnOpen}
            holding={holding}
            editing={editingTxn}
            readOnly={!!editingTxn && !canEdit(editingTxn, profile)}
            addedBy={editingTxn ? names.get(editingTxn.user_id) : undefined}
            onSaved={refreshAll}
            onDelete={() => editingTxn && setConfirm({ kind: 'txn', id: editingTxn.id })}
          />
          <ValuationSheet
            open={valOpen}
            onOpenChange={setValOpen}
            holding={holding}
            editing={editingVal}
            readOnly={!!editingVal && !canEdit(editingVal, profile)}
            addedBy={editingVal ? names.get(editingVal.user_id) : undefined}
            onSaved={refreshAll}
            onDelete={() => editingVal && setConfirm({ kind: 'valuation', id: editingVal.id })}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === 'holding'
            ? `Delete “${holding?.name}”?`
            : confirm?.kind === 'txn'
              ? 'Delete this transaction?'
              : 'Delete this valuation?'
        }
        description={
          confirm?.kind === 'holding'
            ? 'Every transaction and recorded value on it will be deleted too. This cannot be undone.'
            : 'This changes the holding’s figures and cannot be undone.'
        }
        tone="destructive"
        confirmLabel="Delete"
        loading={busy}
        onConfirm={onConfirm}
      />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  )
}

function TxnList({
  holdingId,
  names,
  refreshToken,
  onSelect,
}: {
  holdingId: string
  names: UserNames
  refreshToken: number
  onSelect: (t: HoldingTxn) => void
}) {
  const list = useInfiniteList<HoldingTxn>(
    (offset, limit, signal) => listHoldingTransactionsPage(holdingId, offset, limit, signal),
    holdingId,
    { errorLabel: 'Failed to load transactions' },
  )
  const { reload } = list
  useEffect(() => {
    if (refreshToken > 0) reload()
  }, [refreshToken, reload])

  return (
    <div className="space-y-3">
      {list.loading ? (
        <ListSkeleton rows={4} />
      ) : list.items.length === 0 ? (
        list.error ? null : (
          <EmptyState title="No transactions yet" description="Record the first buy, deposit or disbursal." />
        )
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.items.map((t) => {
            const tone = TXN_TONE[t.type]
            const qty = t.quantity === null ? null : Number(t.quantity)
            const price = t.unit_price === null ? null : Number(t.unit_price)
            const interest = t.interest_amount === null ? null : Number(t.interest_amount)
            const meta = [
              qty !== null && price !== null ? `${formatUnits(qty)} @ ${formatMoney(price)}` : qty !== null ? `${formatUnits(qty)} units` : null,
              interest !== null ? `interest ${formatMoney(interest)}` : null,
              t.note,
              `by ${names.get(t.user_id) ?? 'Unknown'}`,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={t.id} data-id={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {TXN_TYPE_SHORT[t.type]}
                      <span className="font-normal text-muted-foreground"> · {format(parseISO(t.occurred_on), 'd MMM yyyy')}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{meta}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      tone === 'success' && 'text-success',
                      tone === 'destructive' && 'text-destructive',
                    )}
                  >
                    {TXN_SIGN[t.type]}
                    {t.type === 'bonus' ? `${formatUnits(qty ?? 0)} units` : formatMoney(Number(t.amount))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!list.loading && (
        <LoadMoreSentinel
          sentinelRef={list.sentinelRef}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          error={list.error}
          onRetry={list.items.length === 0 ? reload : list.loadMore}
          rows={2}
          endLabel={list.items.length > DEFAULT_PAGE_SIZE ? 'That’s every transaction' : undefined}
        />
      )}
    </div>
  )
}

function ValuationList({
  holding,
  names,
  refreshToken,
  onSelect,
}: {
  holding: HoldingRow
  names: UserNames
  refreshToken: number
  onSelect: (v: Valuation) => void
}) {
  const list = useInfiniteList<Valuation>(
    (offset, limit, signal) => listValuationsPage(holding.id, offset, limit, signal),
    holding.id,
    { errorLabel: 'Failed to load valuations' },
  )
  const { reload } = list
  useEffect(() => {
    if (refreshToken > 0) reload()
  }, [refreshToken, reload])

  return (
    <div className="space-y-3">
      {list.loading ? (
        <ListSkeleton rows={3} />
      ) : list.items.length === 0 ? (
        list.error ? null : (
          <EmptyState
            title={holding.kind === 'asset' ? 'No values recorded yet' : 'No balances recorded yet'}
            description={
              holding.kind === 'asset'
                ? 'Until you record one, the value is worked out from the transactions.'
                : 'Until you record one, the outstanding balance is worked out from borrowings and repayments.'
            }
          />
        )
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {list.items.map((v) => (
            <li key={v.id} data-id={v.id}>
              <button
                type="button"
                onClick={() => onSelect(v)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{format(parseISO(v.as_of), 'd MMM yyyy')}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.unit_price !== null ? `${formatMoney(Number(v.unit_price))} per unit · ` : ''}
                    {v.note ? `${v.note} · ` : ''}by {names.get(v.user_id) ?? 'Unknown'}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(Number(v.value))}</span>
              </button>
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
          rows={2}
        />
      )}
    </div>
  )
}
