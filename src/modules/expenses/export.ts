// Excel export for the shared ledger. exceljs is loaded on demand so it stays
// out of the initial bundle.

import { format, parseISO } from 'date-fns'

import {
  summarise,
  summariseByMonth,
  summariseByPerson,
  type LedgerRow,
  type TxnKind,
} from '@/modules/expenses/api'

export type ExportKind = 'all' | TxnKind

export interface ExportOptions {
  /** Human label for the Summary sheet, e.g. "September 2026". */
  title: string
  /** File-name safe label, e.g. "2026-09". */
  fileLabel: string
  rows: LedgerRow[]
  kind: ExportKind
  /** When set, a "By month" table is added to the Summary sheet. */
  year?: number
}

const HEADER_FILL = 'FFE2E8F0'
const MONEY = '#,##0.00'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  other: 'Other',
}

export async function exportLedgerToExcel(opts: ExportOptions): Promise<string> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'Super App'
  wb.created = new Date()

  const expenses = opts.rows.filter((r) => r.kind === 'expense')
  const income = opts.rows.filter((r) => r.kind === 'income')

  if (opts.kind !== 'income') addLedgerSheet(wb, 'Expenses', expenses, { earnedBy: false })
  if (opts.kind !== 'expense') addLedgerSheet(wb, 'Income', income, { earnedBy: true })
  addSummarySheet(wb, opts)

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `super-app-expenses-${opts.fileLabel}.xlsx`
  download(buffer, fileName)
  return fileName
}

type Sheet = ReturnType<InstanceType<typeof import('exceljs').Workbook>['addWorksheet']>

function addLedgerSheet(
  wb: InstanceType<typeof import('exceljs').Workbook>,
  name: string,
  rows: LedgerRow[],
  opts: { earnedBy: boolean },
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  // Amount stays in column D: the total row below sums D.
  ws.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd-mmm-yyyy' } },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Note', key: 'note', width: 32 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: MONEY } },
    { header: 'Currency', key: 'currency', width: 9 },
    { header: opts.earnedBy ? 'Received via' : 'Paid via', key: 'method', width: 14 },
    ...(opts.earnedBy ? [{ header: 'Earned by', key: 'earned_by', width: 20 }] : []),
    { header: 'Added by', key: 'added_by', width: 20 },
    { header: 'Created at', key: 'created_at', width: 18, style: { numFmt: 'dd-mmm-yyyy hh:mm' } },
  ]
  styleHeader(ws)

  for (const r of rows) {
    ws.addRow({
      date: parseISO(r.occurred_on),
      category: r.category?.name ?? 'Uncategorised',
      note: r.note ?? '',
      amount: Number(r.amount),
      currency: r.currency,
      method: METHOD_LABEL[r.payment_method ?? ''] ?? r.payment_method ?? '',
      earned_by: r.earned_by_name ?? r.added_by,
      added_by: r.added_by,
      created_at: new Date(r.created_at),
    })
  }

  const last = ws.rowCount
  if (rows.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: ws.columnCount } }
    const total = ws.addRow({ note: 'Total', amount: { formula: `SUM(D2:D${last})` } })
    total.font = { bold: true }
    total.getCell('amount').numFmt = MONEY
  } else {
    ws.addRow({ note: 'No rows in this range' })
  }
}

function addSummarySheet(wb: InstanceType<typeof import('exceljs').Workbook>, opts: ExportOptions) {
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 12 }]

  const title = ws.addRow([`Super App — Expense export`])
  title.font = { bold: true, size: 14 }
  ws.addRow([`Range: ${opts.title}`])
  ws.addRow([`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`])
  ws.addRow([])

  const s = summarise(opts.rows)
  section(ws, 'Totals', ['Metric', 'Amount'])
  moneyRow(ws, ['Spent', s.spent])
  moneyRow(ws, ['Income', s.income])
  moneyRow(ws, ['Net', s.net])
  ws.addRow([])

  if (opts.kind !== 'income') {
    section(ws, 'Spending by category', ['Category', 'Amount', 'Share'])
    for (const c of s.byCategory) {
      const row = ws.addRow([c.name, c.total, c.share])
      row.getCell(2).numFmt = MONEY
      row.getCell(3).numFmt = '0%'
    }
    ws.addRow([])
  }

  if (opts.kind !== 'expense') {
    section(ws, 'Income by category', ['Category', 'Amount', 'Share'])
    for (const c of s.incomeByCategory) {
      const row = ws.addRow([c.name, c.total, c.share])
      row.getCell(2).numFmt = MONEY
      row.getCell(3).numFmt = '0%'
    }
    ws.addRow([])
  }

  section(ws, 'By person', ['Person', 'Spent (added)', 'Income (earned)', 'Rows'])
  for (const p of summariseByPerson(opts.rows)) {
    const row = ws.addRow([p.name, p.spent, p.income, p.count])
    row.getCell(2).numFmt = MONEY
    row.getCell(3).numFmt = MONEY
  }
  ws.addRow([])

  if (opts.year) {
    section(ws, `By month (${opts.year})`, ['Month', 'Spent', 'Income', 'Net'])
    for (const m of summariseByMonth(opts.rows, opts.year)) {
      const row = ws.addRow([`${m.label} ${opts.year}`, m.spent, m.income, m.net])
      row.getCell(2).numFmt = MONEY
      row.getCell(3).numFmt = MONEY
      row.getCell(4).numFmt = MONEY
    }
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
