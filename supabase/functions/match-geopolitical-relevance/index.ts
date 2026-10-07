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
// 3. Fund-level indirect matches ("the fund holds a company that operates
//    there") are derived from recorded holdings plus the company verdicts
//    (_shared/holdings.ts), never asked of the model, so ownership is
//    never guessed (spec §3).
//
//   POST /functions/v1/match-geopolitical-relevance   {}
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm
//
//   POST /functions/v1/match-geopolitical-relevance   { "reevaluate": true }
//   — after a location edit: forgets this firm's "not relevant" geopolitical
//   verdicts first, so items rejected under the old footprint get another look.
//
// Every call also re-derives fund rows from holdings, so calling it with {}
// after a holdings edit is how fund pages catch up.
//
// Or, for cron/admin use:
//   POST /functions/v1/match-geopolitical-relevance   { "firmId": "<uuid>" }
//   Authorization: Bearer <service role key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateImpacts } from '../_shared/impact.ts'
import { handleOptions, json } from '../_shared/cors.ts'
import { companyFootprint, firmFootprint, foreignCountries, hasForeignExposure, type EntityFootprint } from '../_shared/footprint.ts'
import { CANDIDATE_COLUMNS, judgeGeopolitical, type Candidate } from '../_shared/geopoliticalJudge.ts'
import { syncHoldingsRollup } from '../_shared/holdings.ts'
import { geopoliticalSourcesOutside } from '../_shared/regulatorFeeds.ts'
import { buildRelevanceRows, checkRateLimit, loadFirmEntities, requestScheduledRematch, resolveFirmContext, upsertRelevanceRows, type CompanyRow, type FirmRow, type FundRow } from '../_shared/relevance.ts'

const FUNCTION_NAME = 'match-geopolitical-relevance'
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BATCH_SIZE = 40
// How far back each run looks, per query. Same bound as the other matchers.
const CANDIDATE_WINDOW = 200
const DELETE_CHUNK = 100

// Geopolitical items that could touch this firm at all: those naming a
// country the firm is connected to, plus country-less (global) measures
// when anything has a non-U.S. footprint. Two indexed queries rather than
// one OR, so neither needs hand-built PostgREST array literals.
//
// `skipSources`: UK and EU sanctions feeds, for a firm with no connection to
// that region (those measures bind people and businesses there).
async function loadCandidates(admin: SupabaseClient, footprints: EntityFootprint[], skipSources: string[]): Promise<Candidate[]> {
  const countries = foreignCountries(footprints)
  const base = () => {
    const query = admin.from('regulations').select(CANDIDATE_COLUMNS).eq('category', 'geopolitical')
    return (skipSources.length ? query.not('source', 'in', `(${skipSources.join(',')})`) : query).order('published_date', { ascending: false }).limit(CANDIDATE_WINDOW)
  }

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

interface EvaluationResult {
  evaluated: number
  relevantIds: string[]
  candidates: number
}

// Pre-filter, then one AI call over the developments this firm hasn't been
// evaluated against yet. Returns a Response only when the caller is rate
// limited.
async function evaluateNew(
  admin: SupabaseClient,
  firmId: string,
  { firm, funds, companies }: { firm: FirmRow; funds: FundRow[]; companies: CompanyRow[] },
  rateLimitClient: SupabaseClient | null,
): Promise<EvaluationResult | Response> {
  const footprints = [firmFootprint(firm), ...companies.map(companyFootprint)]
  const candidates = await loadCandidates(admin, footprints, geopoliticalSourcesOutside({ firm, funds, companies }))
  if (candidates.length === 0) return { evaluated: 0, relevantIds: [], candidates: 0 }

  const { data: alreadyEvaluated, error: evaluatedError } = await admin
    .from('regulation_relevance')
    .select('regulation_id')
    .eq('firm_id', firmId)
    .in('regulation_id', candidates.map(c => c.id))
  if (evaluatedError) throw evaluatedError

  const evaluatedIds = new Set((alreadyEvaluated ?? []).map(r => r.regulation_id))
  const unevaluated = candidates.filter(c => !evaluatedIds.has(c.id)).slice(0, BATCH_SIZE)
  if (unevaluated.length === 0) return { evaluated: 0, relevantIds: [], candidates: candidates.length }

  // Only checked once there's real work, so a no-op run (the common case
  // on dashboard load) never uses up the caller's allowance.
  if (rateLimitClient) {
    const allowed = await checkRateLimit(rateLimitClient, FUNCTION_NAME, 15, 60)
    if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
  }

  const verdicts = await judgeGeopolitical(admin, { firmId, firmName: firm.name, companies, footprints, candidates: unevaluated, functionName: FUNCTION_NAME })

  const rows = buildRelevanceRows(verdicts, unevaluated, firmId, funds, companies)
  await upsertRelevanceRows(admin, rows)

  const newlyRelevantIds = [...new Set(verdicts.filter(v => v.relevant).map(v => unevaluated[v.index]?.id).filter((id): id is string => !!id))]

  return { evaluated: unevaluated.length, relevantIds: newlyRelevantIds, candidates: candidates.length }
}

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

    if (body?.reevaluate === true) {
      await forgetRejections(admin, firmId)
      // More than one batch may now be waiting: scheduled runs continue it.
      await requestScheduledRematch(admin, firmId)
    }

    const result = await evaluateNew(admin, firmId, { firm, funds, companies }, rateLimitClient)

    // Fund rows follow from holdings + company matches (no AI). Runs on every
    // call, rate limited or not, so a holdings edit is always reflected.
    const fundRowsChanged = await syncHoldingsRollup(admin, firmId, 'geopolitical', { funds, companies })
    if (result instanceof Response) return result

    // New matches get an analysis; ones whose fund rows changed get theirs
    // rewritten so the fund's card appears (or goes).
    const fresh = result.relevantIds
    const refreshed = fundRowsChanged.filter(id => !fresh.includes(id))
    if (fresh.length || refreshed.length) {
      EdgeRuntime.waitUntil(
        Promise.all([
          fresh.length ? generateImpacts(fresh, firmId) : null,
          refreshed.length ? generateImpacts(refreshed, firmId, 8, { force: true }) : null,
        ]),
      )
    }

    return json({ evaluated: result.evaluated, relevant: fresh.length, candidates: result.candidates, fundRowsChanged: fundRowsChanged.length })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
