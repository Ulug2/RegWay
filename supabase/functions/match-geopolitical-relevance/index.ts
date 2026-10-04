// Matches geopolitical developments (sanctions, export controls, trade
// actions, travel advisories, i.e. `category: geopolitical`) to a firm and
// its portfolio companies. A separate function from match-relevance and
// match-enforcement-relevance for the same reason those two are separate:
// the question is different. A geopolitical item is relevant through
// *where* an entity is (spec §8: a facility in an affected country, a
// supplier there, an investment in a company that operates there), not
// through its sector or conduct.
//
// Pipeline: pre-filter (free) → AI verdict (survivors only).
// 1. Each entity's footprint (_shared/footprint.ts) gives the countries the
//    firm touches and how. Only developments naming one of those countries,
//    or naming none (global measures) when anything has a non-U.S.
//    footprint, are candidates. Most items never reach the model.
// 2. Each candidate goes to the model with the exact overlapping profile
//    facts already computed, so the verdict explains a connection the code
//    found rather than inventing one.
//
// Fund-level indirect matches ("the fund holds a company that operates
// there") need a fund → company holdings relationship, which doesn't exist
// yet. Spec §3 forbids guessing it, so funds are not matched here.
//
//   POST /functions/v1/match-geopolitical-relevance   {}
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm
//
//   POST /functions/v1/match-geopolitical-relevance   { "reevaluate": true }
//   — after a location edit: forgets this firm's "not relevant" geopolitical
//   verdicts first, so items rejected under the old footprint get another look.
//
// Or, for cron/admin use:
//   POST /functions/v1/match-geopolitical-relevance   { "firmId": "<uuid>" }
//   Authorization: Bearer <service role key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateImpacts } from '../_shared/impact.ts'
import { handleOptions, json } from '../_shared/cors.ts'
import { companyFootprint, describeFootprint, firmFootprint, foreignCountries, hasForeignExposure, overlaps, type EntityFootprint } from '../_shared/footprint.ts'
import { buildRelevanceRows, checkRateLimit, loadFirmEntities, resolveFirmContext, upsertRelevanceRows, type Verdict } from '../_shared/relevance.ts'
import { recordUsage } from '../_shared/usage.ts'

const MODEL = 'claude-sonnet-4-5'
const FUNCTION_NAME = 'match-geopolitical-relevance'
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BATCH_SIZE = 40
// How far back each run looks, per query. Same bound as the other matchers.
const CANDIDATE_WINDOW = 200
const EXCERPT_CHARS = 600
const DELETE_CHUNK = 100

interface Candidate {
  id: string
  title: string
  agency: string | null
  summary: string | null
  countries: string[]
  published_date: string | null
}

const CANDIDATE_COLUMNS = 'id, title, agency, summary, countries, published_date'

// Geopolitical items that could touch this firm at all: those naming a
// country the firm is connected to, plus country-less (global) measures
// when anything has a non-U.S. footprint. Two indexed queries rather than
// one OR, so neither needs hand-built PostgREST array literals.
async function loadCandidates(admin: SupabaseClient, footprints: EntityFootprint[]): Promise<Candidate[]> {
  const countries = foreignCountries(footprints)
  const base = () => admin.from('regulations').select(CANDIDATE_COLUMNS).eq('category', 'geopolitical').order('published_date', { ascending: false }).limit(CANDIDATE_WINDOW)

  const [byCountry, global] = await Promise.all([
    countries.length ? base().overlaps('countries', countries) : Promise.resolve({ data: [], error: null }),
    hasForeignExposure(footprints) ? base().eq('countries', '{}') : Promise.resolve({ data: [], error: null }),
  ])
  if (byCountry.error) throw byCountry.error
  if (global.error) throw global.error

  // Re-capped after merging: the ids go into an `in (...)` filter in the
  // query string, and 400 UUIDs would push that URL past common limits.
  return [...(byCountry.data ?? []), ...(global.data ?? [])]
    .sort((a, b) => (b.published_date ?? '').localeCompare(a.published_date ?? ''))
    .slice(0, CANDIDATE_WINDOW)
}

// Deletes this firm's "not relevant" verdicts on geopolitical items, so a
// footprint change (a new supplier country, a new operating location) gets
// them re-evaluated. Relevant rows and user dismissals are kept.
async function forgetRejections(admin: SupabaseClient, firmId: string): Promise<void> {
  const { data, error } = await admin
    .from('regulation_relevance')
    .select('id, regulations!inner(category)')
    .eq('firm_id', firmId)
    .eq('regulations.category', 'geopolitical')
    .like('relevance_reason', 'NOT_RELEVANT:%')
    .is('dismissed_at', null)
  if (error) throw error
  const ids = (data ?? []).map(r => r.id)
  // Chunked: the ids travel in the query string (see loadCandidates).
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const { error: deleteError } = await admin.from('regulation_relevance').delete().in('id', ids.slice(i, i + DELETE_CHUNK))
    if (deleteError) throw deleteError
  }
}

function candidateLine(c: Candidate, i: number, footprints: EntityFootprint[]): string {
  const where = c.countries.length ? c.countries.join(', ') : 'no specific country (global or program-wide measure)'
  const matched = c.countries.length ? overlaps(footprints, c.countries) : []
  const summary = (c.summary ?? 'no summary').slice(0, EXCERPT_CHARS)
  return `${i}. [${c.agency ?? 'source n/a'}, ${c.published_date ?? 'date n/a'}] ${c.title}
   Countries named: ${where}
   Overlapping profile facts: ${matched.length ? matched.join('; ') : 'none (global measure; judge against the footprints above)'}
   Summary: ${summary}`
}

const INSTRUCTIONS = `Below are numbered geopolitical developments from official U.S. government sources: OFAC sanctions actions and regulations, BIS export controls, USTR trade actions, presidential sanctions/tariff documents, and State Department travel advisories (levels 3-4).

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

Scope: "company" (with the exact company name) for a portfolio company's connection; "firm" only for the firm's own headquarters/domicile. Never use "fund": fund-to-company holdings are not recorded, so no fund-level connection can be supported. Return at least one verdict for every numbered development; add one verdict per additional company the same development connects to.`

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.clone().json().catch(() => ({}))

    const ctx = await resolveFirmContext(req, admin)
    if (ctx instanceof Response) return ctx
    const { firmId, rateLimitClient } = ctx

    const { firm, funds, companies } = await loadFirmEntities(admin, firmId)
    if (!firm) return json({ error: 'Firm not found' }, 404)

    if (body?.reevaluate === true) await forgetRejections(admin, firmId)

    const footprints = [firmFootprint(firm), ...companies.map(companyFootprint)]
    const candidates = await loadCandidates(admin, footprints)
    if (candidates.length === 0) return json({ evaluated: 0, relevant: 0, candidates: 0 })

    const { data: alreadyEvaluated, error: evaluatedError } = await admin
      .from('regulation_relevance')
      .select('regulation_id')
      .eq('firm_id', firmId)
      .in('regulation_id', candidates.map(c => c.id))
    if (evaluatedError) throw evaluatedError

    const evaluatedIds = new Set((alreadyEvaluated ?? []).map(r => r.regulation_id))
    const unevaluated = candidates.filter(c => !evaluatedIds.has(c.id)).slice(0, BATCH_SIZE)
    if (unevaluated.length === 0) return json({ evaluated: 0, relevant: 0, candidates: candidates.length })

    // Only checked once there's real work, so a no-op run (the common case
    // on dashboard load) never uses up the caller's allowance.
    if (rateLimitClient) {
      const allowed = await checkRateLimit(rateLimitClient, FUNCTION_NAME, 15, 60)
      if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
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
                text: `Firm: ${firm.name}. Recorded location footprints:
${footprints.map(describeFootprint).join('\n')}

${INSTRUCTIONS}`,
              },
              { type: 'text', text: unevaluated.map((c, i) => candidateLine(c, i, footprints)).join('\n\n') },
            ],
          },
        ],
      }),
    })

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
    const result = await res.json()
    const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    // A company verdict naming no real company would otherwise fall through
    // buildRelevanceRows to a firm-level row, putting a company's connection
    // on the firm page. Drop it; the item is re-evaluated next run.
    const companyNames = new Set(companies.map(c => c.name.toLowerCase()))
    const verdicts: Verdict[] = (toolUse?.input?.verdicts ?? []).filter(
      (v: Verdict) => v.scope === 'firm' || (v.scope === 'company' && !!v.entity_name && companyNames.has(v.entity_name.toLowerCase())),
    )

    await recordUsage(admin, {
      functionName: FUNCTION_NAME,
      firmId,
      model: MODEL,
      inputTokens: result.usage?.input_tokens,
      cacheCreationInputTokens: result.usage?.cache_creation_input_tokens,
      cacheReadInputTokens: result.usage?.cache_read_input_tokens,
      outputTokens: result.usage?.output_tokens,
    })

    // Any development the model skipped still gets a firm-level marker, so
    // it isn't re-sent (and re-billed) on every run.
    const answered = new Set(verdicts.map(v => v.index))
    const skipped: Verdict[] = unevaluated
      .map((_, index) => index)
      .filter(index => !answered.has(index))
      .map(index => ({ index, relevant: false, reason: 'No verdict returned for this development.', scope: 'firm', entity_name: null }))

    const rows = buildRelevanceRows([...verdicts, ...skipped], unevaluated, firmId, funds, companies)
    await upsertRelevanceRows(admin, rows)

    const newlyRelevantIds = [...new Set(verdicts.filter(v => v.relevant).map(v => unevaluated[v.index]?.id).filter((id): id is string => !!id))]
    if (newlyRelevantIds.length > 0) EdgeRuntime.waitUntil(generateImpacts(admin, newlyRelevantIds, firmId))

    return json({ evaluated: unevaluated.length, relevant: newlyRelevantIds.length, candidates: candidates.length })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
