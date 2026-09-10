import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/utils'

export const DEFAULT_PAGE_SIZE = 25

export interface InfiniteList<T> {
  /** Rows loaded so far for the current key. */
  items: T[]
  /** No rows yet for the current key (show skeletons for the whole list). */
  loading: boolean
  /** A further page is in flight (show skeleton rows under the list). */
  loadingMore: boolean
  /** The server may have more rows after `items`. */
  hasMore: boolean
  /** The last page request failed; scrolling is paused until `loadMore()` or `reload()`. */
  error: boolean
  /** `reload()` in flight; existing rows stay visible. */
  refreshing: boolean
  loadMore: () => void
  /**
   * Re-fetch everything loaded so far (first `max(pageSize, items.length)`
   * rows, capped) in one request, so scroll position survives an add/edit/delete.
   */
  reload: () => void
  /** Ref callback for the element that triggers `loadMore()` when scrolled into view. */
  sentinelRef: (node: HTMLElement | null) => void
}

type Mode = 'idle' | 'first' | 'more' | 'reload'

interface State<T> {
  key: string
  items: T[]
  hasMore: boolean
  error: boolean
  loadedOnce: boolean
}

/**
 * Server-side paged list tied to `key` (filters, month, search…). When the key
 * changes the list resets and fetches the first page; an IntersectionObserver
 * on `sentinelRef` appends pages of `pageSize` as the user scrolls. Stale or
 * aborted responses are dropped; errors surface as a toast.
 *
 * `loader` receives `(offset, limit, signal)` and must return at most `limit`
 * rows in a stable order (add a unique tiebreaker such as `id` to the query).
 */
export function useInfiniteList<T>(
  loader: (offset: number, limit: number, signal: AbortSignal) => Promise<T[]>,
  key: string,
  opts: { pageSize?: number; errorLabel?: string; rootMargin?: string } = {},
): InfiniteList<T> {
  const { pageSize = DEFAULT_PAGE_SIZE, errorLabel = 'Failed to load', rootMargin = '0px 0px 480px 0px' } = opts

  const [state, setState] = useState<State<T>>(() => ({
    key,
    items: [],
    hasMore: true,
    error: false,
    loadedOnce: false,
  }))
  const [mode, setMode] = useState<Mode>('idle')

  // Latest props/state for handlers that must not re-subscribe on every render.
  const latest = useRef({ loader, key, state, pageSize, errorLabel })
  useEffect(() => {
    latest.current = { loader, key, state, pageSize, errorLabel }
  })

  const requestId = useRef(0)
  const busy = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // `mode` for 'more' / 'reload' is set by the handlers below (the first page
  // is reported through `loading`), so the key effect never sets state
  // synchronously.
  const fetchPage = useCallback(async (offset: number, limit: number, fetchMode: Exclude<Mode, 'idle'>) => {
    const { loader, key, errorLabel } = latest.current
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const id = ++requestId.current
    busy.current = true
    try {
      const rows = await loader(offset, limit, ac.signal)
      if (id !== requestId.current) return
      setState((s) => ({
        key,
        loadedOnce: true,
        error: false,
        hasMore: rows.length >= limit,
        items: fetchMode === 'more' && s.key === key ? [...s.items, ...rows] : rows,
      }))
    } catch (err) {
      // Superseded or aborted requests (typing in a search box, switching
      // months) are expected; only report failures of the current request.
      if (id !== requestId.current || ac.signal.aborted) return
      toast.error(errorMessage(err, errorLabel))
      setState((s) => ({
        key,
        items: s.key === key ? s.items : [],
        hasMore: s.key === key ? s.hasMore : false,
        loadedOnce: true,
        error: true,
      }))
    } finally {
      if (id === requestId.current) {
        busy.current = false
        setMode('idle')
      }
    }
  }, [])

  // First page whenever the key changes. No synchronous reset is needed: while
  // `state.key !== key` the hook already reports empty items + loading, and the
  // first page's response replaces the state wholesale.
  useEffect(() => {
    void fetchPage(0, pageSize, 'first')
    return () => abortRef.current?.abort()
  }, [key, pageSize, fetchPage])

  const loadMore = useCallback(() => {
    const { state, key, pageSize } = latest.current
    if (busy.current || state.key !== key || !state.hasMore) return
    setMode('more')
    void fetchPage(state.items.length, pageSize, 'more')
  }, [fetchPage])

  const reload = useCallback(() => {
    const { state, key, pageSize } = latest.current
    const loaded = state.key === key ? state.items.length : 0
    const limit = Math.min(Math.max(pageSize, loaded), pageSize * 8)
    setMode('reload')
    void fetchPage(0, limit, 'reload')
  }, [fetchPage])

  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!node) return
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) loadMore()
        },
        { rootMargin },
      )
      io.observe(node)
      observer.current = io
    },
    [loadMore, rootMargin],
  )
  useEffect(() => () => observer.current?.disconnect(), [])

  const stale = state.key !== key
  return {
    items: stale ? [] : state.items,
    loading: stale || !state.loadedOnce,
    loadingMore: !stale && mode === 'more',
    hasMore: stale ? false : state.hasMore,
    error: stale ? false : state.error,
    refreshing: mode === 'reload',
    loadMore,
    reload,
    sentinelRef,
  }
}
