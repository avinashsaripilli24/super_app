import { MoneyWords } from '@/components/ui/money'
import { cn } from '@/lib/utils'

export function StatTile({
  label,
  value,
  amount,
  currency,
  tone = 'default',
}: {
  label: string
  value: string
  /** When given, tapping the tile shows the amount in words. */
  amount?: number
  currency?: string
  tone?: 'default' | 'success' | 'destructive'
}) {
  // Lakh/crore figures (₹1,13,500.00, ₹63,31,312.69) are far wider than
  // ₹320.00 and these tiles sit three-across on a 360px phone, so step the
  // size down by length rather than clip the number.
  const size =
    value.length <= 10 ? 'text-sm sm:text-base' : value.length <= 13 ? 'text-xs sm:text-sm' : 'text-[11px] sm:text-sm'
  const inner = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate font-semibold tabular-nums',
          size,
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </>
  )

  if (amount === undefined) {
    return <div className="rounded-xl border bg-card p-3">{inner}</div>
  }

  return (
    <MoneyWords
      amount={amount}
      currency={currency}
      label={label}
      className="block w-full rounded-xl border bg-card p-3 no-underline transition-colors hover:bg-accent/40 active:bg-accent"
    >
      {inner}
    </MoneyWords>
  )
}
