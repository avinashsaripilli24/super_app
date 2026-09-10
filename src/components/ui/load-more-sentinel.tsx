import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/list-skeleton'

/**
 * Tail of an infinitely-scrolling list. Renders, in priority order: a retry
 * prompt after a failed page, shimmer rows while the next page loads, an
 * invisible sentinel that triggers the next page when scrolled into view, or
 * an optional "end of list" caption.
 *
 * The sentinel is unmounted while a page loads and remounted afterwards, which
 * re-runs the ref callback and re-observes it. That keeps loading going when a
 * page is too short to push the sentinel out of view.
 */
export function LoadMoreSentinel({
  sentinelRef,
  hasMore,
  loadingMore,
  error,
  onRetry,
  rows = 3,
  row,
  itemClassName,
  endLabel,
}: {
  sentinelRef: (node: HTMLElement | null) => void
  hasMore: boolean
  loadingMore: boolean
  error: boolean
  onRetry: () => void
  rows?: number
  row?: (index: number) => ReactNode
  itemClassName?: string
  endLabel?: string
}) {
  if (error) {
    return (
      <div className="flex items-center justify-center gap-3 py-3 text-xs text-muted-foreground">
        <span>Couldn’t load more</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  if (loadingMore) {
    return <ListSkeleton rows={rows} row={row} itemClassName={itemClassName} className="pt-2" />
  }
  if (hasMore) {
    return <div ref={sentinelRef} aria-hidden className="h-px w-full" />
  }
  if (endLabel) {
    return <p className="py-3 text-center text-xs text-muted-foreground">{endLabel}</p>
  }
  return null
}
