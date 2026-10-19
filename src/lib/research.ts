// Web research on the firm (roadmap item 18): the shapes the dashboard card
// and the Profile review read, and how a finding is shown. Pure; the
// queries are in data.ts.

import { QUESTIONS, type LocationValue, type Question, type Scope } from './questionnaire'

export interface ResearchRun {
  id: string
  status: 'running' | 'done' | 'unsure' | 'failed'
  note: string | null
  found: number
  started_at: string
  finished_at: string | null
}

export interface Finding {
  id: string
  scope: Scope
  entity_id: string | null
  // A questionnaire question id, or new_entity.
  field: string
  value: unknown
  // What the profile said when the research found something else.
  recorded: unknown
  source_url: string
  quote: string
}

export interface FoundEntity {
  name: string
  website: string
  description: string
}

export const isNewEntity = (f: Finding) => f.field === 'new_entity'

export const questionOf = (f: Finding): Question | undefined => QUESTIONS.find(q => q.scope === f.scope && q.id === f.field)

// A finding's value as words.
export function showValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    const place = value as Partial<LocationValue>
    return [place.city, place.state, place.country].map(v => v?.trim()).filter(Boolean).join(', ')
  }
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return String(value)
}

// For a list the profile already had: only what the research adds.
export function addedTo(f: Finding): string[] | null {
  if (!Array.isArray(f.value) || !Array.isArray(f.recorded)) return null
  const known = new Set(f.recorded.map(v => String(v).toLowerCase()))
  return f.value.filter(v => !known.has(String(v).toLowerCase())).map(String)
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export interface FindingGroup {
  scope: Scope
  entityId: string | null
  name: string
  findings: Finding[]
}

// Findings about the firm first, then each fund and company in the order
// given; findings about an entity no longer there are left out.
export function groupFindings(findings: Finding[], firmName: string, funds: { id: string; name: string }[], companies: { id: string; name: string }[]): FindingGroup[] {
  const facts = findings.filter(f => !isNewEntity(f))
  const groups: FindingGroup[] = [{ scope: 'firm', entityId: null, name: firmName, findings: facts.filter(f => f.scope === 'firm') }]
  for (const [scope, rows] of [['fund', funds], ['company', companies]] as const) {
    for (const row of rows) groups.push({ scope, entityId: row.id, name: row.name, findings: facts.filter(f => f.scope === scope && f.entity_id === row.id) })
  }
  return groups.filter(g => g.findings.length > 0)
}
