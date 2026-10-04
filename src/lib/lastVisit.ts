// "New" on the dashboard means matched since the user's previous visit.
//
// The cut-off is fixed once per browser session (sessionStorage), so opening
// an item and coming back doesn't clear the badges; each dashboard view
// moves the stored last visit forward (localStorage) for the next session.
// Kept outside the response cache, which is wiped on sign-out, and keyed by
// user + firm. Per device: a visit on another device doesn't count.

const key = (userId: string, firmId: string) => `regway:lastVisit:v1:${userId}:${firmId}`

const read = (storage: Storage, k: string): string | null => {
  try {
    return storage.getItem(k)
  } catch {
    return null
  }
}

const write = (storage: Storage, k: string, value: string) => {
  try {
    storage.setItem(k, value)
  } catch {
    // Storage unavailable: no badges, nothing else breaks.
  }
}

// Returns the cut-off for "New" this session (null on a first visit, so not
// everything is flagged), and records this visit.
export function markVisit(userId: string, firmId: string): string | null {
  const k = key(userId, firmId)
  let since = read(sessionStorage, k)
  if (since === null) {
    since = read(localStorage, k) ?? ''
    write(sessionStorage, k, since)
  }
  write(localStorage, k, new Date().toISOString())
  return since || null
}

// Parsed, not string-compared: Postgres writes "+00:00" with microseconds,
// JavaScript writes "Z" with milliseconds.
export const isNewSince = (matchedAt: string | null | undefined, since: string | null) =>
  !!since && !!matchedAt && Date.parse(matchedAt) > Date.parse(since)
