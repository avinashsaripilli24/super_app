import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * A column of shimmer placeholders shaped like list rows. Pass `row` to
 * render a custom placeholder per row (e.g. a table row with badges).
 */
export function ListSkeleton({
  rows = 5,
  row,
  itemClassName = 'h-14 rounded-xl',
  className,
}: {
  rows?: number
  row?: (index: number) => ReactNode
  itemClassName?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) =>
        row ? <div key={i}>{row(i)}</div> : <Skeleton key={i} className={itemClassName} />,
      )}
    </div>
  )
}
