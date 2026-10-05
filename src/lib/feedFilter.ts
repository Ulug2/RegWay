// Filtering for an entity page's list of matched developments (spec §5:
// "view all ... or narrow the list to regulatory developments, enforcement
// actions, or geopolitical developments", plus "basic search and filtering
// ... by topic, date, category, or relevant location"). Pure functions over
// the list already loaded for the entity — tens of items, so client-side.

import type { MatchedRegulation, Regulation } from './types'

export type Category = Regulation['category']
export type CategoryFilter = Category | 'all'
export type DateWindow = 'any' | '30d' | '90d' | '12m'

export interface FeedFilter {
  category: CategoryFilter
  query: string
  date: DateWindow
  location: string | null
}

export const DEFAULT_FILTER: FeedFilter = { category: 'all', query: '', date: 'any', location: null }

export const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'regulatory', label: 'Regulatory' },
  { key: 'enforcement', label: 'Enforcement' },
  { key: 'geopolitical', label: 'Geopolitical' },
]

export const DATE_WINDOWS: { key: DateWindow; label: string; days: number | null }[] = [
  { key: 'any', label: 'Any date', days: null },
  { key: '30d', label: 'Past 30 days', days: 30 },
  { key: '90d', label: 'Past 90 days', days: 90 },
  { key: '12m', label: 'Past 12 months', days: 365 },
]

export const US_FEDERAL = 'United States (federal)'
export const GLOBAL = 'Global / no specific country'

// The ways sources write U.S. federal: "Securities and Exchange Commission ·
// Federal", "Federal", "Federal (United States)" (the syncs), and "United
// States", "United States (Federal)" (company scans, which word it freely).
const isUsFederal = (jurisdiction: string) => /(^|·\s*)federal\b|^united states\b/i.test(jurisdiction.trim())

// Where a development applies, for the location filter. Geopolitical items
// carry the countries they concern; everything else is placed by the
// jurisdiction that issued it ("United Kingdom", "European Union" from
// company scans, or U.S. federal).
export function locationsOf(item: Regulation): string[] {
  if (item.category === 'geopolitical') return item.countries?.length ? item.countries : [GLOBAL]
  const j = item.jurisdiction?.trim()
  if (!j) return []
  return [isUsFederal(j) ? US_FEDERAL : j]
}

// Location options for the list being viewed, most common first.
export function locationOptions(items: Regulation[]): string[] {
  const counts = new Map<string, number>()
  for (const item of items) for (const loc of locationsOf(item)) counts.set(loc, (counts.get(loc) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([loc]) => loc)
}

const withinWindow = (published: string | null, window: DateWindow, today: Date): boolean => {
  const days = DATE_WINDOWS.find(w => w.key === window)?.days
  if (days == null) return true
  if (!published) return false
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  return new Date(published + 'T00:00:00') >= cutoff
}

// Every whitespace-separated term must appear somewhere in what the card
// shows: title, description, issuer, jurisdiction, why it was matched.
const matchesQuery = (item: MatchedRegulation, query: string): boolean => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = [item.title, item.summary, item.agency, item.jurisdiction, item.match_reason, ...(item.countries ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return terms.every(t => haystack.includes(t))
}

// Everything except the category, so the category chips can show how many
// items each would leave under the other filters.
function matchesNonCategory(item: MatchedRegulation, f: FeedFilter, today: Date): boolean {
  return (
    matchesQuery(item, f.query) &&
    withinWindow(item.published_date, f.date, today) &&
    (!f.location || locationsOf(item).includes(f.location))
  )
}

export function applyFeedFilter(items: MatchedRegulation[], f: FeedFilter, today = new Date()): MatchedRegulation[] {
  return items.filter(item => (f.category === 'all' || item.category === f.category) && matchesNonCategory(item, f, today))
}

export function categoryCounts(items: MatchedRegulation[], f: FeedFilter, today = new Date()): Record<CategoryFilter, number> {
  const counts: Record<CategoryFilter, number> = { all: 0, regulatory: 0, enforcement: 0, geopolitical: 0 }
  for (const item of items) {
    if (!matchesNonCategory(item, f, today)) continue
    counts.all += 1
    counts[item.category] += 1
  }
  return counts
}

export const isFiltered = (f: FeedFilter) =>
  f.category !== DEFAULT_FILTER.category || !!f.query.trim() || f.date !== DEFAULT_FILTER.date || f.location !== DEFAULT_FILTER.location
