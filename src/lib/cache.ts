// Tiny stale-while-revalidate cache. Screens read the last known value
// synchronously on mount (so names, lists and greetings never flash empty
// while a fetch is in flight), then refresh from the network and write the
// result back. Values live in memory for the session and are mirrored to
// localStorage so they also survive a reload. Keys starting with `ui:` are
// memory-only (view state like the open tab, not server data).
//
// The cache is bound to a user id and wiped on sign-out or when a different
// user signs in, so one account's data is never shown to another.

const PREFIX = 'regway:cache:v1:'
const USER_KEY = `${PREFIX}__uid`

const mem = new Map<string, unknown>()

const persistable = (key: string) => !key.startsWith('ui:')

export function readCache<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T
  if (!persistable(key)) return undefined
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return undefined
    const value = JSON.parse(raw) as T
    mem.set(key, value)
    return value
  } catch {
    return undefined
  }
}

export function writeCache<T>(key: string, value: T): void {
  mem.set(key, value)
  if (!persistable(key)) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — the in-memory copy still works.
  }
}

export function patchCache<T>(key: string, update: (prev: T) => T): void {
  const prev = readCache<T>(key)
  if (prev !== undefined) writeCache(key, update(prev))
}

export function dropCache(...keys: string[]): void {
  for (const key of keys) {
    mem.delete(key)
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      // ignore
    }
  }
}

export function clearCache(): void {
  mem.clear()
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

// Call once the signed-in user is known and before any screen reads the
// cache. Drops everything if the cache belongs to someone else.
export function bindCacheToUser(uid: string): void {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(USER_KEY)
  } catch {
    // ignore
  }
  if (owner !== uid) {
    clearCache()
    try {
      localStorage.setItem(USER_KEY, uid)
    } catch {
      // ignore
    }
  }
}
