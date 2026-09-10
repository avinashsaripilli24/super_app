import * as React from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { amountInWords } from '@/lib/money-words'
import { cn, formatMoney } from '@/lib/utils'

/**
 * A money figure that reveals the amount in words (Indian convention) when
 * tapped. Use it on totals and read-only amounts; money *inputs* show the words
 * permanently instead, via `Field`'s `hint`.
 *
 * Renders a `<button>`, so it cannot be nested inside another button — rows
 * that are already tappable open a sheet where the words are shown.
 */
function MoneyWords({
  amount,
  currency = 'INR',
  label,
  className,
  align = 'center',
  children,
}: {
  amount: number
  currency?: string
  /** Heading inside the popover, e.g. "Spent" or a category name. */
  label?: string
  className?: string
  align?: 'start' | 'center' | 'end'
  /** Defaults to the formatted amount; pass custom content for signs or layout. */
  children?: React.ReactNode
}) {
  const words = amountInWords(amount, currency)
  const body = children ?? formatMoney(amount, currency)
  // Nothing to spell (unsupported currency): stay a plain figure.
  if (!words) return <span className={className}>{body}</span>
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label ? `${label}: ` : ''}${formatMoney(amount, currency)}. Show amount in words`}
        className={cn(
          'cursor-pointer rounded-sm text-left underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          className,
        )}
      >
        {body}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-3">
        {label ? (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        ) : null}
        <p className="text-sm font-semibold tabular-nums">{formatMoney(amount, currency)}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{words}</p>
      </PopoverContent>
    </Popover>
  )
}

export { MoneyWords }
