// Closes the gap between "regulations we've fetched" and "regulations this
// firm should actually see." The dashboard must only ever read through
// `regulation_relevance` — never straight from `regulations` — so nothing
// reaches a user unless this function (or company-regulations, for the
// per-company on-demand path) has confirmed it applies to them.
//
// Run this per firm after sync-federal-register brings in new items, and
// once right after onboarding so a new firm isn't staring at an empty
// dashboard. Cheap to re-run: it only evaluates regulations that don't yet
// have a relevance row (or a "not relevant" marker — see NOT_RELEVANT below)
// for this firm.
//
//   POST /functions/v1/match-relevance   {}
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm
//
// Or, for cron/admin use across all firms:
//   POST /functions/v1/match-relevance   { "firmId": "<uuid>" }
//   Authorization: Bearer <service role key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateImpacts } from '../_shared/impact.ts'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { resolveFirmContext, loadFirmEntities, checkRateLimit, buildRelevanceRows, upsertRelevanceRows, forgetRejections, requestScheduledRematch } from '../_shared/relevance.ts'
import { judgeRegulations } from '../_shared/regulatoryJudge.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BATCH_SIZE = 40

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // `{ reevaluate: true }`: re-check recent rejections after a profile edit.
    const body = await req.clone().json().catch(() => ({}))
    const ctx = await resolveFirmContext(req, admin)
    if (ctx instanceof Response) return ctx
    const { firmId, rateLimitClient } = ctx

    const { firm, funds, companies } = await loadFirmEntities(admin, firmId)
    if (!firm) return json({ error: 'Firm not found' }, 404)

    // Regulations not yet evaluated for this firm (no relevance row of any
    // kind — including the "not relevant" marker rows, see below).
    // Regulatory category only: the Federal Register also carries sanctions,
    // export-control and trade documents, which match-geopolitical-relevance
    // evaluates by location instead.
    const { data: candidates } = await admin
      .from('regulations')
      .select('id, title, agency, jurisdiction, summary')
      .eq('source', 'federal_register')
      .eq('category', 'regulatory')
      .order('published_date', { ascending: false })
      .limit(200)

    if (!candidates || candidates.length === 0) return json({ evaluated: 0, relevant: 0 })

    // After an edit to a fact this matcher uses: judge the recent items it
    // had rejected again (this window only), first batch now, the rest on
    // the next scheduled runs.
    if (body?.reevaluate === true) {
      await forgetRejections(admin, firmId, candidates.map(c => c.id))
      await requestScheduledRematch(admin, firmId)
    }

    const { data: alreadyEvaluated } = await admin
      .from('regulation_relevance')
      .select('regulation_id')
      .eq('firm_id', firmId)
      .in('regulation_id', candidates.map(c => c.id))

    const evaluatedIds = new Set((alreadyEvaluated ?? []).map(r => r.regulation_id))
    const unevaluated = candidates.filter(c => !evaluatedIds.has(c.id)).slice(0, BATCH_SIZE)

    if (unevaluated.length === 0) return json({ evaluated: 0, relevant: 0 })

    if (rateLimitClient) {
      const allowed = await checkRateLimit(rateLimitClient, 'match-relevance', 15, 60)
      if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
    }

    const verdicts = await judgeRegulations(admin, { firmId, entities: { firm, funds, companies }, candidates: unevaluated, functionName: 'match-relevance' })

    const rows = buildRelevanceRows(verdicts, unevaluated, firmId, funds, companies)
    await upsertRelevanceRows(admin, rows)

    const relevantCount = verdicts.filter(v => v.relevant).length

    // Prepare the detailed impact analysis for newly relevant regulations in
    // the background so it's ready before anyone opens them.
    const newlyRelevantIds = [...new Set(verdicts.filter(v => v.relevant).map(v => unevaluated[v.index]?.id).filter((id): id is string => !!id))]
    if (newlyRelevantIds.length > 0) EdgeRuntime.waitUntil(generateImpacts(newlyRelevantIds, firmId))

    return json({ evaluated: rows.length, relevant: relevantCount })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
