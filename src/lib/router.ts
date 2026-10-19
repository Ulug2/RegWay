// A web address for each screen, on the browser's History API (no library:
// the app has a dozen routes). App.tsx owns what each address shows; this
// file is the mapping both ways and the helper links use.
//
//   /                     landing page, or the dashboard when signed in
//   /sign-in, /sign-up    the landing page with the form open
//   /about /sources /legal /privacy   public pages
//   /profile, /profile/:tab
//   /funds/:id, /companies/:id
//   /developments/:id
//
// vercel.json sends every path to index.html so these work on a reload.

export const PAGES = ['about', 'sources', 'legal', 'privacy'] as const
export type PageSlug = (typeof PAGES)[number]

export const PROFILE_TABS = ['account', 'firm', 'funds', 'portfolio', 'research', 'dismissed'] as const
export type ProfileTabSlug = (typeof PROFILE_TABS)[number]

export type Route =
  | { name: 'home' }
  | { name: 'auth'; mode: 'sign-in' | 'sign-up' }
  | { name: 'page'; slug: PageSlug }
  | { name: 'profile'; tab: ProfileTabSlug }
  | { name: 'entity'; type: 'fund' | 'company'; id: string }
  | { name: 'detail'; id: string }
  | { name: 'unknown' }

export function parsePath(pathname: string): Route {
  const [first = '', second, ...rest] = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (!first) return { name: 'home' }
  if (rest.length) return { name: 'unknown' }
  if (!second) {
    if (first === 'sign-in' || first === 'sign-up') return { name: 'auth', mode: first }
    if ((PAGES as readonly string[]).includes(first)) return { name: 'page', slug: first as PageSlug }
    if (first === 'profile') return { name: 'profile', tab: 'account' }
    return { name: 'unknown' }
  }
  if (first === 'profile' && (PROFILE_TABS as readonly string[]).includes(second)) return { name: 'profile', tab: second as ProfileTabSlug }
  if (first === 'funds') return { name: 'entity', type: 'fund', id: second }
  if (first === 'companies') return { name: 'entity', type: 'company', id: second }
  if (first === 'developments') return { name: 'detail', id: second }
  return { name: 'unknown' }
}

export const profilePath = (tab: ProfileTabSlug = 'account') => (tab === 'account' ? '/profile' : `/profile/${tab}`)
export const entityPath = (entity: { type: 'fund' | 'company'; id: string }) => `/${entity.type === 'fund' ? 'funds' : 'companies'}/${encodeURIComponent(entity.id)}`
export const detailPath = (id: string) => `/developments/${encodeURIComponent(id)}`

// How far into the app's own history this entry is: 0 for the page the
// visit started on, so "Back" knows whether there is anywhere to go back to.
export const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0

// Adds an entry, remembering how far the page being left was scrolled.
export function pushPath(path: string): void {
  if (path === window.location.pathname) return
  window.history.replaceState({ ...(window.history.state ?? {}), idx: historyIndex(), scroll: window.scrollY }, '')
  window.history.pushState({ idx: historyIndex() + 1 }, '', path)
}

export function replacePath(path: string): void {
  if (path === window.location.pathname) return
  window.history.replaceState({ idx: historyIndex() }, '', path)
}

// For links: go to an address inside the app without a page load. App.tsx
// listens for this and shows the screen.
const GO = 'regway:go'
export function go(path: string): void {
  window.dispatchEvent(new CustomEvent<string>(GO, { detail: path }))
}
export function onGo(handler: (path: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail)
  window.addEventListener(GO, listener)
  return () => window.removeEventListener(GO, listener)
}
