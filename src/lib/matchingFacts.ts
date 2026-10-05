// Which recorded facts the matchers judge relevance by (roadmap item 11).
// A profile save that changes one of these re-checks recent items the
// matchers had rejected, since the old verdicts were reached on the old
// facts; a save that changes only other answers (a website, a headcount)
// costs nothing. Mirrors what the matcher prompts read: match-relevance /
// match-enforcement-relevance (`describe(...)` keys and the fund / company
// lines) and the geopolitical footprints (_shared/footprint.ts).

import { fromRow, toRow } from './questionnaire'

// A firm / fund / company row, before or after the edit (any shape: only
// the keys below are read).
type Row = object
const field = (row: Row, key: string) => (row as Record<string, unknown>)[key]
const answer = (row: Row, key: string) => ((row as { profile?: Record<string, unknown> | null }).profile ?? {})[key]

interface FactKeys {
  columns: string[]
  profile: string[]
}

const MATCHING: Record<'firm' | 'fund' | 'company', FactKeys> = {
  firm: { columns: ['name', 'hq_location', 'jurisdictions'], profile: ['firm_type', 'adviser_registration', 'strategies', 'industries', 'geographies', 'hq', 'legal_domicile'] },
  fund: { columns: ['name', 'structure', 'jurisdictions'], profile: ['status', 'strategy', 'ownership', 'priority_areas', 'proposed_regs'] },
  // Locations are handled by the geopolitical re-check (data.ts).
  company: { columns: ['name', 'sectors', 'regions', 'offerings'], profile: [] },
}

// The firm's own location facts in its geopolitical footprint.
const FIRM_LOCATION: FactKeys = { columns: ['hq_location'], profile: ['hq', 'legal_domicile'] }

// Unset, '' and [] all mean "nothing recorded".
const normal = (v: unknown) => (v == null || v === '' || (Array.isArray(v) && v.length === 0) ? null : JSON.stringify(v))

function differs(keys: FactKeys, before: Row | null | undefined, after: Row): boolean {
  // Nothing to compare against: re-check rather than risk missing a change.
  if (!before) return true
  return (
    keys.columns.some(k => k in after && normal(field(before, k)) !== normal(field(after, k))) ||
    keys.profile.some(k => normal(answer(before, k)) !== normal(answer(after, k)))
  )
}

// The stored row as the questionnaire would write it now: older rows (and
// rows written before a question existed) keep facts in a different shape
// (e.g. only `hq_location`, no `profile.hq`), which would read as a change
// on every first save.
const asSaved = (scope: 'firm' | 'fund' | 'company', row: Row | null | undefined): Row | null =>
  row ? { ...row, ...toRow(scope, fromRow(scope, row as Parameters<typeof fromRow>[1])) } : null

export const matchingFactsChanged = (scope: 'firm' | 'fund' | 'company', before: Row | null | undefined, after: Row) =>
  differs(MATCHING[scope], asSaved(scope, before), after)

export const firmLocationChanged = (before: Row | null | undefined, after: Row) => differs(FIRM_LOCATION, asSaved('firm', before), after)
