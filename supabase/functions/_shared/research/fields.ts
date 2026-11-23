// What firm research may propose, and in what shape (roadmap item 18).
//
// A proposal must be something the firm could have typed itself: one of the
// questionnaire's questions, in that question's shape. The questions are
// read from the questionnaire itself (the single source of truth for what a
// profile holds), so a proposal can never name a field or an option the
// profile forms don't have.

import { QUESTIONS, isFact, type Question, type Scope } from '../../../../src/lib/questionnaire.ts'

// Questions a public web page can answer. Left out: the firm's own
// preferences (teams, goals, monitoring), and what only the firm knows
// (ownership positions, legal team, sensitive data).
export const RESEARCHABLE: Record<Scope, string[]> = {
  firm: ['website', 'legal_name', 'hq', 'legal_domicile', 'offices', 'firm_type', 'adviser_registration', 'strategies', 'industries', 'geographies', 'key_states', 'aum'],
  fund: ['domicile', 'structure', 'vintage', 'status', 'size', 'strategy', 'industries', 'geographies'],
  company: [
    'website', 'hq', 'industry', 'description', 'products', 'customers', 'consumer_facing', 'operating_locations', 'outside_us', 'foreign_countries',
    'facility_locations', 'supplier_locations', 'employees', 'regulated', 'license_types', 'gov_contracts', 'trade', 'trade_regions',
  ],
}

// Questions a member can answer by saying so (Sidekick §17.6): every fact
// about the entity except its name, which is how it is found.
export const SAYABLE: Record<Scope, string[]> = Object.fromEntries(
  (['firm', 'fund', 'company'] as const).map(scope => [scope, QUESTIONS.filter(q => q.scope === scope && isFact(q) && q.id !== 'name').map(q => q.id)]),
) as Record<Scope, string[]>

export const questionFor = (scope: Scope, field: string, allowed: Record<Scope, string[]> = RESEARCHABLE): Question | undefined =>
  allowed[scope].includes(field) ? QUESTIONS.find(q => q.scope === scope && q.id === field) : undefined

// Long option lists (countries, states) are described, not listed.
const LIST_LIMIT = 30

function shapeOf(q: Question): string {
  switch (q.type) {
    case 'select':
      return `one of: ${q.options!.join(' | ')}`
    case 'multi':
      return q.options!.length > LIST_LIMIT ? 'a list of country or U.S. state names in English' : `a list from: ${q.options!.join(' | ')}`
    case 'yesno':
      return 'yes | no'
    case 'location':
      return 'a place: {"city", "state", "country"} (state only for the U.S.)'
    case 'tags':
      return 'a list of short texts'
    case 'year':
      return 'a year, e.g. 2021'
    default:
      return 'text'
  }
}

// The catalogue the model chooses from, one line per question.
export function catalogue(scope: Scope, allowed: Record<Scope, string[]> = RESEARCHABLE): string {
  return allowed[scope]
    .map(id => questionFor(scope, id, allowed))
    .filter((q): q is Question => !!q)
    .map(q => `- ${q.id}: ${q.label} → ${shapeOf(q)}`)
    .join('\n')
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

// The option a model's wording names, matched without regard to case.
const option = (q: Question, v: unknown): string | null => q.options?.find(o => norm(o) === norm(v)) ?? null

// A proposed value in the question's own shape, or null when it doesn't fit
// (an option the question doesn't have, an empty answer).
export function normalise(q: Question, value: unknown): unknown {
  switch (q.type) {
    case 'select':
      return option(q, value)
    case 'multi': {
      const items = (Array.isArray(value) ? value : [value]).map(v => option(q, v)).filter((v): v is string => !!v)
      return items.length ? [...new Set(items)] : null
    }
    case 'yesno': {
      const v = norm(value)
      return v === 'yes' || v === 'no' ? v : null
    }
    case 'location': {
      const v = (value ?? {}) as Record<string, unknown>
      const place = { city: String(v.city ?? '').trim(), state: String(v.state ?? '').trim(), country: String(v.country ?? '').trim() }
      return place.country ? place : null
    }
    case 'tags': {
      const items = (Array.isArray(value) ? value : [value]).map(v => String(v ?? '').trim()).filter(Boolean)
      return items.length ? [...new Set(items)] : null
    }
    case 'year': {
      const y = Number(String(value ?? '').trim())
      return Number.isInteger(y) && y > 1900 && y < 2100 ? String(y) : null
    }
    default: {
      const text = String(value ?? '').trim()
      return text ? text : null
    }
  }
}

const recordedValue = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)

function same(q: Question, a: unknown, b: unknown): boolean {
  if (q.type === 'location') {
    const x = (a ?? {}) as Record<string, unknown>
    const y = (b ?? {}) as Record<string, unknown>
    return ['city', 'state', 'country'].every(k => norm(x[k]) === norm(y[k]))
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = new Set((Array.isArray(a) ? a : [a]).map(norm))
    const y = new Set((Array.isArray(b) ? b : [b]).map(norm))
    return x.size === y.size && [...x].every(v => y.has(v))
  }
  return norm(a) === norm(b)
}

// Against what the profile already says: null when the finding adds nothing;
// otherwise the value to propose and, if the profile said something else,
// what it said. A list that only adds items proposes the union.
export function compare(q: Question, found: unknown, recorded: unknown): { value: unknown; recorded: unknown } | null {
  if (!recordedValue(recorded)) return { value: found, recorded: null }
  if (same(q, found, recorded)) return null
  // A page's own wording of something the firm already described in its
  // words is not a different fact (first H.I.G. run, 2026-10-19).
  if (q.type === 'text') return null
  if ((q.type === 'multi' || q.type === 'tags') && Array.isArray(found) && Array.isArray(recorded)) {
    const known = new Set(recorded.map(norm))
    const added = found.filter(v => !known.has(norm(v)))
    if (added.length === 0) return null
    return { value: [...recorded, ...added], recorded }
  }
  return { value: found, recorded }
}
