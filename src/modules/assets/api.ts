// Assets & debts (net-worth tracker), backed by supabase/migrations/*_assets.sql.
// Shared household model like the expense ledger: everyone sees every row,
// only the creator or an admin can edit/delete.
//
// A holding's value is never computed here: `holding_value_at()` in SQL is the
// single implementation, exposed per holding by the `holding_current` view and
// aggregated by the `assets_overview` / `assets_activity` / `networth_history`
// RPCs.

import { format } from 'date-fns'

import type { Enums, Tables } from '@/lib/database.types'
import { inList, likePattern } from '@/lib/postgrest'
import { supabase } from '@/lib/supabase'
import {
  canEdit,
  listUserNames,
  monthKey,
  monthRange,
  yearRange,
  type CategoryTotal,
  type UserNames,
} from '@/modules/expenses/api'
import { ASSET_CLASS_COLOR, ASSET_CLASS_ICON, ASSET_CLASS_LABEL } from '@/modules/assets/labels'

// Shared helpers from the ledger, re-exported so pages import one module.
export { canEdit, listUserNames, monthKey, monthRange, yearRange }
export type { CategoryTotal, UserNames }

export type AssetCategory = Tables<'asset_categories'>
export type Holding = Tables<'holdings'>
export type HoldingTxn = Tables<'holding_transactions'>
export type Valuation = Tables<'holding_valuations'>
export type AssetTarget = Tables<'asset_targets'>
export type AssetKind = Enums<'asset_kind'>
export type ValuationMode = Enums<'valuation_mode'>
export type AssetClass = Enums<'asset_class'>
export type HoldingStatus = Enums<'holding_status'>
export type HoldingTxnType = Enums<'holding_txn_type'>

type HoldingCurrentRaw = Tables<'holding_current'>

/** One row of `holding_current` with the nullability the SQL guarantees. */
export interface HoldingRow {
  id: string
  user_id: string
  holder_id: string | null
  category_id: string
  name: string
  institution: string | null
  identifier: string | null
  status: HoldingStatus
  opened_on: string | null
  maturity_on: string | null
  closed_on: string | null
  interest_rate: number | null
  notes: string | null
  created_at: string
  updated_at: string
  kind: AssetKind
  valuation_mode: ValuationMode
  asset_class: AssetClass | null
  category_name: string
  category_icon: string
  category_color: string
  /** Today's value (assets) or outstanding balance (debts); 0 once closed. */
  current_value: number
  units_held: number
  unit_price: number | null
  last_valued_on: string | null
  /** Money put in (assets) or borrowed incl. charges (debts). */
  invested: number
  /** Money taken out: redeem + income (assets) or total repaid (debts). */
  withdrawn: number
  income: number
  interest_paid: number
  /** Assets only: current + withdrawn − invested. */
  gain: number | null
  last_txn_on: string | null
  txn_count: number
}

/** gen-types make every view column nullable; normalise once here. */
export function toHoldingRow(r: HoldingCurrentRaw): HoldingRow {
  return {
    id: r.id ?? '',
    user_id: r.user_id ?? '',
    holder_id: r.holder_id,
    category_id: r.category_id ?? '',
    name: r.name ?? '',
    institution: r.institution,
    identifier: r.identifier,
    status: r.status ?? 'active',
    opened_on: r.opened_on,
    maturity_on: r.maturity_on,
    closed_on: r.closed_on,
    interest_rate: r.interest_rate === null ? null : Number(r.interest_rate),
    notes: r.notes,
    created_at: r.created_at ?? '',
    updated_at: r.updated_at ?? '',
    kind: r.kind ?? 'asset',
    valuation_mode: r.valuation_mode ?? 'value',
    asset_class: r.asset_class,
    category_name: r.category_name ?? '',
    category_icon: r.category_icon ?? 'tag',
    category_color: r.category_color ?? '#64748b',
    current_value: Number(r.current_value ?? 0),
    units_held: Number(r.units_held ?? 0),
    unit_price: r.unit_price === null ? null : Number(r.unit_price),
    last_valued_on: r.last_valued_on,
    invested: Number(r.invested ?? 0),
    withdrawn: Number(r.withdrawn ?? 0),
    income: Number(r.income ?? 0),
    interest_paid: Number(r.interest_paid ?? 0),
    gain: r.gain === null ? null : Number(r.gain),
    last_txn_on: r.last_txn_on,
    txn_count: Number(r.txn_count ?? 0),
  }
}

function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? 'Request failed')
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Not signed in')
  return id
}

export function todayKey() {
  return format(new Date(), 'yyyy-MM-dd')
}

// Types (asset_categories) ----------------------------------------------------

export async function listAssetCategories(): Promise<AssetCategory[]> {
  const { data, error } = await supabase
    .from('asset_categories')
    .select('*')
    .order('kind')
    .order('sort_order')
    .order('name')
  if (error) fail(error)
  return data ?? []
}

export interface AssetCategoryInput {
  kind: AssetKind
  name: string
  icon: string
  color: string
  valuation_mode: ValuationMode
  asset_class: AssetClass | null
}

export async function createAssetCategory(input: AssetCategoryInput): Promise<AssetCategory> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('asset_categories')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) fail(error)
  return data
}

export async function updateAssetCategory(
  id: string,
  patch: Partial<Pick<AssetCategory, 'name' | 'icon' | 'color' | 'asset_class'>>,
): Promise<void> {
  const { error } = await supabase.from('asset_categories').update(patch).eq('id', id)
  if (error) fail(error)
}

export async function deleteAssetCategory(id: string): Promise<void> {
  const { error } = await supabase.from('asset_categories').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') throw new Error('This type still has holdings. Move or delete them first.')
    fail(error)
  }
}

// Holdings --------------------------------------------------------------------

export interface HoldingFilters {
  kind?: AssetKind
  categoryId?: string
  holderId?: string
  status?: HoldingStatus
  /** Matches name, institution or identifier. */
  search?: string
}

function holdingsQuery(f: HoldingFilters) {
  let q = supabase.from('holding_current').select('*')
  if (f.kind) q = q.eq('kind', f.kind)
  if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (f.holderId) q = q.eq('holder_id', f.holderId)
  if (f.status) q = q.eq('status', f.status)
  const term = f.search?.trim()
  if (term) {
    const p = likePattern(term)
    q = q.or(`name.ilike.${p},institution.ilike.${p},identifier.ilike.${p}`)
  }
  // Largest first; `id` breaks ties so `.range()` pages never overlap.
  return q.order('current_value', { ascending: false }).order('name').order('id')
}

/** One page of holdings (today's figures), largest value first. */
export async function listHoldingsPage(
  args: { offset: number; limit: number; filters: HoldingFilters },
  signal?: AbortSignal,
): Promise<HoldingRow[]> {
  let q = holdingsQuery(args.filters).range(args.offset, args.offset + args.limit - 1)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) fail(error)
  return (data ?? []).map(toHoldingRow)
}

/** Every holding matching `filters` (batch sheet / export). Pages past PostgREST's 1000-row cap. */
export async function listHoldingsAll(filters: HoldingFilters = {}): Promise<HoldingRow[]> {
  const CHUNK = 1000
  const out: HoldingRow[] = []
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await holdingsQuery(filters).range(offset, offset + CHUNK - 1)
    if (error) fail(error)
    const rows = (data ?? []).map(toHoldingRow)
    out.push(...rows)
    if (rows.length < CHUNK) return out
  }
}

export async function getHolding(id: string): Promise<HoldingRow> {
  const { data, error } = await supabase.from('holding_current').select('*').eq('id', id).single()
  if (error) fail(error)
  return toHoldingRow(data)
}

export interface HoldingInput {
  category_id: string
  /** Household member who holds it; null lets the DB default to the creator. */
  holder_id: string | null
  name: string
  institution: string | null
  identifier: string | null
  opened_on: string | null
  maturity_on: string | null
  interest_rate: number | null
  notes: string | null
}

/** Creates the holding and returns its id (creator comes from the DB default). */
export async function createHolding(input: HoldingInput): Promise<string> {
  const { data, error } = await supabase.from('holdings').insert(input).select('id').single()
  if (error) fail(error)
  return data.id
}

export async function updateHolding(id: string, input: HoldingInput): Promise<void> {
  const { error } = await supabase.from('holdings').update(input).eq('id', id)
  if (error) fail(error)
}

/** Closing zeroes the current value; the trigger stamps `closed_on`. */
export async function setHoldingStatus(id: string, status: HoldingStatus): Promise<void> {
  const { error } = await supabase.from('holdings').update({ status }).eq('id', id)
  if (error) fail(error)
}

export async function deleteHolding(id: string): Promise<void> {
  const { error } = await supabase.from('holdings').delete().eq('id', id)
  if (error) fail(error)
}

// Transactions ----------------------------------------------------------------

export interface HoldingTxnInput {
  holding_id: string
  occurred_on: string
  type: HoldingTxnType
  amount: number
  quantity: number | null
  unit_price: number | null
  /** Repay only: the interest part of `amount`. */
  interest_amount: number | null
  note: string | null
}

export async function listHoldingTransactionsPage(
  holdingId: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<HoldingTxn[]> {
  let q = supabase
    .from('holding_transactions')
    .select('*')
    .eq('holding_id', holdingId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) fail(error)
  return data ?? []
}

/** Every transaction of one holding, oldest first (XIRR, export). */
export async function listHoldingTransactionsAll(holdingId: string): Promise<HoldingTxn[]> {
  const CHUNK = 1000
  const out: HoldingTxn[] = []
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await supabase
      .from('holding_transactions')
      .select('*')
      .eq('holding_id', holdingId)
      .order('occurred_on')
      .order('created_at')
      .order('id')
      .range(offset, offset + CHUNK - 1)
    if (error) fail(error)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < CHUNK) return out
  }
}

export async function createHoldingTransaction(input: HoldingTxnInput): Promise<void> {
  const { error } = await supabase.from('holding_transactions').insert(input)
  if (error) fail(error)
}

export async function updateHoldingTransaction(id: string, input: HoldingTxnInput): Promise<void> {
  const { error } = await supabase.from('holding_transactions').update(input).eq('id', id)
  if (error) fail(error)
}

export async function deleteHoldingTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('holding_transactions').delete().eq('id', id)
  if (error) fail(error)
}

// Activity (transactions across holdings) -------------------------------------

const ACTIVITY_SELECT =
  '*, holding:holdings!inner(id, name, holder_id, user_id, category_id, category:asset_categories!inner(id, name, icon, color, kind, valuation_mode))'

export interface ActivityTxn extends HoldingTxn {
  holding: {
    id: string
    name: string
    holder_id: string | null
    user_id: string
    category_id: string
    category: Pick<AssetCategory, 'id' | 'name' | 'icon' | 'color' | 'kind' | 'valuation_mode'>
  }
}

/** Activity row plus display names. */
export interface ActivityRow extends ActivityTxn {
  added_by: string
  holder_name: string
}

export interface ActivityFilters {
  kind?: AssetKind
  categoryId?: string
  holderId?: string
  /** Matches the note or the holding's name. */
  search?: string
}

function activityQuery(start: string, end: string, f: ActivityFilters) {
  let q = supabase.from('holding_transactions').select(ACTIVITY_SELECT).gte('occurred_on', start).lte('occurred_on', end)
  if (f.kind) q = q.eq('holding.category.kind', f.kind)
  if (f.categoryId) q = q.eq('holding.category_id', f.categoryId)
  if (f.holderId) q = q.eq('holding.holder_id', f.holderId)
  return q
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
}

/**
 * One page of transactions in `[start, end]` across all holdings, newest
 * first. A free-text term matches the note, or the holding name (resolved to
 * ids first, since `.or()` cannot mix parent and embedded columns).
 */
export async function listActivityPage(
  args: { start: string; end: string; offset: number; limit: number; filters: ActivityFilters },
  signal?: AbortSignal,
): Promise<ActivityTxn[]> {
  const { start, end, offset, limit, filters } = args
  let q = activityQuery(start, end, filters)

  const term = filters.search?.trim()
  if (term) {
    let hq = supabase.from('holdings').select('id').ilike('name', `%${term}%`).limit(200)
    if (signal) hq = hq.abortSignal(signal)
    const { data: hs, error: hErr } = await hq
    if (hErr) fail(hErr)
    const parts = [`note.ilike.${likePattern(term)}`, inList('holding_id', (hs ?? []).map((h) => h.id))].filter(
      (p): p is string => p !== null,
    )
    q = q.or(parts.join(','))
  }

  q = q.range(offset, offset + limit - 1)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) fail(error)
  return (data ?? []) as unknown as ActivityTxn[]
}

/** Every transaction in `[start, end]` (export only). */
export async function listActivityBetween(start: string, end: string): Promise<ActivityTxn[]> {
  const CHUNK = 1000
  const out: ActivityTxn[] = []
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await activityQuery(start, end, {}).range(offset, offset + CHUNK - 1)
    if (error) fail(error)
    const rows = (data ?? []) as unknown as ActivityTxn[]
    out.push(...rows)
    if (rows.length < CHUNK) return out
  }
}

export function withActivityNames(rows: ActivityTxn[], names: UserNames): ActivityRow[] {
  return rows.map((r) => ({
    ...r,
    added_by: names.get(r.user_id) ?? 'Unknown',
    holder_name: names.get(r.holding.holder_id ?? r.holding.user_id) ?? 'Unknown',
  }))
}

// Valuations ------------------------------------------------------------------

export interface ValuationInput {
  holding_id: string
  as_of: string
  value: number
  /** Units-mode holdings: the price/NAV on `as_of`. */
  unit_price: number | null
  note: string | null
}

export async function listValuationsPage(
  holdingId: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<Valuation[]> {
  let q = supabase
    .from('holding_valuations')
    .select('*')
    .eq('holding_id', holdingId)
    .order('as_of', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) fail(error)
  return data ?? []
}

/** Valuations dated `asOf` for the given holdings (batch sheet). */
export async function listValuationsOn(asOf: string, holdingIds: string[]): Promise<Valuation[]> {
  if (holdingIds.length === 0) return []
  const { data, error } = await supabase
    .from('holding_valuations')
    .select('*')
    .eq('as_of', asOf)
    .in('holding_id', holdingIds)
  if (error) fail(error)
  return data ?? []
}

export async function createValuation(input: ValuationInput): Promise<void> {
  const { error } = await supabase.from('holding_valuations').insert(input)
  if (error) fail(error)
}

export async function updateValuation(id: string, input: ValuationInput): Promise<void> {
  const { error } = await supabase.from('holding_valuations').update(input).eq('id', id)
  if (error) fail(error)
}

export async function deleteValuation(id: string): Promise<void> {
  const { error } = await supabase.from('holding_valuations').delete().eq('id', id)
  if (error) fail(error)
}

/**
 * Insert-or-update one valuation per holding for a date. No `user_id` in the
 * payload: inserts take the DB default, and the conflict path must not touch
 * the owner (`keep_row_owner`). Updating a same-day row someone else created
 * is refused by RLS unless the caller is an admin.
 */
export async function upsertValuations(rows: ValuationInput[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('holding_valuations').upsert(rows, { onConflict: 'holding_id,as_of' })
  if (error) {
    if (error.code === '42501') {
      throw new Error('A value for that date was recorded by someone else; only they or an admin can change it.')
    }
    fail(error)
  }
}

// Targets ---------------------------------------------------------------------

export async function listTargets(): Promise<AssetTarget[]> {
  const { data, error } = await supabase.from('asset_targets').select('*')
  if (error) fail(error)
  return data ?? []
}

/** One household target per type regardless of who set it. */
export async function upsertTarget(input: { category_id: string; amount: number }): Promise<void> {
  const { data: existing, error: findErr } = await supabase
    .from('asset_targets')
    .select('id')
    .eq('category_id', input.category_id)
    .maybeSingle()
  if (findErr) fail(findErr)

  if (existing) {
    const { error } = await supabase.from('asset_targets').update({ amount: input.amount }).eq('id', existing.id)
    if (error) fail(error)
  } else {
    const { error } = await supabase.from('asset_targets').insert(input)
    if (error) fail(error)
  }
}

export async function deleteTarget(id: string): Promise<void> {
  const { error } = await supabase.from('asset_targets').delete().eq('id', id)
  if (error) fail(error)
}

// Aggregates (RPCs) -----------------------------------------------------------

export interface OverviewCategory {
  id: string
  name: string
  icon: string
  color: string
  kind: AssetKind
  asset_class: AssetClass | null
  valuation_mode: ValuationMode
  current: number
  invested: number
  withdrawn: number
  gain: number
  holdings_count: number
  target: number | null
}

export interface OverviewHolder {
  id: string
  assets: number
  debts: number
  count: number
}

export interface MaturingHolding {
  id: string
  name: string
  holder_id: string
  category_name: string
  category_icon: string
  category_color: string
  maturity_on: string
  current: number
}

/** Shape of `public.assets_overview(p_holder)`: active holdings only. */
export interface AssetsOverview {
  assets: number
  debts: number
  invested: number
  gain: number
  holdings_count: number
  /** Assets with no valuation in the last 30 days. */
  stale_count: number
  last_valued_on: string | null
  by_category: OverviewCategory[]
  by_holder: OverviewHolder[]
  by_class: { asset_class: AssetClass; current: number; count: number }[]
  /** Maturing within 60 days (or already matured), soonest first. */
  maturing: MaturingHolding[]
}

export const EMPTY_OVERVIEW: AssetsOverview = {
  assets: 0,
  debts: 0,
  invested: 0,
  gain: 0,
  holdings_count: 0,
  stale_count: 0,
  last_valued_on: null,
  by_category: [],
  by_holder: [],
  by_class: [],
  maturing: [],
}

export async function fetchAssetsOverview(holderId?: string): Promise<AssetsOverview> {
  const { data, error } = await supabase.rpc('assets_overview', holderId ? { p_holder: holderId } : {})
  if (error) fail(error)
  const raw = data as unknown as AssetsOverview
  return {
    assets: Number(raw.assets),
    debts: Number(raw.debts),
    invested: Number(raw.invested),
    gain: Number(raw.gain),
    holdings_count: Number(raw.holdings_count),
    stale_count: Number(raw.stale_count),
    last_valued_on: raw.last_valued_on,
    by_category: raw.by_category.map((c) => ({
      ...c,
      current: Number(c.current),
      invested: Number(c.invested),
      withdrawn: Number(c.withdrawn),
      gain: Number(c.gain),
      holdings_count: Number(c.holdings_count),
      target: c.target === null ? null : Number(c.target),
    })),
    by_holder: raw.by_holder.map((h) => ({ ...h, assets: Number(h.assets), debts: Number(h.debts), count: Number(h.count) })),
    by_class: raw.by_class.map((c) => ({ ...c, current: Number(c.current), count: Number(c.count) })),
    maturing: raw.maturing.map((m) => ({ ...m, current: Number(m.current) })),
  }
}

export interface ActivityFlows {
  invested: number
  redeemed: number
  income: number
  borrowed: number
  repaid: number
  charged: number
}

export interface ActivityCategory extends ActivityFlows {
  id: string
  name: string
  icon: string
  color: string
  kind: AssetKind
  count: number
}

/** Shape of `public.assets_activity(start, end)`: cash flows in a period. */
export interface AssetsActivity extends ActivityFlows {
  /** Interest part of repayments + charges. */
  interest_paid: number
  count: number
  by_category: ActivityCategory[]
  by_holder: (Omit<ActivityFlows, 'charged'> & { id: string; count: number })[]
  by_month: (ActivityFlows & { month: string })[]
}

export const EMPTY_ACTIVITY: AssetsActivity = {
  invested: 0,
  redeemed: 0,
  income: 0,
  borrowed: 0,
  repaid: 0,
  charged: 0,
  interest_paid: 0,
  count: 0,
  by_category: [],
  by_holder: [],
  by_month: [],
}

function flows<T extends ActivityFlows>(x: T): T {
  return {
    ...x,
    invested: Number(x.invested),
    redeemed: Number(x.redeemed),
    income: Number(x.income),
    borrowed: Number(x.borrowed),
    repaid: Number(x.repaid),
    charged: Number(x.charged ?? 0),
  }
}

export async function fetchAssetsActivity(start: string, end: string): Promise<AssetsActivity> {
  const { data, error } = await supabase.rpc('assets_activity', { p_start: start, p_end: end })
  if (error) fail(error)
  const raw = data as unknown as AssetsActivity
  return {
    ...flows(raw),
    interest_paid: Number(raw.interest_paid),
    count: Number(raw.count),
    by_category: raw.by_category.map((c) => ({ ...flows(c), count: Number(c.count) })),
    by_holder: raw.by_holder.map((h) => ({ ...flows({ ...h, charged: 0 }), count: Number(h.count) })),
    by_month: raw.by_month.map(flows),
  }
}

export interface NetworthPoint {
  /** `YYYY-MM` */
  month: string
  assets: number
  debts: number
}

export async function fetchNetworthHistory(year: number): Promise<NetworthPoint[]> {
  const { data, error } = await supabase.rpc('networth_history', { p_year: year })
  if (error) fail(error)
  return ((data as unknown as NetworthPoint[]) ?? []).map((p) => ({
    month: p.month,
    assets: Number(p.assets),
    debts: Number(p.debts),
  }))
}

/** One group of a paired bar chart; `null` = no bar (month not started). */
export interface BarRow {
  key: string
  label: string
  a: number | null
  b: number | null
}

/** Month-end assets (a) / debts (b) for the 12 months of `year`. */
export function toNetworthSeries(points: NetworthPoint[], year: number): BarRow[] {
  const byKey = new Map(points.map((p) => [p.month, p]))
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1)
    const key = format(d, 'yyyy-MM')
    const p = byKey.get(key)
    return { key, label: format(d, 'MMM'), a: p ? p.assets : null, b: p ? p.debts : null }
  })
}

/** Invested (a) / redeemed + income (b) per month of `year`; months not started are null. */
export function toFlowSeries(activity: AssetsActivity, year: number): BarRow[] {
  const byKey = new Map(activity.by_month.map((m) => [m.month, m]))
  const current = monthKey(new Date())
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1)
    const key = format(d, 'yyyy-MM')
    const m = byKey.get(key)
    const future = key > current
    return {
      key,
      label: format(d, 'MMM'),
      a: future ? null : (m?.invested ?? 0),
      b: future ? null : (m?.redeemed ?? 0) + (m?.income ?? 0),
    }
  })
}

// Derived figures -------------------------------------------------------------

/** Absolute return on an asset as a fraction, or null when nothing was invested. */
export function absReturn(row: Pick<HoldingRow, 'kind' | 'gain' | 'invested'>): number | null {
  if (row.kind !== 'asset' || row.gain === null || row.invested <= 0) return null
  return row.gain / row.invested
}

/** Share of a debt paid down as a fraction of what was borrowed. */
export function payoffPct(row: Pick<HoldingRow, 'kind' | 'current_value' | 'invested'>): number | null {
  if (row.kind !== 'debt' || row.invested <= 0) return null
  return Math.min(1, Math.max(0, 1 - row.current_value / row.invested))
}

/** Units / grams / shares with up to 4 decimals, en-IN grouping. */
export function formatUnits(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(n)
}

/** `+12.3%` / `−4.0%`, or `n/a`. */
export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a'
  const pct = v * 100
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct).toFixed(digits)}%`
}

/** Asset allocation rows for `CategoryBreakdown` (share of total assets). */
export function toClassBreakdown(o: AssetsOverview): CategoryTotal[] {
  return o.by_class
    .filter((c) => c.current > 0)
    .map((c) => ({
      id: c.asset_class,
      name: ASSET_CLASS_LABEL[c.asset_class],
      color: ASSET_CLASS_COLOR[c.asset_class],
      icon: ASSET_CLASS_ICON[c.asset_class],
      total: c.current,
      share: o.assets > 0 ? c.current / o.assets : 0,
    }))
}
