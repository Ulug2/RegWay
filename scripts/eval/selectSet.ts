// Which documents go into the test set for matching (system guide §17.1),
// and what RegWay's matchers said about each in production. Pure: no
// database, no network, so it is unit-tested.
//
// The set mixes what RegWay matched, what the Skeptic took back, what the
// judges turned down, and what was never judged, so it scores both kinds
// of mistake: a match that is wrong, and a real one that was missed.

import type { EntityRef } from './score.ts'

export type Category = 'regulatory' | 'geopolitical'

// What production said: matched to an entity; matched by a judge and then
// rejected by the Skeptic; turned down by the judge; never judged.
export type Verdict = 'matched' | 'skeptic_rejected' | 'rejected' | 'unjudged'

export interface PoolDoc {
  id: string
  source: string
  category: Category
  agency: string | null
  published_date: string | null
}

export interface RelevanceRow {
  regulation_id: string
  fund_id: string | null
  portfolio_company_id: string | null
  relevance_reason: string
}

export interface ReviewRow {
  regulation_id: string
  decision: string
  scope: string | null
  entity_name: string | null
  reason: string | null
  restored_at: string | null
}

export interface Judgement {
  verdict: Verdict
  // The entities production names: matched ones, or for a Skeptic
  // rejection the ones the judge had named.
  entities: EntityRef[]
  reason: string | null
}

const NOT_RELEVANT = 'NOT_RELEVANT'

export function classify(
  relevance: RelevanceRow[],
  reviews: ReviewRow[],
  names: { funds: Map<string, string>; companies: Map<string, string> },
): Map<string, Judgement> {
  const out = new Map<string, Judgement>()
  const entityOf = (r: RelevanceRow): EntityRef =>
    r.portfolio_company_id
      ? { scope: 'company', name: names.companies.get(r.portfolio_company_id) ?? r.portfolio_company_id }
      : r.fund_id
        ? { scope: 'fund', name: names.funds.get(r.fund_id) ?? r.fund_id }
        : { scope: 'firm', name: null }

  const byDoc = new Map<string, RelevanceRow[]>()
  for (const r of relevance) byDoc.set(r.regulation_id, [...(byDoc.get(r.regulation_id) ?? []), r])
  const rejectedBySkeptic = new Map<string, ReviewRow[]>()
  for (const r of reviews) {
    if (r.decision !== 'reject' || r.restored_at) continue
    rejectedBySkeptic.set(r.regulation_id, [...(rejectedBySkeptic.get(r.regulation_id) ?? []), r])
  }

  for (const [id, rows] of byDoc) {
    const matched = rows.filter(r => !r.relevance_reason.startsWith(NOT_RELEVANT))
    if (matched.length) {
      out.set(id, { verdict: 'matched', entities: matched.map(entityOf), reason: matched[0].relevance_reason })
      continue
    }
    const skeptic = rejectedBySkeptic.get(id)
    if (skeptic?.length) {
      const entities = skeptic.map(r => (r.scope === 'firm' || !r.scope ? { scope: 'firm' as const, name: null } : { scope: r.scope as 'fund' | 'company', name: r.entity_name }))
      out.set(id, { verdict: 'skeptic_rejected', entities, reason: skeptic[0].reason })
      continue
    }
    out.set(id, { verdict: 'rejected', entities: [], reason: rows[0].relevance_reason.replace(/^NOT_RELEVANT:\s*/, '') })
  }
  return out
}

// How many of each kind. `near` is the share of the judges' rejections
// drawn from agencies close to the firm's business, where a wrong "no" is
// most likely; the rest are drawn from everything.
export interface Quota {
  matched: number
  skeptic_rejected: number
  rejected: number
  unjudged: number
  near: number
}

export const PLAN: Record<Category, Quota> = {
  regulatory: { matched: 25, skeptic_rejected: 25, rejected: 45, unjudged: 25, near: 0.5 },
  geopolitical: { matched: 10, skeptic_rejected: 8, rejected: 12, unjudged: 10, near: 0 },
}

// Agencies whose rules most often touch a PE adviser, its funds or H.I.G.'s
// kind of companies (healthcare billing, fintech, energy pipelines,
// aerospace logistics, batteries, UK wealth management).
export const NEAR_AGENCY =
  /securities and exchange|medicare|health and human|food and drug|federal trade|consumer financial|treasury|foreign assets|industry and security|commerce|pipeline|transportation|aviation|defense|state department|environmental protection|labor|energy|financial conduct|european|prudential|internal revenue|federal reserve|comptroller|deposit insurance|esma/i

// A small seeded generator, so the same seed picks the same documents.
function random(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], next: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// `count` documents shared across sources by the square root of each
// source's size: the Federal Register (most of what RegWay reads) gives
// the most, as in production, but a small feed still gets its turn.
function acrossSources(docs: PoolDoc[], count: number, next: () => number): PoolDoc[] {
  const groups = new Map<string, PoolDoc[]>()
  for (const d of shuffled(docs, next)) groups.set(d.source, [...(groups.get(d.source) ?? []), d])
  const queues = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, q]) => q)
  const total = Math.min(count, docs.length)
  const weights = queues.map(q => Math.sqrt(q.length))
  const sum = weights.reduce((a, b) => a + b, 0)
  // Each source's share, then what is left (a source with too few
  // documents, rounding) handed out one at a time to the largest.
  const take = queues.map((q, i) => Math.min(q.length, Math.floor((total * weights[i]) / sum)))
  for (let given = take.reduce((a, b) => a + b, 0); given < total; given++) {
    const i = queues.map((q, j) => (take[j] < q.length ? j : -1)).filter(j => j >= 0).sort((a, b) => queues[b].length - take[b] - (queues[a].length - take[a]))[0]
    take[i]++
  }
  return queues.flatMap((q, i) => q.slice(0, take[i]))
}

export interface Picked {
  doc: PoolDoc
  regway: Judgement
}

export function pick(pool: PoolDoc[], judgements: Map<string, Judgement>, seed: string, plan: Record<Category, Quota> = PLAN): Picked[] {
  const next = random(seed)
  const judgementOf = (d: PoolDoc): Judgement => judgements.get(d.id) ?? { verdict: 'unjudged', entities: [], reason: null }
  const out: Picked[] = []
  for (const category of ['regulatory', 'geopolitical'] as const) {
    const quota = plan[category]
    const inCategory = pool.filter(d => d.category === category)
    for (const verdict of ['matched', 'skeptic_rejected', 'rejected', 'unjudged'] as const) {
      const candidates = inCategory.filter(d => judgementOf(d).verdict === verdict)
      let chosen: PoolDoc[]
      if (verdict === 'rejected' && quota.near > 0) {
        const nearCount = Math.round(quota.rejected * quota.near)
        const near = acrossSources(candidates.filter(d => NEAR_AGENCY.test(d.agency ?? '')), nearCount, next)
        const taken = new Set(near.map(d => d.id))
        chosen = [...near, ...acrossSources(candidates.filter(d => !taken.has(d.id)), quota.rejected - near.length, next)]
      } else {
        chosen = acrossSources(candidates, quota[verdict], next)
      }
      out.push(...chosen.map(doc => ({ doc, regway: judgementOf(doc) })))
    }
  }
  return out
}
