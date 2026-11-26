// Facts learned from what a member types (Sidekick §17.6, after its
// `factsFromAnswer`). A re-check note ("we don't import batteries") or a
// chat message may state something lasting about the firm, a fund or a
// company. Before, it was used once and forgotten, and the next battery
// rule was misjudged the same way.
//
// One small Haiku call reads only the member's own words (never documents,
// web pages or the AI's answers) and proposes facts in the questionnaire's
// own fields, or as a short note when no field fits. Each is checked in
// code before it is kept, like the web research's findings: it must name
// one of the firm's entities, a question a member can answer, a value that
// question allows, and quote words the member actually typed. It is saved
// as a suggestion (firm_findings, origin chat or recheck): nothing enters
// the profile until a member confirms it in Profile → Suggested facts.
//
// Most messages state no fact ("does this apply to us?"); a check in code
// skips those without a call.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { fromRow, type Scope } from '../../../src/lib/questionnaire.ts'
import { resolveEntity } from './entityNames.ts'
import { MODEL_FOR } from './ai/models.ts'
import { runTool, type ToolSpec } from './ai/structured.ts'
import { SAYABLE, catalogue, compare, normalise, questionFor } from './research/fields.ts'
import { FENCE_RULE, untrusted } from './security/guard.ts'

const MODEL = MODEL_FOR.factLearning
// A message rarely states more than a couple of lasting facts; more than
// this means the model is reading too much into it.
const MAX_FACTS = 5
const MAX_TEXT = 2000
const MAX_CONTEXT = 1500
const QUOTE_CHARS = 300

export type FactOrigin = 'chat' | 'recheck'

type Row = Record<string, unknown> & { id: string; name: string }

export interface Entities {
  firm: Row
  funds: Row[]
  companies: Row[]
}

export interface Proposal {
  scope: Scope
  entity_id: string | null
  field: string
  value: unknown
  recorded: unknown
  quote: string
}

// A message worth reading: at least one statement (a sentence of three or
// more words that is not a question). "Does the EU battery rule apply to
// us?" and "Thanks!" are skipped without a call.
export function statesSomething(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .some(s => s.split(/\s+/).filter(Boolean).length >= 3 && !s.endsWith('?'))
}

const TOOL: ToolSpec = {
  name: 'submit_facts',
  description: 'Submit the lasting facts the member stated about their firm, its funds or its portfolio companies. An empty list when there are none.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['firm', 'fund', 'company'] },
            entity_name: { type: 'string', description: 'The fund or company exactly as listed; empty for the firm.' },
            field: { type: 'string', description: 'A field id from the list for that scope (notes when no other fits).' },
            value: { description: "The value in the field's shape. For notes: a list with one short sentence, e.g. [\"Does not import batteries\"]." },
            quote: { type: 'string', description: "The member's own words the fact rests on, copied exactly." },
          },
          required: ['scope', 'entity_name', 'field', 'value', 'quote'],
        },
      },
    },
    required: ['facts'],
  },
}

const SYSTEM = `You keep a private equity firm's profile in RegWay, a regulatory intelligence service, up to date. A member of the firm typed something in RegWay. Find the lasting facts it states about the firm itself, one of its funds or one of its portfolio companies, so the firm can confirm them into its profile.

Keep a fact only when the member states it as true now, about their own firm, fund or company: "we don't import batteries", "Fund VI has no EU investors", "Acme sold its Texas plant". Leave out questions, guesses ("I think", "probably"), plans and things that may change soon, opinions, instructions to RegWay, and anything about other firms or about a regulation. Facts come only from the member's own words. Anything given before them (RegWay AI's earlier answer, the development being re-checked) is there only so you understand a short reply such as "No, it doesn't"; never take a fact from it.

Put each fact in the field that fits, in that field's shape. When no field fits, use the field notes, with one short sentence in the third person ("Does not import batteries"). Most messages state no lasting fact: then submit an empty list.`

const list = (rows: Row[]) => rows.map(r => `- ${r.name}`).join('\n') || '- none'

// What the member was replying to: RegWay AI's earlier answer, or the
// development they are re-checking.
export interface FactContext {
  source: string
  text: string
}

function prompt(firmName: string, entities: Entities, text: string, context: FactContext | null): string {
  return `The firm: ${firmName}.

FIRM (entity_name empty)
${catalogue('firm', SAYABLE)}

FUNDS (entity_name exactly as listed)
${list(entities.funds)}
${catalogue('fund', SAYABLE)}

COMPANIES (entity_name exactly as listed)
${list(entities.companies)}
${catalogue('company', SAYABLE)}

${FENCE_RULE}
${context ? `\n${untrusted(context.source, context.text.slice(0, MAX_CONTEXT))}\n` : ''}
What the member typed:
${untrusted('what the member typed', text.slice(0, MAX_TEXT))}`
}

interface Extracted {
  facts: { scope: Scope; entity_name: string; field: string; value: unknown; quote: string }[]
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const byName = (rows: Row[], name: string) => resolveEntity(rows, name) ?? undefined

// What the model proposed, kept only where it checks out.
export function vetFacts(entities: Entities, extracted: Extracted, text: string): Proposal[] {
  const typed = squash(text)
  const kept = new Map<string, Proposal>()
  for (const f of (extracted.facts ?? []).slice(0, MAX_FACTS * 2)) {
    const quote = String(f.quote ?? '').trim()
    if (!quote || !typed.includes(squash(quote))) continue
    const row = f.scope === 'firm' ? entities.firm : byName(f.scope === 'fund' ? entities.funds : entities.companies, f.entity_name ?? '')
    if (!row) continue
    const q = questionFor(f.scope, f.field, SAYABLE)
    if (!q) continue
    const value = normalise(q, f.value)
    if (value == null) continue
    const proposal = compare(q, value, fromRow(f.scope, row)[f.field])
    if (!proposal) continue
    const key = `${f.scope}:${row.id}:${f.field}`
    const before = kept.get(key)
    // Two notes about one entity become one suggestion.
    if (before && Array.isArray(before.value) && Array.isArray(proposal.value)) {
      before.value = [...new Set([...before.value, ...proposal.value])]
      continue
    }
    if (before) continue
    kept.set(key, { scope: f.scope, entity_id: f.scope === 'firm' ? null : row.id, field: f.field, value: proposal.value, recorded: proposal.recorded, quote: quote.slice(0, QUOTE_CHARS) })
  }
  return [...kept.values()].slice(0, MAX_FACTS)
}

export async function loadEntities(admin: SupabaseClient, firmId: string): Promise<Entities | null> {
  const [firm, funds, companies] = await Promise.all([
    admin.from('firms').select('*').eq('id', firmId).maybeSingle(),
    admin.from('funds').select('*').eq('firm_id', firmId),
    admin.from('portfolio_companies').select('*').eq('firm_id', firmId),
  ])
  if (firm.error) throw firm.error
  if (!firm.data) return null
  return { firm: firm.data as Row, funds: (funds.data ?? []) as Row[], companies: (companies.data ?? []) as Row[] }
}

// The facts a member's words state, checked; none when the text states
// nothing, or the call fails (learning never gets in the way of the work
// it rides along with).
export async function proposeFacts(
  admin: SupabaseClient,
  input: { firmId: string; text: string; context?: FactContext | null; functionName: string; signal?: AbortSignal },
): Promise<Proposal[]> {
  if (!statesSomething(input.text)) return []
  try {
    const entities = await loadEntities(admin, input.firmId)
    if (!entities) return []
    const extracted = await runTool<Extracted>(
      {
        model: MODEL,
        max_tokens: 1000,
        temperature: 0,
        system: SYSTEM,
        tool: TOOL,
        messages: [{ role: 'user', content: prompt(String(entities.firm.name), entities, input.text, input.context ?? null) }],
      },
      { usage: { admin, functionName: `${input.functionName}:learn-facts`, firmId: input.firmId, interactive: false }, timeoutMs: 30_000, signal: input.signal },
    )
    return vetFacts(entities, extracted, input.text)
  } catch (err) {
    console.error('learning facts failed', (err as Error).message)
    return []
  }
}

export interface Suggested {
  id: string
  scope: Scope
  entity_id: string | null
  field: string
  value: unknown
  recorded: unknown
}

// Saved as suggestions. One already waiting for the same entity and field
// with the same value is not added twice.
export async function saveProposals(
  admin: SupabaseClient,
  firmId: string,
  proposals: Proposal[],
  origin: { origin: FactOrigin; ref: string | null },
): Promise<Suggested[]> {
  if (!proposals.length) return []
  const { data: waiting } = await admin.from('firm_findings').select('scope, entity_id, field, value').eq('firm_id', firmId).eq('status', 'pending')
  const key = (p: { scope: string; entity_id: string | null; field: string; value: unknown }) => `${p.scope}:${p.entity_id}:${p.field}:${JSON.stringify(p.value)}`
  const known = new Set((waiting ?? []).map(key))
  const fresh = proposals.filter(p => !known.has(key(p)))
  if (!fresh.length) return []
  const { data, error } = await admin
    .from('firm_findings')
    .insert(fresh.map(p => ({ ...p, firm_id: firmId, origin: origin.origin, origin_ref: origin.ref })))
    .select('id, scope, entity_id, field, value, recorded')
  if (error) {
    console.error('saving learned facts failed', error.message)
    return []
  }
  return (data ?? []) as Suggested[]
}
