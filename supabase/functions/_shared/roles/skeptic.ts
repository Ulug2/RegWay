// The Skeptic: a second, separate pass whose only job is to try to break a
// conclusion another AI step reached. A model is a weak critic of its own
// single-pass reasoning, so the matchers' verdicts (and, later, the chat's
// claims) are handed to a fresh call with a mandate to disagree, its own
// context, and only the recorded facts to go on (roadmap item 17).
//
// reviewVerdicts: for each match a matcher marked relevant, keep it, move
// it to the entity it really rests on, or reject it.

import { MODEL_FOR } from '../ai/models.ts'
import { runTool, type ToolSpec } from '../ai/structured.ts'
import type { UsageTarget } from '../ai/client.ts'
import { FACT_MARKERS } from '../entityFacts.ts'
import { describeRecord, findEntity, type EntityScope, type FirmRecord } from './entityContext.ts'

const MODEL = MODEL_FOR.skeptic
const SUMMARY_CHARS = 1500

// What every Skeptic review checks, whatever it is reviewing.
export const CHALLENGE_CHECKLIST = `Check each one against this list:
1. Unstated assumption: does the connection need a fact about the entity that is not recorded (what it sells, who its customers are, whether it is licensed, whether it imports, its size)? A fact listed as "not recorded" is unknown, not a yes.
2. Wrong entity: does the connection actually run through a different entity than the one named (a company's activity stored as a match for the firm, or the other way round)?
3. Entity type: does the measure bind this kind of entity at all (an investment adviser, a fund, a hospital, a carrier, a bank)?
4. Scope of the measure: if it is limited to particular products, sectors, activities or places, does the entity's recorded activity or location fall inside it? A shared region or a general industry label is not enough.
5. Real obligation: does the document create or change an obligation, restriction or exposure, or is it administrative (a correction, an extension of a comment period, an approval of another body's program, an individual's case)?
6. Proposed vs final, published vs effective: is the conclusion right about what is already binding?
7. Thresholds and exemptions: is there a recorded fact that puts the entity under a threshold or inside an exemption?
8. Jurisdiction: a UK or EU measure binds only an entity recorded as established, operating or marketing there; a state measure only one recorded in that state.
9. Could the opposite be true: argue briefly that it does not apply; if that argument is at least as strong, the match is not supported.`

export type SkepticDecision = 'keep' | 'move' | 'reject'

export interface DocumentUnderReview {
  title: string
  issuer: string | null
  jurisdiction: string | null
  published_date?: string | null
  effective_date?: string | null
  summary: string | null
  countries?: string[]
}

export interface VerdictUnderReview {
  // The caller's own key for the item, echoed back.
  index: number
  document: DocumentUnderReview
  scope: EntityScope
  entity_name: string | null
  reason: string
}

export interface VerdictReview {
  index: number
  decision: SkepticDecision
  // The entity the match stands on after the review (the original one,
  // unless the decision is move).
  scope: EntityScope
  entity_name: string | null
  reason: string
  unsupported_assumptions: string[]
}

export type ReviewCategory = 'regulatory' | 'geopolitical'

const CATEGORY_NOTES: Record<ReviewCategory, string> = {
  regulatory:
    'These are rules, proposed rules, guidance and regulator announcements. A match is supported only when the document creates a specific obligation, deadline or requirement and a recorded fact of the named entity puts it inside that measure.',
  geopolitical:
    'These are sanctions, export controls, trade actions and travel advisories, matched by recorded location. A designation of named persons or entities is not a measure on their country: presence in that country is not a connection. A measure limited to products or sectors needs the entity\'s recorded activity to fall inside it, besides any location link. A global import measure needs recorded foreign suppliers or import activity. Geopolitical matches stand on the firm or a portfolio company, never on a fund (fund exposure is derived from holdings).',
}

const SYSTEM = `You are the reviewer in RegWay, a regulatory intelligence service for private equity firms. Another step has matched documents to a firm, one of its funds, or one of its portfolio companies, each with a stated reason. Your job is to try to break each match. You are not the matcher's colleague; a match you let through is shown to the firm as something that applies to it.

${CHALLENGE_CHECKLIST}

Decide for each match:
- "keep": the reason rests on recorded facts of the named entity and survives every check. Do not reject a well-supported match because you can imagine a doubt the facts do not raise.
- "move": the connection is real and supported by recorded facts, but it runs through a different entity than the one named. Give that entity's scope and its exact name as listed, and a reason that names the recorded fact it rests on.
- "reject": any check fails and no other entity's recorded facts support it either.

Write each reason as one sentence a compliance officer can check against the recorded facts: name the fact and the measure. For a rejection, say which check failed. Never add a fact that is not recorded. ${FACT_MARKERS}`

const TOOL: ToolSpec = {
  name: 'submit_reviews',
  description: 'Submit a review for every numbered match.',
  input_schema: {
    type: 'object',
    properties: {
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            decision: { type: 'string', enum: ['keep', 'move', 'reject'] },
            scope: { type: 'string', enum: ['firm', 'fund', 'company'], description: 'Where the match stands after the review: the original entity for keep or reject, the new one for move.' },
            entity_name: { type: 'string', description: 'Exact fund or company name as listed when scope is fund or company, else empty string.' },
            reason: { type: 'string', description: 'One sentence naming the recorded fact and the measure, or the check that failed.' },
            unsupported_assumptions: { type: 'array', items: { type: 'string' }, description: 'Facts the original reason assumed that are not recorded. Empty if none.' },
          },
          required: ['index', 'decision', 'scope', 'entity_name', 'reason', 'unsupported_assumptions'],
        },
      },
    },
    required: ['reviews'],
  },
}

function itemText(item: VerdictUnderReview): string {
  const d = item.document
  const dates = [d.published_date ? `published ${d.published_date}` : '', d.effective_date ? `effective ${d.effective_date}` : ''].filter(Boolean).join(', ')
  const where = item.scope === 'firm' ? 'the firm' : `${item.scope} "${item.entity_name}"`
  return `${item.index}. ${d.title}
   Issuer: ${d.issuer ?? 'n/a'}${d.jurisdiction ? ` · ${d.jurisdiction}` : ''}${dates ? ` · ${dates}` : ''}${d.countries?.length ? ` · countries named: ${d.countries.join(', ')}` : ''}
   Summary: ${(d.summary ?? 'none').slice(0, SUMMARY_CHARS)}
   Matched to ${where}. Stated reason: ${item.reason}`
}

export async function reviewVerdicts(
  input: { record: FirmRecord; category: ReviewCategory; items: VerdictUnderReview[] },
  usage: UsageTarget,
): Promise<VerdictReview[]> {
  const { record, category, items } = input
  if (items.length === 0) return []
  const allowedScopes: EntityScope[] = category === 'geopolitical' ? ['firm', 'company'] : ['firm', 'fund', 'company']

  const answer = await runTool<{ reviews: (Omit<VerdictReview, 'entity_name'> & { entity_name: string })[] }>(
    {
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tool: TOOL,
      cacheTool: true,
      messages: [
        {
          role: 'user',
          content: [
            {
              // Changes only when the firm edits its profile: cached apart
              // from the matches, which differ every run.
              type: 'text',
              cache_control: { type: 'ephemeral' },
              text: `Firm: ${record.firmName}. What is recorded about it, its funds and its portfolio companies:
${describeRecord(record, { footprints: category === 'geopolitical' })}`,
            },
            { type: 'text', text: `${CATEGORY_NOTES[category]}\n\nMatches to review:\n${items.map(itemText).join('\n\n')}` },
          ],
        },
      ],
      // Every match reviewed exactly once, and a move names a real entity.
      check: a => {
        const wanted = new Set(items.map(i => i.index))
        const seen = new Set<number>()
        for (const r of a.reviews ?? []) {
          if (!wanted.has(r.index)) return `review for unknown match ${r.index}`
          if (seen.has(r.index)) return `two reviews for match ${r.index}`
          seen.add(r.index)
          if (r.decision === 'move' && (!allowedScopes.includes(r.scope) || !findEntity(record, r.scope, r.entity_name))) {
            return `match ${r.index} moved to an entity not listed: ${r.scope} "${r.entity_name}"`
          }
        }
        return seen.size === wanted.size ? null : 'not every match was reviewed'
      },
    },
    { usage },
  )

  const byIndex = new Map(items.map(i => [i.index, i]))
  return answer.reviews.map(r => {
    const original = byIndex.get(r.index)!
    if (r.decision !== 'move') {
      // Keep and reject stay on the entity the matcher named.
      return { ...r, scope: original.scope, entity_name: original.entity_name, unsupported_assumptions: r.unsupported_assumptions ?? [] }
    }
    const entity = findEntity(record, r.scope, r.entity_name)!
    return { ...r, entity_name: r.scope === 'firm' ? null : entity.name, unsupported_assumptions: r.unsupported_assumptions ?? [] }
  })
}
