import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an amount in the given ISO currency for the en-IN locale. */
export function formatMoney(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Compact Indian-style amount for axis labels: 850 → "850", 65000 → "65k", 2.5L, 1.2Cr. */
export function formatCompactINR(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}${trim(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}k`
  return `${sign}${Math.round(abs)}`
}

function trim(v: number) {
  return (Math.round(v * 10) / 10).toString()
}

/** Short human-readable error message from an unknown thrown value. */
export function errorMessage(err: unknown, fallback = 'Something went wrong') {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}
