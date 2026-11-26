// Marking the test set's right answers with the strongest model (owner,
// 2026-11-25: Claude Fable 5.2 at extra-high effort, used for this and
// nothing else). Pure: the prompt, the answer's shape and its checks, so
// they are unit-tested; scripts/eval-mark-set.ts sends it.
//
// The marker sees everything recorded about the firm, its funds and its
// companies (every profile answer, where it came from, which fund holds
// which company) and more of each document than the matchers do (the start
// of a Federal Register document's full text). It never sees what RegWay
// answered. It marks by RegWay's own standard, so the score measures the
// matchers against the answer they should have given.

import { FENCE_RULE, untrusted } from '../../supabase/functions/_shared/security/guard.ts'
import type { EntityRef } from './score.ts'
import type { MatchingSet, SetDocument, SetEntityRow } from './matchingSet.ts'

export const MARKER_MODEL = 'claude-fable-5-2'
export type Effort = 'high' | 'xhigh' | 'max'

// Documents per request: enough to share the firm's context, few enough
// that each gets the model's full attention.
export const GROUP = 5

export type Confidence = 'high' | 'medium' | 'low'

export interface Mark {
  id: string
  expected: EntityRef[]
  why: string
  confidence: Confidence
}

const label = (key: string) => key.replace(/_/g, ' ')

function value(v: unknown): string {
  if (v == null || v === '') return ''
  if (Array.isArray(v)) return v.map(value).filter(Boolean).join('; ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('country' in o || 'city' in o) return [o.city, o.state, o.country].map(x => String(x ?? '').trim()).filter(Boolean).join(', ')
    return Object.entries(o)
      .map(([k, x]) => `${label(k)}: ${value(x)}`)
      .join('; ')
  }
  return String(v).trim()
}

// Where a profile answer came from, as RegWay records it.
function provenance(meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>
  const date = typeof m.confirmed_at === 'string' ? m.confirmed_at.slice(0, 10) : null
  if (m.source === 'web') return ` (found on the web${m.url ? `, ${m.url}` : ''}${date ? `, confirmed ${date}` : ''})`
  if (m.source === 'user') return ` (entered by the firm${date ? `, ${date}` : ''})`
  return ''
}

const COLUMNS = ['hq_location', 'jurisdictions', 'website', 'lead_gp_name', 'structure', 'size', 'sectors', 'regions', 'offerings', 'aum']

// One entity as lines: its columns, then every profile answer with where
// it came from.
function entityLines(row: SetEntityRow): string[] {
  const lines: string[] = []
  for (const key of COLUMNS) {
    const v = value(row[key])
    if (v) lines.push(`  - ${label(key)}: ${v}`)
  }
  const profile = (row.profile ?? {}) as Record<string, unknown>
  const meta = (row.profile_meta ?? {}) as Record<string, unknown>
  for (const [key, v] of Object.entries(profile)) {
    const text = value(v)
    if (text) lines.push(`  - ${label(key)}: ${text}${provenance(meta[key])}`)
  }
  return lines
}

export function firmContext(set: MatchingSet): string {
  const heldBy = (company: string) => (set.holdings ?? []).filter(h => h.company === company).map(h => h.fund)
  const holds = (fund: string) => (set.holdings ?? []).filter(h => h.fund === fund).map(h => h.company)
  return [
    `THE FIRM (scope "firm"): ${set.firm.name}`,
    ...entityLines(set.firm as SetEntityRow),
    '',
    'ITS FUNDS (scope "fund", named exactly as below)',
    ...set.funds.flatMap(f => [`- ${f.name}`, ...entityLines(f), `  - holds: ${holds(f.name).join('; ') || 'no holdings recorded'}`]),
    '',
    'ITS PORTFOLIO COMPANIES (scope "company", named exactly as below)',
    ...set.companies.flatMap(c => [`- ${c.name}`, ...entityLines(c), `  - held by: ${heldBy(c.name).join('; ') || 'no fund recorded'}`]),
  ].join('\n')
}

export const SYSTEM = `You are a senior regulatory counsel to private equity firms. You are marking the correct answers for a test of RegWay, a service that tells a private equity firm which new regulations, enforcement and geopolitical developments apply to it, to one of its funds, or to one of its portfolio companies. RegWay's own matchers will be scored against your answers, so take the time each document needs, and be as careful about a match that isn't real as about a real one that would be missed.

For each document, list every entity it applies to, by RegWay's standard:
- It applies when it creates a real compliance obligation, deadline or requirement, or a material exposure, for that specific entity, given the facts recorded about it: jurisdiction, sector, products, customers, structure, locations, facilities, suppliers, trade.
- You must be able to name the specific obligation or exposure and the specific fact about the entity it touches. "May", "could" or "might apply", or "the entity is in a regulated industry", is not enough.
- Not relevant: anything purely administrative or procedural that creates no new obligation (an award, one person's case, a routine data-availability or agency-organization notice, a state-program approval that doesn't bind the entity), and a generic rule that doesn't touch the entity's jurisdictions, structure or sector.
- A regulator's announcement of a proposal, rule, guidance or relief is judged by the measure it announces. A proposed rule counts when it would create the obligation for the entity.
- A UK or EU measure binds only an entity established, authorised, marketing or operating there, as its recorded facts show.
- The firm (scope "firm") is the adviser and its management company: rules on advisers, private fund managers, their reporting, marketing, custody, conduct, and the firm's own offices and operations.
- A fund (scope "fund") is the fund vehicle itself: its structure, domicile, investors, fundraising, reporting. A rule that touches a company a fund holds is the company's match, not the fund's.
- A geopolitical document (sanctions, tariffs, export controls, travel advisories, conflict) applies to the firm or to a company whose recorded locations, operations, facilities, suppliers or trade put it in scope. Never to a fund.
- Funds and companies marked "(test)" are invented for testing: treat them as real.

Use only the facts recorded below about each entity. A fact that is not recorded is unknown: don't assume it either way. Where the answer turns on an unknown fact, decide on what is recorded, say what it turns on, and give low confidence. Use your own knowledge of the regulation itself where the text given is only part of it.

For each document give: the entities it applies to (an empty list when none), one or two sentences on why, naming the obligation and the entity's fact (or why it doesn't apply), and your confidence: high, medium or low.

${FENCE_RULE}`

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['documents'],
  properties: {
    documents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'applies_to', 'why', 'confidence'],
        properties: {
          id: { type: 'string' },
          applies_to: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['scope', 'name'],
              properties: {
                scope: { type: 'string', enum: ['firm', 'fund', 'company'] },
                name: { type: 'string', description: 'The fund or company exactly as listed; the firm\'s name for scope "firm".' },
              },
            },
          },
          why: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const

function documentBlock(d: SetDocument): string {
  const facts = [
    `Category: ${d.category}`,
    d.source ? `Source: ${d.source}` : null,
    d.agency ? `Agency: ${d.agency}` : null,
    d.jurisdiction ? `Jurisdiction: ${d.jurisdiction}` : null,
    d.published_date ? `Published: ${d.published_date}` : null,
    d.effective_date ? `Effective: ${d.effective_date}` : null,
    d.countries?.length ? `Countries: ${d.countries.join(', ')}` : null,
  ].filter(Boolean)
  const body = [`Title: ${d.title}`, d.summary ? `Summary: ${d.summary}` : null, d.text ? `More of the document (its start):\n${d.text}` : null].filter(Boolean).join('\n\n')
  return `DOCUMENT id=${d.id}\n${facts.join(' · ')}\n${untrusted(d.agency ?? d.source ?? 'the publisher', body)}`
}

export interface MarkRequest {
  model: string
  max_tokens: number
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  messages: { role: 'user'; content: string }[]
  output_config: { effort: Effort; format: { type: 'json_schema'; schema: typeof SCHEMA } }
}

// One request: the rules and the firm (the same for every request, so
// cached), then the documents.
export function markRequest(set: MatchingSet, docs: SetDocument[], effort: Effort): MarkRequest {
  return {
    model: MARKER_MODEL,
    max_tokens: 64000,
    system: [{ type: 'text', text: `${SYSTEM}\n\n${firmContext(set)}`, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Mark these ${docs.length} documents.\n\n${docs.map(documentBlock).join('\n\n')}` }],
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
  }
}

interface Answer {
  documents: { id: string; applies_to: { scope: string; name: string }[]; why: string; confidence: string }[]
}

// The answer checked against the set: every document answered once, every
// entity one the firm has, no fund on a geopolitical item. Marks for the
// documents that check out; problems for the rest (asked again later).
export function vetMarks(set: MatchingSet, docs: SetDocument[], answer: Answer): { marks: Mark[]; problems: string[] } {
  const marks: Mark[] = []
  const problems: string[] = []
  const find = (rows: SetEntityRow[], name: string) => rows.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.name
  for (const d of docs) {
    const given = (answer.documents ?? []).filter(a => a.id === d.id)
    if (given.length !== 1) {
      problems.push(`${d.id}: answered ${given.length} times`)
      continue
    }
    const a = given[0]
    const expected: EntityRef[] = []
    let bad = false
    for (const e of a.applies_to) {
      if (e.scope === 'firm') expected.push({ scope: 'firm' })
      else if (e.scope === 'fund' || e.scope === 'company') {
        const name = find(e.scope === 'fund' ? set.funds : set.companies, e.name)
        if (!name) {
          problems.push(`${d.id}: no ${e.scope} named "${e.name}"`)
          bad = true
        } else if (e.scope === 'fund' && d.category === 'geopolitical') {
          problems.push(`${d.id}: a fund on a geopolitical item`)
          bad = true
        } else expected.push({ scope: e.scope, name })
      }
    }
    if (bad) continue
    const unique = [...new Map(expected.map(e => [`${e.scope}:${e.name ?? ''}`, e])).values()]
    const confidence = (['high', 'medium', 'low'].includes(a.confidence) ? a.confidence : 'low') as Confidence
    marks.push({ id: d.id, expected: unique, why: a.why.trim(), confidence })
  }
  return { marks, problems }
}

// Fable 5.2's list prices per million tokens; the batch service halves
// every one of them.
export const PRICE = { input: 8, cacheWrite: 10, cacheRead: 0.2, output: 40 }

export interface Usage {
  input_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  output_tokens?: number
}

export function costUsd(u: Usage, batch: boolean): number {
  const dollars =
    ((u.input_tokens ?? 0) * PRICE.input + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.output_tokens ?? 0) * PRICE.output) /
    1_000_000
  return batch ? dollars / 2 : dollars
}

// The documents still without an answer, in groups of one category each
// (so the geopolitical rules sit with geopolitical items).
export function groups(set: MatchingSet, only?: (d: SetDocument) => boolean): SetDocument[][] {
  const out: SetDocument[][] = []
  for (const category of ['regulatory', 'geopolitical'] as const) {
    const left = set.documents.filter(d => d.category === category && !Array.isArray(d.expected) && (!only || only(d)))
    for (let i = 0; i < left.length; i += GROUP) out.push(left.slice(i, i + GROUP))
  }
  return out
}
