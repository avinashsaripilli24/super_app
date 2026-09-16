// MOCK DATA MODEL — shared expense ledger backed by the tables in
// supabase/migrations/*_expense_tracker.sql and *_shared_ledger.sql.
// Everyone sees every row; only the creator or an admin can edit/delete.
// Replace or extend when the real expense requirements arrive.

import { endOfMonth, endOfYear, format, startOfMonth, startOfYear } from 'date-fns'

import type { Enums, Tables } from '@/lib/database.types'
import { formatPhone } from '@/lib/phone'
import { inList, likePattern } from '@/lib/postgrest'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/store/auth-store'

export type Category = Tables<'expense_categories'>
export type Transaction = Tables<'transactions'>
export type Budget = Tables<'budgets'>
export type TxnKind = Enums<'txn_kind'>

export interface TransactionWithCategory extends Transaction {
  category: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null
}

/** Transaction plus display names: who added it and (income only) who earned it. */
export interface LedgerRow extends TransactionWithCategory {
  added_by: string
  /** Income rows only; null for expenses. */
  earned_by_name: string | null
}

/** user id → display name */
export type UserNames = Map<string, string>

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  other: 'Other',
}

/** `YYYY-MM` for the given date. */
export function monthKey(d: Date) {
  return format(d, 'yyyy-MM')
}

/** First/last ISO dates for a `YYYY-MM` month key. */
export function monthRange(key: string) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y!, (m ?? 1) - 1, 1)
  return {
    start: format(startOfMonth(d), 'yyyy-MM-dd'),
    end: format(endOfMonth(d), 'yyyy-MM-dd'),
    date: d,
  }
}

/** First/last ISO dates for a calendar year. */
export function yearRange(year: number) {
  const d = new Date(year, 0, 1)
  return { start: format(startOfYear(d), 'yyyy-MM-dd'), end: format(endOfYear(d), 'yyyy-MM-dd'), date: d }
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

/** Creator or admin may edit/delete a shared row. Mirrors the RLS policies. */
export function canEdit(row: { user_id: string | null }, profile: Profile | null | undefined) {
  if (!profile) return false
  return profile.role === 'admin' || row.user_id === profile.id
}

// Users -----------------------------------------------------------------------

export async function listUserNames(): Promise<UserNames> {
  const { data, error } = await supabase.from('user_names').select('id, full_name, phone')
  if (error) fail(error)
  const map: UserNames = new Map()
  for (const u of data ?? []) {
    if (u.id) map.set(u.id, u.full_name || formatPhone(u.phone) || 'Unknown')
  }
  return map
}

export function withNames(rows: TransactionWithCategory[], names: UserNames): LedgerRow[] {
  return rows.map((r) => ({
    ...r,
    added_by: names.get(r.user_id) ?? 'Unknown',
    // Legacy income rows without an earner belong to whoever added them.
    earned_by_name: r.kind === 'income' ? (names.get(r.earned_by ?? r.user_id) ?? 'Unknown') : null,
  }))
}

// Categories ------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .order('kind')
    .order('sort_order')
    .order('name')
  if (error) fail(error)
  return data ?? []
}

export async function createCategory(input: {
  name: string
  icon: string
  color: string
  kind: TxnKind
}): Promise<Category> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) fail(error)
  return data
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>>,
): Promise<void> {
  const { error } = await supabase.from('expense_categories').update(patch).eq('id', id)
  if (error) fail(error)
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('expense_categories').delete().eq('id', id)
  if (error) fail(error)
}

// Transactions ----------------------------------------------------------------

const TXN_SELECT = '*, category:expense_categories(id, name, icon, color)'

/** Newest first; `id` breaks ties so `.range()` pages never overlap. */
function orderedTransactions(q: ReturnType<typeof transactionQuery>) {
  return q
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
}

function transactionQuery(start: string, end: string) {
  return supabase.from('transactions').select(TXN_SELECT).gte('occurred_on', start).lte('occurred_on', end)
}

/** Breakdown id for rows whose category was deleted (or never set). */
export const UNCATEGORISED = 'uncategorised'

export interface TransactionFilters {
  kind?: TxnKind
  categoryId?: string
  /** Rows the person added OR earned. */
  personId?: string
  /** Free text: matches note, category name or a person's name. */
  search?: string
}

/**
 * One page of shared transactions in `[start, end]`, newest first, with the
 * filters applied server-side. Category / person name matches for `search`
 * are resolved to ids client-side from `lookup` (both lists are small and
 * already loaded), then pushed down as `in.(...)` filters.
 */
export async function listTransactionsPage(
  args: {
    start: string
    end: string
    offset: number
    limit: number
    filters: TransactionFilters
    lookup: { categories: Category[]; names: UserNames }
  },
  signal?: AbortSignal,
): Promise<TransactionWithCategory[]> {
  const { start, end, offset, limit, filters: f, lookup } = args
  let q = transactionQuery(start, end)
  if (f.kind) q = q.eq('kind', f.kind)
  // `ledger_summary` groups rows without a category under the id 'uncategorised'.
  if (f.categoryId === UNCATEGORISED) q = q.is('category_id', null)
  else if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (f.personId) q = q.or(`user_id.eq.${f.personId},earned_by.eq.${f.personId}`)

  const term = f.search?.trim()
  if (term) {
    const lower = term.toLowerCase()
    const catIds = lookup.categories.filter((c) => c.name.toLowerCase().includes(lower)).map((c) => c.id)
    const personIds = [...lookup.names].filter(([, n]) => n.toLowerCase().includes(lower)).map(([id]) => id)
    const parts = [
      `note.ilike.${likePattern(term)}`,
      inList('category_id', catIds),
      inList('user_id', personIds),
      inList('earned_by', personIds),
    ].filter((p): p is string => p !== null)
    q = q.or(parts.join(','))
  }

  q = orderedTransactions(q).range(offset, offset + limit - 1)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) fail(error)
  return (data ?? []) as TransactionWithCategory[]
}

export interface DayGroup {
  /** `YYYY-MM-DD` */
  day: string
  items: LedgerRow[]
}

/** Consecutive rows sharing `occurred_on` (lists are already newest first). */
export function groupByDay(items: LedgerRow[]): DayGroup[] {
  const out: DayGroup[] = []
  for (const t of items) {
    const last = out[out.length - 1]
    if (last && last.day === t.occurred_on) last.items.push(t)
    else out.push({ day: t.occurred_on, items: [t] })
  }
  return out
}

/**
 * Every shared transaction with `start <= occurred_on <= end` (export only).
 * PostgREST caps a single response at 1000 rows, so this pages through.
 */
export async function listTransactionsBetween(start: string, end: string): Promise<TransactionWithCategory[]> {
  const CHUNK = 1000
  const out: TransactionWithCategory[] = []
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await orderedTransactions(transactionQuery(start, end)).range(offset, offset + CHUNK - 1)
    if (error) fail(error)
    const rows = (data ?? []) as TransactionWithCategory[]
    out.push(...rows)
    if (rows.length < CHUNK) return out
  }
}

export interface TransactionInput {
  kind: TxnKind
  amount: number
  category_id: string | null
  occurred_on: string
  note: string | null
  payment_method: string | null
  /** Income only; the DB nulls it for expenses and defaults it to the creator. */
  earned_by: string | null
}

export async function createTransaction(input: TransactionInput): Promise<void> {
  const { error } = await supabase.from('transactions').insert(input)
  if (error) fail(error)
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const { error } = await supabase.from('transactions').update(input).eq('id', id)
  if (error) fail(error)
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) fail(error)
}

// Budgets ---------------------------------------------------------------------

export async function listBudgetsForMonth(key: string): Promise<Budget[]> {
  const { start } = monthRange(key)
  const { data, error } = await supabase.from('budgets').select('*').eq('month', start)
  if (error) fail(error)
  return data ?? []
}

export async function upsertBudget(input: {
  month: string
  category_id: string | null
  amount: number
}): Promise<void> {
  const userId = await currentUserId()

  // Household budgets: one row per (category, month) regardless of creator.
  let q = supabase.from('budgets').select('id').eq('month', input.month)
  q = input.category_id ? q.eq('category_id', input.category_id) : q.is('category_id', null)
  const { data: existing, error: findErr } = await q.maybeSingle()
  if (findErr) fail(findErr)

  if (existing) {
    const { error } = await supabase.from('budgets').update({ amount: input.amount }).eq('id', existing.id)
    if (error) fail(error)
  } else {
    const { error } = await supabase.from('budgets').insert({ ...input, user_id: userId })
    if (error) fail(error)
  }
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) fail(error)
}

// Recurring expenses ----------------------------------------------------------
//
// Templates added to a month in bulk by hand. Duplicates are allowed; the
// `recurring_id` on the inserted transactions only drives the "already added" hint.

export type RecurringExpense = Tables<'recurring_expenses'>

export interface RecurringWithCategory extends RecurringExpense {
  category: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null
}

export interface RecurringInput {
  category_id: string
  amount: number
  day_of_month: number
  note: string | null
  payment_method: string
}

export async function listRecurring(): Promise<RecurringWithCategory[]> {
  const { data, error } = await supabase
    .from('recurring_expenses')
    .select('*, category:expense_categories(id, name, icon, color)')
    .order('day_of_month')
    .order('id')
  if (error) fail(error)
  return (data ?? []) as RecurringWithCategory[]
}

export async function createRecurring(input: RecurringInput): Promise<void> {
  const { error } = await supabase.from('recurring_expenses').insert(input)
  if (error) fail(error)
}

export async function updateRecurring(id: string, patch: Partial<RecurringInput & { active: boolean }>): Promise<void> {
  const { error } = await supabase.from('recurring_expenses').update(patch).eq('id', id)
  if (error) fail(error)
}

export async function deleteRecurring(id: string): Promise<void> {
  const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
  if (error) fail(error)
}

/** 1 → "1st", 22 → "22nd". */
export function ordinal(n: number) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** `YYYY-MM-DD` for a template's day inside a `YYYY-MM` month. */
export function recurringDate(key: string, day: number) {
  const { date } = monthRange(key)
  return format(new Date(date.getFullYear(), date.getMonth(), day), 'yyyy-MM-dd')
}

/** recurring id → dates it was already added on within the month. */
export async function recurringAddedInMonth(key: string): Promise<Map<string, string[]>> {
  const { start, end } = monthRange(key)
  const { data, error } = await supabase
    .from('transactions')
    .select('recurring_id, occurred_on')
    .not('recurring_id', 'is', null)
    .gte('occurred_on', start)
    .lte('occurred_on', end)
    .order('occurred_on')
  if (error) fail(error)
  const map = new Map<string, string[]>()
  for (const r of data ?? []) {
    if (!r.recurring_id) continue
    map.set(r.recurring_id, [...(map.get(r.recurring_id) ?? []), r.occurred_on])
  }
  return map
}

/** One insert for every chosen template, dated on its day in `key`. */
export async function addRecurringForMonth(items: RecurringExpense[], key: string): Promise<void> {
  const rows = items.map((r) => ({
    kind: 'expense' as const,
    amount: r.amount,
    category_id: r.category_id,
    occurred_on: recurringDate(key, r.day_of_month),
    note: r.note,
    payment_method: r.payment_method,
    recurring_id: r.id,
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from('transactions').insert(rows)
  if (error) fail(error)
}

// Aggregates ------------------------------------------------------------------
//
// Screens show server-side pages, so totals come from the `ledger_summary`
// RPC rather than from whatever happens to be loaded. The client-side
// `summarise*` helpers below remain for the Excel export, which has all rows.

/** Raw shape returned by `public.ledger_summary(start, end)`. */
export interface LedgerSummaryRpc {
  spent: number
  income: number
  by_category: { id: string; name: string; icon: string; color: string; kind: TxnKind; total: number; count: number }[]
  /** Per creator: everything they spent / recorded as income; `count` = expense rows only. */
  added_by: { id: string; spent: number; income: number; count: number }[]
  /** Per earner (falls back to creator for legacy rows): income only. */
  earned_by: { id: string; income: number; count: number }[]
  by_month: { month: string; spent: number; income: number }[]
}

export async function fetchLedgerSummary(start: string, end: string): Promise<LedgerSummaryRpc> {
  const { data, error } = await supabase.rpc('ledger_summary', { p_start: start, p_end: end })
  if (error) fail(error)
  return data as unknown as LedgerSummaryRpc
}

export const EMPTY_SUMMARY: MonthSummary = { spent: 0, income: 0, net: 0, byCategory: [], incomeByCategory: [] }

/** RPC → the `MonthSummary` shape the tiles and breakdowns render. */
export function toMonthSummary(s: LedgerSummaryRpc): MonthSummary {
  const spent = Number(s.spent)
  const income = Number(s.income)
  const rows = (kind: TxnKind, denom: number) =>
    s.by_category
      .filter((c) => c.kind === kind)
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        total: Number(c.total),
        count: Number(c.count),
        share: denom > 0 ? Number(c.total) / denom : 0,
      }))
  return { spent, income, net: income - spent, byCategory: rows('expense', spent), incomeByCategory: rows('income', income) }
}

/** RPC → 12 calendar-month rows for `year`. */
export function toMonthTotals(s: LedgerSummaryRpc, year: number): MonthTotals[] {
  const byKey = new Map(s.by_month.map((m) => [m.month, m]))
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1)
    const key = format(d, 'yyyy-MM')
    const m = byKey.get(key)
    const spent = Number(m?.spent ?? 0)
    const income = Number(m?.income ?? 0)
    return { month: i + 1, key, label: format(d, 'MMM'), spent, income, net: income - spent }
  })
}

/** RPC → per-person rows: spending by who added it, income by who earned it. */
export function toPersonTotals(s: LedgerSummaryRpc, names: UserNames): PersonTotals[] {
  const map = new Map<string, PersonTotals>()
  const entry = (id: string) => {
    const e = map.get(id) ?? { name: names.get(id) ?? 'Unknown', spent: 0, income: 0, count: 0 }
    map.set(id, e)
    return e
  }
  // `added_by.count` is expenses only, so a row is credited once: expenses to
  // whoever added them, income to whoever earned it.
  for (const p of s.added_by) {
    const e = entry(p.id)
    e.spent += Number(p.spent)
    e.count += Number(p.count)
  }
  for (const p of s.earned_by) {
    const e = entry(p.id)
    e.income += Number(p.income)
    e.count += Number(p.count)
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent)
}

export interface MonthSummary {
  spent: number
  income: number
  net: number
  /** Expense categories, largest first; `share` is of `spent`. */
  byCategory: CategoryTotal[]
  /** Income categories, largest first; `share` is of `income`. */
  incomeByCategory: CategoryTotal[]
}

export interface CategoryTotal {
  id: string
  name: string
  color: string
  icon: string
  total: number
  /** Transactions behind `total` (ledger breakdowns only). */
  count?: number
  share: number
}

/**
 * A tapped breakdown row as the latest summary has it, so a drill-down header
 * follows edits; zeroed once its last transaction is moved or deleted.
 */
export function liveCategoryRow(tapped: CategoryTotal, kind: TxnKind, summary: MonthSummary): CategoryTotal {
  const rows = kind === 'income' ? summary.incomeByCategory : summary.byCategory
  return rows.find((r) => r.id === tapped.id) ?? { ...tapped, total: 0, count: 0, share: 0 }
}

export function summarise(txns: TransactionWithCategory[]): MonthSummary {
  let spent = 0
  let income = 0
  const maps: Record<TxnKind, Map<string, CategoryTotal>> = { expense: new Map(), income: new Map() }
  for (const t of txns) {
    const amt = Number(t.amount)
    if (t.kind === 'income') income += amt
    else spent += amt
    const map = maps[t.kind]
    const key = t.category?.id ?? UNCATEGORISED
    const entry = map.get(key) ?? {
      id: key,
      name: t.category?.name ?? 'Uncategorised',
      color: t.category?.color ?? '#94a3b8',
      icon: t.category?.icon ?? 'tag',
      total: 0,
      count: 0,
      share: 0,
    }
    entry.total += amt
    entry.count = (entry.count ?? 0) + 1
    map.set(key, entry)
  }
  const rows = (map: Map<string, CategoryTotal>, denom: number) =>
    [...map.values()].sort((a, b) => b.total - a.total).map((c) => ({ ...c, share: denom > 0 ? c.total / denom : 0 }))
  return {
    spent,
    income,
    net: income - spent,
    byCategory: rows(maps.expense, spent),
    incomeByCategory: rows(maps.income, income),
  }
}

export interface MonthTotals {
  /** 1..12 */
  month: number
  key: string
  label: string
  spent: number
  income: number
  net: number
}

/** Spent / income per calendar month of `year` (always 12 entries). */
export function summariseByMonth(txns: TransactionWithCategory[], year: number): MonthTotals[] {
  const rows: MonthTotals[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1)
    return { month: i + 1, key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), spent: 0, income: 0, net: 0 }
  })
  for (const t of txns) {
    const m = Number(t.occurred_on.slice(5, 7))
    const row = rows[m - 1]
    if (!row || t.occurred_on.slice(0, 4) !== String(year)) continue
    if (t.kind === 'income') row.income += Number(t.amount)
    else row.spent += Number(t.amount)
  }
  for (const r of rows) r.net = r.income - r.spent
  return rows
}

export interface PersonTotals {
  name: string
  spent: number
  income: number
  count: number
}

/** Spending per "Added by" person and income per "Earned by" person, largest spender first. */
export function summariseByPerson(rows: LedgerRow[]): PersonTotals[] {
  const map = new Map<string, PersonTotals>()
  for (const r of rows) {
    const person = r.kind === 'income' ? (r.earned_by_name ?? r.added_by) : r.added_by
    const entry = map.get(person) ?? { name: person, spent: 0, income: 0, count: 0 }
    if (r.kind === 'income') entry.income += Number(r.amount)
    else entry.spent += Number(r.amount)
    entry.count++
    map.set(person, entry)
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent)
}
