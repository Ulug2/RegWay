import { useCallback, useRef, useState, type SetStateAction } from 'react'
import { readCache, writeCache } from './cache'

// useState that starts from the cached value for `key` and writes every
// update back to the cache — even one that lands after the component has
// unmounted (e.g. a slow scan that finishes while the user is on another page).
export function useCachedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readCache<T>(key) ?? initial)
  const latest = useRef(value)

  const set = useCallback(
    (next: SetStateAction<T>) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(latest.current) : next
      latest.current = resolved
      writeCache(key, resolved)
      setValue(resolved)
    },
    [key],
  )

  return [value, set] as const
}
