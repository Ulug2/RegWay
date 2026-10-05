// Day-by-day browsing of an entity's matched developments: a page opens on
// what RegWay found today, and steps back one day at a time to the day the
// firm started using the app. "Found" is when the item was matched to the
// entity (`matched_at`), in the viewer's own time zone, not when the source
// published it.
//
// Days are local calendar dates as "YYYY-MM-DD" strings, which compare and
// sort correctly as strings.

import type { MatchedRegulation } from './types'

// null = today (whatever today is when it's read); 'all' = every day.
export type DaySelection = string | null | 'all'

const pad = (n: number) => String(n).padStart(2, '0')

export const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// The local day an ISO timestamp falls on; null for a missing or bad value.
export function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : localDay(new Date(t))
}

const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shiftDay(day: string, delta: number): string {
  const d = parseDay(day)
  d.setDate(d.getDate() + delta)
  return localDay(d)
}

// The concrete day a selection points at ('all' has none).
export const resolveDay = (selection: DaySelection, today: string): string | null =>
  selection === 'all' ? null : selection ?? today

export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === shiftDay(today, -1)) return 'Yesterday'
  return parseDay(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export const fullDate = (day: string): string =>
  parseDay(day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export const itemsOnDay = (items: MatchedRegulation[], day: string): MatchedRegulation[] =>
  items.filter(item => dayOf(item.matched_at) === day)

// The most recent day before `day` that has findings, so an empty day can
// point at where the last ones are. Null when there are none earlier.
export function previousDayWithFindings(items: MatchedRegulation[], day: string): string | null {
  let best: string | null = null
  for (const item of items) {
    const d = dayOf(item.matched_at)
    if (d && d < day && (!best || d > best)) best = d
  }
  return best
}

// How far back the stepper goes: the day the firm started using the app,
// or the earliest finding if that's unknown or earlier. Never after today.
export function firstDay(items: MatchedRegulation[], firmCreatedAt: string | null | undefined, today: string): string {
  let first = dayOf(firmCreatedAt) ?? today
  for (const item of items) {
    const d = dayOf(item.matched_at)
    if (d && d < first) first = d
  }
  return first < today ? first : today
}
