// Annualised return (XIRR) from dated cash flows, computed client-side from a
// holding's full transaction list plus its current value.

import { parseISO } from 'date-fns'

import type { HoldingRow, HoldingTxn } from '@/modules/assets/api'

export interface CashFlow {
  /** `YYYY-MM-DD` */
  date: string
  /** Negative = money out of pocket (buy), positive = money received. */
  amount: number
}

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

/**
 * XIRR by Newton's method with a bisection fallback. Returns null when the
 * flows cannot produce a meaningful rate: fewer than two flows, all in one
 * direction, spanning under 30 days, or no convergence.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const t0 = parseISO(sorted[0]!.date).getTime()
  const pts = sorted.map((f) => ({ t: (parseISO(f.date).getTime() - t0) / DAY_MS / YEAR_DAYS, a: f.amount }))
  const spanDays = pts[pts.length - 1]!.t * YEAR_DAYS
  if (spanDays < 30) return null
  if (!pts.some((p) => p.a < 0) || !pts.some((p) => p.a > 0)) return null

  const f = (r: number) => pts.reduce((s, p) => s + p.a / Math.pow(1 + r, p.t), 0)
  const df = (r: number) => pts.reduce((s, p) => s - (p.t * p.a) / Math.pow(1 + r, p.t + 1), 0)

  let r = 0.1
  for (let i = 0; i < 100; i++) {
    const fv = f(r)
    const d = df(r)
    if (!Number.isFinite(fv) || !Number.isFinite(d) || d === 0) break
    const next = r - fv / d
    if (!Number.isFinite(next) || next <= -0.999999) break
    if (Math.abs(next - r) < 1e-7) return next
    r = next
  }

  let lo = -0.99
  let hi = 10
  let flo = f(lo)
  const fhi = f(hi)
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (Math.abs(fm) < 1e-6 || hi - lo < 1e-7) return mid
    if (flo * fm < 0) {
      hi = mid
    } else {
      lo = mid
      flo = fm
    }
  }
  return null
}

/**
 * Cash flows of an asset holding: buys out, redemptions and income in, bonus
 * units ignored, and today's value as a final inflow while it is still open.
 * Debts return no flows (XIRR is not shown for them).
 */
export function holdingCashFlows(
  txns: HoldingTxn[],
  row: Pick<HoldingRow, 'kind' | 'status' | 'current_value'>,
  today: string,
): CashFlow[] {
  if (row.kind !== 'asset') return []
  const out: CashFlow[] = []
  for (const t of txns) {
    const amt = Number(t.amount)
    if (t.type === 'invest') out.push({ date: t.occurred_on, amount: -amt })
    else if (t.type === 'redeem' || t.type === 'income') out.push({ date: t.occurred_on, amount: amt })
  }
  if (row.status === 'active' && row.current_value > 0) out.push({ date: today, amount: row.current_value })
  return out
}
