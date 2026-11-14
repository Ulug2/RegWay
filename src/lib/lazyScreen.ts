import { lazy, type ComponentType } from 'react'

// A screen loaded on demand (App.tsx). After a deploy, a tab opened before
// it still asks for the old build's files, which no longer exist: the
// import fails and, with nothing to catch it, the whole app goes blank.
// A failed import reloads the page once, which fetches the new build; a
// second failure in the same tab is a real error and is thrown.

const RELOADED_KEY = 'regway:reloaded-for-new-build'

export function reloadOnceForNewBuild(storage: Pick<Storage, 'getItem' | 'setItem'> | null, reload: () => void): boolean {
  // Without storage there is no way to tell a second failure from the
  // first, and reloading could then loop: let the error through instead.
  if (!storage) return false
  try {
    if (storage.getItem(RELOADED_KEY)) return false
    storage.setItem(RELOADED_KEY, String(Date.now()))
  } catch {
    return false
  }
  reload()
  return true
}

const sessionStore = () => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      module => {
        // Loaded fine: a later failure may reload again.
        try {
          sessionStore()?.removeItem(RELOADED_KEY)
        } catch {
          // ignore
        }
        return module
      },
      error => {
        if (reloadOnceForNewBuild(sessionStore(), () => window.location.reload())) return new Promise<never>(() => {})
        throw error
      },
    ),
  )
}
