// Excel export for assets & debts. exceljs is loaded on demand so it stays out
// of the initial bundle.

import { format, parseISO } from 'date-fns'

import {
  absReturn,
  type ActivityRow,
  type AssetsOverview,
  type HoldingRow,
  type UserNames,
} from '@/modules/assets/api'
import { ASSET_CLASS_LABEL, KIND_LABEL, STATUS_LABEL, TXN_TYPE_LABEL } from '@/modules/assets/labels'

export interface AssetsExportOptions {
  /** Human label for the transactions range, e.g. "September 2026". */
  title: string
  /** File-name safe label, e.g. "2026-09". */
  fileLabel: string
  holdings: HoldingRow[]
  transactions: ActivityRow[]
  overview: AssetsOverview
  names: UserNames
}

const HEADER_FILL = 'FFE2E8F0'
const MONEY = '#,##0.00'
const UNITS = '#,##0.####'

type Workbook = InstanceType<typeof import('exceljs').Workbook>
type Sheet = ReturnType<Workbook['addWorksheet']>

export async function exportAssetsToExcel(opts: AssetsExportOptions): Promise<string> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'Super App'
  wb.created = new Date()

  addHoldingsSheet(wb, opts)
  addTransactionsSheet(wb, opts)
  addSummarySheet(wb, opts)

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `super-app-assets-${opts.fileLabel}.xlsx`
  download(buffer, fileName)
  return fileName
}

function addHoldingsSheet(wb: Workbook, opts: AssetsExportOptions) {
  const ws = wb.addWorksheet('Holdings', { views: [{ state: 'frozen', ySplit: 1 }] })
  // Current value stays in column J: the total row below sums J.
  ws.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Kind', key: 'kind', width: 8 },
    { header: 'Holder', key: 'holder', width: 18 },
    { header: 'Institution', key: 'institution', width: 16 },
    { header: 'Identifier', key: 'identifier', width: 16 },
    { header: 'Status', key: 'status', width: 8 },
    { header: 'Units', key: 'units', width: 12, style: { numFmt: UNITS } },
    { header: 'Price', key: 'price', width: 12, style: { numFmt: MONEY } },
    { header: 'Current value', key: 'current', width: 16, style: { numFmt: MONEY } },
    { header: 'Invested / Borrowed', key: 'invested', width: 18, style: { numFmt: MONEY } },
    { header: 'Withdrawn / Repaid', key: 'withdrawn', width: 18, style: { numFmt: MONEY } },
    { header: 'Gain', key: 'gain', width: 14, style: { numFmt: MONEY } },
    { header: 'Return', key: 'ret', width: 9, style: { numFmt: '0.0%' } },
    { header: 'Interest paid', key: 'interest', width: 14, style: { numFmt: MONEY } },
    { header: 'Last valued', key: 'valued', width: 12, style: { numFmt: 'dd-mmm-yyyy' } },
    { header: 'Maturity', key: 'maturity', width: 12, style: { numFmt: 'dd-mmm-yyyy' } },
    { header: 'Rate %', key: 'rate', width: 8 },
    { header: 'Added by', key: 'added_by', width: 18 },
  ]
  styleHeader(ws)

  const rows = [...opts.holdings].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.category_name.localeCompare(b.category_name) || b.current_value - a.current_value,
  )
  for (const h of rows) {
    const ret = absReturn(h)
    ws.addRow({
      name: h.name,
      type: h.category_name,
      kind: KIND_LABEL[h.kind],
      holder: opts.names.get(h.holder_id ?? h.user_id) ?? 'Unknown',
      institution: h.institution ?? '',
      identifier: h.identifier ?? '',
      status: STATUS_LABEL[h.status],
      units: h.valuation_mode === 'units' ? h.units_held : null,
      price: h.valuation_mode === 'units' ? h.unit_price : null,
      current: h.current_value,
      invested: h.invested,
      withdrawn: h.withdrawn,
      gain: h.gain,
      ret,
      interest: h.kind === 'debt' ? h.interest_paid : null,
      valued: h.last_valued_on ? parseISO(h.last_valued_on) : null,
      maturity: h.maturity_on ? parseISO(h.maturity_on) : null,
      rate: h.interest_rate,
      added_by: opts.names.get(h.user_id) ?? 'Unknown',
    })
  }

  const last = ws.rowCount
  if (rows.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: ws.columnCount } }
    const total = ws.addRow({ name: 'Total (assets − debts)', current: { formula: `SUMIF(C2:C${last},"Asset",J2:J${last})-SUMIF(C2:C${last},"Debt",J2:J${last})` } })
    total.font = { bold: true }
    total.getCell('current').numFmt = MONEY
  } else {
    ws.addRow({ name: 'No holdings' })
  }
}

function addTransactionsSheet(wb: Workbook, opts: AssetsExportOptions) {
  const ws = wb.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd-mmm-yyyy' } },
    { header: 'Holding', key: 'holding', width: 28 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Transaction', key: 'txn', width: 24 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: MONEY } },
    { header: 'Units', key: 'units', width: 12, style: { numFmt: UNITS } },
    { header: 'Price', key: 'price', width: 12, style: { numFmt: MONEY } },
    { header: 'Interest part', key: 'interest', width: 13, style: { numFmt: MONEY } },
    { header: 'Holder', key: 'holder', width: 18 },
    { header: 'Note', key: 'note', width: 30 },
    { header: 'Added by', key: 'added_by', width: 18 },
  ]
  styleHeader(ws)

  for (const t of opts.transactions) {
    ws.addRow({
      date: parseISO(t.occurred_on),
      holding: t.holding.name,
      type: t.holding.category.name,
      txn: TXN_TYPE_LABEL[t.type],
      amount: Number(t.amount),
      units: t.quantity === null ? null : Number(t.quantity),
      price: t.unit_price === null ? null : Number(t.unit_price),
      interest: t.interest_amount === null ? null : Number(t.interest_amount),
      holder: t.holder_name,
      note: t.note ?? '',
      added_by: t.added_by,
    })
  }

  if (opts.transactions.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } }
  } else {
    ws.addRow({ holding: 'No transactions in this range' })
  }
}

function addSummarySheet(wb: Workbook, opts: AssetsExportOptions) {
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }]
  const o = opts.overview

  const title = ws.addRow(['Super App — Assets & debts'])
  title.font = { bold: true, size: 14 }
  ws.addRow([`Transactions range: ${opts.title}`])
  ws.addRow([`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')} (values as of today, active holdings)`])
  ws.addRow([])

  section(ws, 'Totals', ['Metric', 'Amount'])
  moneyRow(ws, ['Assets', o.assets])
  moneyRow(ws, ['Debts', o.debts])
  moneyRow(ws, ['Net worth', o.assets - o.debts])
  moneyRow(ws, ['Invested in assets', o.invested])
  moneyRow(ws, ['Unrealised + realised gain', o.gain])
  ws.addRow([])

  section(ws, 'By type', ['Type', 'Current', 'Invested / Borrowed', 'Target', 'Holdings'])
  for (const c of o.by_category) {
    const row = ws.addRow([`${c.name} (${KIND_LABEL[c.kind]})`, c.current, c.invested, c.target, c.holdings_count])
    row.getCell(2).numFmt = MONEY
    row.getCell(3).numFmt = MONEY
    row.getCell(4).numFmt = MONEY
  }
  ws.addRow([])

  section(ws, 'By holder', ['Holder', 'Assets', 'Debts', 'Net', 'Holdings'])
  for (const h of o.by_holder) {
    const row = ws.addRow([opts.names.get(h.id) ?? 'Unknown', h.assets, h.debts, h.assets - h.debts, h.count])
    row.getCell(2).numFmt = MONEY
    row.getCell(3).numFmt = MONEY
    row.getCell(4).numFmt = MONEY
  }
  ws.addRow([])

  section(ws, 'Asset allocation', ['Class', 'Current', 'Share'])
  for (const c of o.by_class) {
    const row = ws.addRow([ASSET_CLASS_LABEL[c.asset_class], c.current, o.assets > 0 ? c.current / o.assets : 0])
    row.getCell(2).numFmt = MONEY
    row.getCell(3).numFmt = '0%'
  }
}

function section(ws: Sheet, heading: string, headers: string[]) {
  const h = ws.addRow([heading])
  h.font = { bold: true, size: 12 }
  const head = ws.addRow(headers)
  head.font = { bold: true }
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
}

function moneyRow(ws: Sheet, values: [string, number]) {
  const row = ws.addRow(values)
  row.getCell(2).numFmt = MONEY
}

function styleHeader(ws: Sheet) {
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle' }
  })
}

function download(buffer: ArrayBuffer | Uint8Array, fileName: string) {
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
