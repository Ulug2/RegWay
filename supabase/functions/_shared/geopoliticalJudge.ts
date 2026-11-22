// The geopolitical verdict step, shared by match-geopolitical-relevance
// (a batch of new developments) and rematch-regulation (one development a
// user flagged, with their correction). One prompt, so a re-check is judged
// by exactly the rules the original match was.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { describeFootprint, overlaps, type EntityFootprint } from './footprint.ts'
import type { Verdict } from './relevance.ts'
import { callClaude, toolInput } from './ai/client.ts'
import { MODEL_FOR } from './ai/models.ts'

const MODEL = MODEL_FOR.geopoliticalJudge
const EXCERPT_CHARS = 600

export interface Candidate {
  id: string
  title: string
  agency: string | null
  summary: string | null
  countries: string[]
  published_date: string | null
}

export const CANDIDATE_COLUMNS = 'id, title, agency, summary, countries, published_date'

function candidateLine(c: Candidate, i: number, footprints: EntityFootprint[]): string {
  const where = c.countries.length ? c.countries.join(', ') : 'no specific country (global or program-wide measure)'
  const matched = c.countries.length ? overlaps(footprints, c.countries) : []
  const summary = (c.summary ?? 'no summary').slice(0, EXCERPT_CHARS)
  return `${i}. [${c.agency ?? 'source n/a'}, ${c.published_date ?? 'date n/a'}] ${c.title}
   Countries named: ${where}
   Overlapping profile facts: ${matched.length ? matched.join('; ') : 'none (global measure; judge against the footprints above)'}
   Summary: ${summary}`
}

const INSTRUCTIONS = `Below are numbered geopolitical developments from official government sources. Most are U.S.: OFAC sanctions actions and regulations, BIS export controls, USTR trade actions, presidential sanctions/tariff documents, and State Department travel advisories (levels 3-4). Some are UK sanctions (UK sanctions regulations, OFSI general licences and notices) or EU sanctions (the Council's restrictive measures); the issuer in brackets says which.

A UK or EU sanctions measure binds people and businesses in the UK or the EU, and business done there. For one of those, a recorded connection to the affected country is not enough on its own: the same entity must also be recorded as headquartered, having facilities or operating in the UK (for a UK measure) or in an EU member state (for an EU measure). Name both facts in the reason, or mark it not relevant.

For each development, decide whether it has a supported connection to the firm or a specific portfolio company through a recorded location: where the entity is headquartered or domiciled, where its facilities are, where it operates, or where its key suppliers are. "Overlapping profile facts" lists the exact matches already found; base your verdict on those and on the footprints above, never on assumed facts.

Mark relevant only when you can name the specific recorded fact and how the development could plausibly reach it (illustrative only: "Direct: Harbor Logistics (does: consumer-goods freight forwarding) operates in Vietnam; this tariff action covers consumer goods imported from Vietnam, which could affect the volumes it handles there. How much of that volume is U.S.-bound is not recorded."). Mark not relevant when:
- the only link is a shared region or a general "international" footprint with no recorded country in common, or
- the measure targets named persons/entities and nothing recorded suggests the entity deals with them. In particular, for a designation of named persons, entities, or vessels (e.g. a "Notice of OFAC Sanctions Action" adding names to the SDN List), the countries named are the sanctions program's country or where the designees are located; neither is a measure on the country. A designation under a country's program, or a designee located in a country, where an entity operates or is headquartered is NOT a connection, so mark it not relevant, or
- the development is administrative (a general license renewal, a procedural/penalty-schedule update) and creates no new restriction on any recorded location.

For a measure limited to particular products, goods, or sectors (a tariff on aircraft parts, export controls on semiconductors, a manufacturing-sector investigation), the entity's recorded activity ("does: ...") must fall within what the measure covers, in addition to any location link. For a global measure (no country named), mark relevant only if it targets a type of activity a specific entity's recorded footprint actually involves (e.g. a tariff on imports and the company has recorded foreign suppliers). Foreign facilities or operations alone are not import activity: a global import measure (a tariff, duty, or de minimis change) needs recorded foreign suppliers or recorded import activity. If supplier locations are NOT RECORDED for a company, do not assume it has or lacks suppliers anywhere.

The connection itself must rest on recorded facts; only its possible effect may be conditional. If the connection depends on an unrecorded assumption about what the entity does ("if it exports these materials", "if it involves ICT products"), mark it not relevant. Continuations or renewals of an existing national emergency that add no new measure are administrative.

Language rules for every reason (these are hard rules):
- Never state or imply that an entity is sanctioned, designated, prohibited from a transaction, or in violation. Presence in an affected country does not establish any of that.
- If a measure names an organization whose name resembles a portfolio company, do NOT treat that as the same entity. Mark not relevant unless a recorded location independently supports a connection, and then say the identity is unconfirmed.
- Say which kind of connection it is: "direct" (the entity's own headquarters, facilities, or operations) or "indirect" (a supplier location).
- State the possible effect conditionally ("could affect", "if it sources from") and name what is unknown.

Scope: "company" (with the exact company name) for a portfolio company's connection; "firm" only for the firm's own headquarters/domicile. Never use "fund": a fund's exposure is derived automatically from the companies it is recorded as holding, so judge companies and the firm only. Return at least one verdict for every numbered development; add one verdict per additional company the same development connects to.`

// A user's dispute of an earlier verdict, appended after the developments
// (outside the cached prefix, which stays per-firm).
function correctionText(correction: string | null | undefined): string {
  if (correction === undefined) return ''
  return correction
    ? `\n\nA user has flagged the previous verdict for this development as possibly incorrect and provided this correction: "${correction}". Weigh it against the recorded footprints above. If it changes your assessment, say so in your reason; if it doesn't change whether the development reaches the entity, explain why not. A correction can remove an assumed fact but cannot add an unrecorded one.`
    : '\n\nA user has flagged the previous verdict for this development as possibly incorrect, with no further detail. Re-assess strictly against the recorded footprints above.'
}

// Verdicts for every candidate (at least one each: a skipped candidate gets
// a firm-level "not relevant" marker so it isn't re-sent and re-billed).
// `correction` is set only for a user-disputed re-check: null = flagged with
// no note.
export async function judgeGeopolitical(
  admin: SupabaseClient,
  opts: {
    firmId: string
    firmName: string
    companies: { name: string }[]
    footprints: EntityFootprint[]
    candidates: Candidate[]
    functionName: string
    correction?: string | null
    // Overridable to compare a cheaper model on this exact prompt (item 6.3).
    model?: string
  },
): Promise<Verdict[]> {
  const { firmId, companies, footprints, candidates, functionName, model = MODEL } = opts
  const result = await callClaude({
    model,
    max_tokens: 4096,
    // Verdicts, not prose: the same item should get the same answer on
    // every run (at the default temperature borderline items flipped).
    temperature: 0,
    tool_choice: { type: 'tool', name: 'submit_verdicts' },
    tools: [
      {
        name: 'submit_verdicts',
        description: 'Submit a relevance verdict for every numbered geopolitical development.',
        input_schema: {
          type: 'object',
          properties: {
            verdicts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'integer' },
                  relevant: { type: 'boolean' },
                  reason: {
                    type: 'string',
                    description:
                      'One or two sentences: the recorded location fact, whether the connection is direct or indirect, and the possible effect stated conditionally. Never imply the entity is sanctioned or prohibited from anything.',
                  },
                  scope: { type: 'string', enum: ['firm', 'company'] },
                  entity_name: { type: 'string', description: 'Exact portfolio company name if scope is company, else empty string' },
                },
                required: ['index', 'relevant', 'reason', 'scope'],
              },
            },
          },
          required: ['verdicts'],
        },
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            // Changes only when the firm edits a location — cached
            // separately from the per-batch development list.
            type: 'text',
            cache_control: { type: 'ephemeral' },
            text: `Firm: ${opts.firmName}. Recorded location footprints:
${footprints.map(describeFootprint).join('\n')}

${INSTRUCTIONS}`,
          },
          { type: 'text', text: candidates.map((c, i) => candidateLine(c, i, footprints)).join('\n\n') + correctionText(opts.correction) },
        ],
      },
    ],
  }, { usage: { admin, functionName, firmId } })

  // A company verdict naming no real company would otherwise fall through
  // buildRelevanceRows to a firm-level row, putting a company's connection
  // on the firm page. Drop it.
  const companyNames = new Set(companies.map(c => c.name.toLowerCase()))
  const verdicts: Verdict[] = (toolInput<{ verdicts?: Verdict[] }>(result, 'submit_verdicts')?.verdicts ?? []).filter(
    (v: Verdict) => v.scope === 'firm' || (v.scope === 'company' && !!v.entity_name && companyNames.has(v.entity_name.toLowerCase())),
  )

  // Any development the model skipped still gets a firm-level marker, so
  // it isn't re-sent (and re-billed) on every run.
  const answered = new Set(verdicts.map(v => v.index))
  const skipped: Verdict[] = candidates
    .map((_, index) => index)
    .filter(index => !answered.has(index))
    .map(index => ({ index, relevant: false, reason: 'No verdict returned for this development.', scope: 'firm', entity_name: null }))

  return [...verdicts, ...skipped]
}
