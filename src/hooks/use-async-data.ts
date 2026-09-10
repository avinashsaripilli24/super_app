import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { toast } from 'sonner'

import { errorMessage } from '@/lib/utils'

export interface AsyncData<T> {
  /** Undefined until the first load for the current key completes. */
  data: T | undefined
  /** True while there is no data yet for the current key (show skeletons). */
  loading: boolean
  /** True while a `reload()` is in flight; existing data stays visible. */
  refreshing: boolean
  reload: () => void
}

type Result<T> = { ok: true; data: T } | { ok: false }

/**
 * Loads async data tied to `key` (e.g. the selected month). When the key
 * changes the previous data is discarded and `loading` flips on; `reload()`
 * re-fetches in the background keeping the current data on screen. Errors
 * surface as a toast.
 */
export function useAsyncData<T>(loader: () => Promise<T>, key: string, errorLabel = 'Failed to load'): AsyncData<T> {
  const run = useEffectEvent(async (): Promise<Result<T>> => {
    try {
      return { ok: true, data: await loader() }
    } catch (error) {
      toast.error(errorMessage(error, errorLabel))
      return { ok: false }
    }
  })

  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ key: string | null; version: number; data?: T }>({
    key: null,
    version: -1,
  })

  useEffect(() => {
    let cancelled = false
    void run().then((result) => {
      if (cancelled) return
      setState((s) =>
        result.ok ? { key, version, data: result.data } : { key, version, data: s.key === key ? s.data : undefined },
      )
    })
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const stale = state.key !== key

  return {
    data: stale ? undefined : state.data,
    loading: stale,
    refreshing: state.version !== version,
    reload,
  }
}
