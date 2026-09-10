// Display labels and constants for the assets module. Kept out of the page
// files so they only export components (react-refresh rule).

import type { Enums } from '@/lib/database.types'

type AssetKind = Enums<'asset_kind'>
type AssetClass = Enums<'asset_class'>
type HoldingTxnType = Enums<'holding_txn_type'>
type ValuationMode = Enums<'valuation_mode'>
type HoldingStatus = Enums<'holding_status'>

export const ASSET_TXN_TYPES = ['invest', 'redeem', 'income', 'bonus'] as const satisfies readonly HoldingTxnType[]
export const DEBT_TXN_TYPES = ['borrow', 'repay', 'charge'] as const satisfies readonly HoldingTxnType[]

export function txnTypesFor(kind: AssetKind): readonly HoldingTxnType[] {
  return kind === 'asset' ? ASSET_TXN_TYPES : DEBT_TXN_TYPES
}

/** Long label for pickers. */
export const TXN_TYPE_LABEL: Record<HoldingTxnType, string> = {
  invest: 'Buy / Invest',
  redeem: 'Sell / Redeem',
  income: 'Dividend / Interest received',
  bonus: 'Bonus units',
  borrow: 'Borrow / Disburse',
  repay: 'Repay (EMI / prepay)',
  charge: 'Interest / Charge',
}

/** Short label for list rows. */
export const TXN_TYPE_SHORT: Record<HoldingTxnType, string> = {
  invest: 'Invested',
  redeem: 'Redeemed',
  income: 'Received',
  bonus: 'Bonus',
  borrow: 'Borrowed',
  repay: 'Repaid',
  charge: 'Charged',
}

/** How a row moves money from the household's point of view. */
export const TXN_SIGN: Record<HoldingTxnType, '+' | '−' | ''> = {
  invest: '−',
  redeem: '+',
  income: '+',
  bonus: '',
  borrow: '+',
  repay: '−',
  charge: '',
}

/** Rows that add to the holding's value are shown in the success colour. */
export const TXN_TONE: Record<HoldingTxnType, 'success' | 'destructive' | 'default'> = {
  invest: 'default',
  redeem: 'success',
  income: 'success',
  bonus: 'default',
  borrow: 'destructive',
  repay: 'success',
  charge: 'destructive',
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: 'Equity',
  debt: 'Debt / Fixed income',
  cash: 'Cash',
  gold: 'Gold & metals',
  real_estate: 'Real estate',
  other: 'Other',
}

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  equity: '#2563eb',
  debt: '#0ea5e9',
  cash: '#22c55e',
  gold: '#eab308',
  real_estate: '#f97316',
  other: '#64748b',
}

/** Icon names from `CATEGORY_ICONS`. */
export const ASSET_CLASS_ICON: Record<AssetClass, string> = {
  equity: 'chart-line',
  debt: 'landmark',
  cash: 'banknote',
  gold: 'gem',
  real_estate: 'building-2',
  other: 'tag',
}

export const ASSET_CLASSES = ['equity', 'debt', 'cash', 'gold', 'real_estate', 'other'] as const satisfies readonly AssetClass[]

export const VALUATION_MODE_LABEL: Record<ValuationMode, string> = {
  units: 'Units × price (stocks, funds, gold)',
  value: 'Recorded value (deposits, property, loans)',
}

export const VALUATION_MODE_SHORT: Record<ValuationMode, string> = {
  units: 'Units × price',
  value: 'Recorded value',
}

/** Latest date the pickers allow for maturity / end dates. */
export const FAR_FUTURE = '2099-12-31'

export const STATUS_LABEL: Record<HoldingStatus, string> = {
  active: 'Active',
  closed: 'Closed',
}

export const KIND_LABEL: Record<AssetKind, string> = {
  asset: 'Asset',
  debt: 'Debt',
}
