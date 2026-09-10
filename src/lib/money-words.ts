/**
 * Amounts spelled out with Indian place values (thousand → lakh → crore), the
 * way they are written on cheques and invoices:
 *
 *   1234567.5 → "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty
 *                Seven and Fifty Paise Only"
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** 0–99. Returns '' for 0 so callers can skip empty groups. */
function underHundred(n: number): string {
  if (n < 20) return ONES[n]!
  const tens = TENS[Math.floor(n / 10)]!
  const ones = ONES[n % 10]!
  return ones ? `${tens} ${ones}` : tens
}

/** 0–999. Returns '' for 0. */
function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) parts.push(underHundred(rest))
  return parts.join(' ')
}

/**
 * A whole number in Indian grouping: the last three digits, then two-digit
 * groups for thousand and lakh, and everything above that as crore — recursed
 * through the same grouping, so 1e11 reads "One Lakh Crore".
 */
export function numberToIndianWords(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (!Number.isFinite(n)) return ''
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 1e7)
  const lakh = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest = n % 1e3
  const parts: string[] = []
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`)
  if (lakh) parts.push(`${underHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${underHundred(thousand)} Thousand`)
  if (rest) parts.push(underThousand(rest))
  return parts.join(' ')
}

/** Major / minor unit names per ISO currency. Only these can be spelled out. */
const CURRENCY_UNITS: Record<string, { major: string; minor: string }> = {
  INR: { major: 'Rupees', minor: 'Paise' },
}

/**
 * Cheque-style reading of `amount`, or `null` when there is nothing sensible to
 * spell — an empty/NaN input (money inputs register with `valueAsNumber`, so an
 * empty field arrives as NaN) or a currency with no unit names above.
 */
export function amountInWords(amount: number | null | undefined, currency = 'INR'): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  const units = CURRENCY_UNITS[currency.toUpperCase()]
  if (!units) return null
  // Round to paise first, so 1.005 reads "One Rupee and One Paisa", not
  // "…Zero Paise" from a float remainder.
  const paise = Math.round(Math.abs(amount) * 100)
  const major = Math.floor(paise / 100)
  const minor = paise % 100
  const parts = [units.major, numberToIndianWords(major)]
  if (minor) parts.push('and', underHundred(minor), units.minor)
  parts.push('Only')
  const words = parts.join(' ')
  return amount < 0 ? `Minus ${words}` : words
}
