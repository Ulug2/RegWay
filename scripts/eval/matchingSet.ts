// The hand-marked test set for matching (system guide §17.1). One file holds
// the firm as it stood when the answers were marked (so a later profile edit
// doesn't change them) and the documents with the right answer for each.

import type { EntityRef } from './score.ts'

export interface SetEntityRow {
  name: string
  [field: string]: unknown
}

export interface MatchingSet {
  // Shown with the score, so a result is never read against the wrong set.
  name: string
  // Who marked it and when, and anything a reader should know.
  notes?: string
  firm: { name: string; hq_location: string | null; jurisdictions: string[] | null; profile: Record<string, unknown> | null }
  funds: SetEntityRow[]
  companies: SetEntityRow[]
  holdings?: { fund: string; company: string }[]
  documents: SetDocument[]
}

export interface SetDocument {
  id: string
  category: 'regulatory' | 'geopolitical'
  title: string
  agency: string | null
  jurisdiction?: string | null
  summary: string | null
  countries?: string[]
  published_date?: string | null
  // The right answer: every entity it applies to; empty for "not relevant";
  // null until marked (a set with an unmarked document can't be scored).
  expected: EntityRef[] | null
  // Why, in the marker's words (shown next to a mistake).
  why?: string | null
  // Written by scripts/eval-build-set.ts and eval-mark-set.ts; not used to
  // score.
  source?: string
  source_url?: string | null
  effective_date?: string | null
  // More of the document than the summary, for the marker only.
  text?: string | null
  // What RegWay's matchers said in production when the set was built.
  regway?: { verdict: string; entities: EntityRef[]; reason: string | null }
  confidence?: 'high' | 'medium' | 'low'
  marked_by?: string
}

// Problems that would make a score meaningless; empty when there are none.
export function problemsWith(set: MatchingSet): string[] {
  const problems: string[] = []
  const names = (rows: SetEntityRow[]) => new Set(rows.map(r => r.name.trim().toLowerCase()))
  const funds = names(set.funds)
  const companies = names(set.companies)
  const ids = new Set<string>()
  if (!set.documents.length) problems.push('no documents')
  for (const d of set.documents) {
    if (ids.has(d.id)) problems.push(`${d.id}: id used twice`)
    ids.add(d.id)
    if (d.category !== 'regulatory' && d.category !== 'geopolitical') problems.push(`${d.id}: category must be regulatory or geopolitical`)
    if (!Array.isArray(d.expected)) {
      problems.push(`${d.id}: no expected answer (use [] for "not relevant")`)
      continue
    }
    for (const e of d.expected) {
      if (e.scope === 'fund' && !funds.has((e.name ?? '').trim().toLowerCase())) problems.push(`${d.id}: no fund named "${e.name}"`)
      if (e.scope === 'company' && !companies.has((e.name ?? '').trim().toLowerCase())) problems.push(`${d.id}: no company named "${e.name}"`)
      if (d.category === 'geopolitical' && e.scope === 'fund') problems.push(`${d.id}: geopolitical matches stand on the firm or a company, never a fund`)
    }
  }
  return problems
}

// What a run will cost, roughly, before anything is sent. From measured
// costs (roadmap, Standing facts): a regulatory batch of 40 on Haiku $0.05;
// the geopolitical judge runs on Sonnet, about three times that; the
// Skeptic about $0.01 a match it reviews (estimated at one in four).
export function estimateCostUsd(set: MatchingSet, skeptic: boolean): number {
  const regulatory = set.documents.filter(d => d.category === 'regulatory').length
  const geopolitical = set.documents.length - regulatory
  const batches = (n: number) => Math.ceil(n / 40)
  const judges = batches(regulatory) * 0.05 + batches(geopolitical) * 0.15
  const reviews = skeptic ? set.documents.length * 0.25 * 0.01 : 0
  return judges + reviews
}
