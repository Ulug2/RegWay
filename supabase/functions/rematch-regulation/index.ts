// Re-evaluates one regulation against a firm on demand — the "flag an
// incorrect match ... have the explanation update" loop from the product
// doc. Judged against whatever the firm's profile says *right now* (so a
// correction to a profile fact is reflected immediately, not just on the
// next scheduled sweep), with an optional user note about what's wrong
// folded into the prompt so a correction can actually change the verdict.
//
// Each category is re-judged by its own matcher's rules:
// - regulatory: _shared/regulatoryJudge.ts, the exact prompt
//   match-relevance uses, with the user's note appended;
// - geopolitical: _shared/geopoliticalJudge.ts, the exact prompt
//   match-geopolitical-relevance uses, after which fund rows are re-derived
//   from holdings (_shared/holdings.ts).
// Enforcement is still refused: its allegation-vs-finding framing (see
// match-enforcement-relevance) would need its own re-check path.
//
// The re-check replaces the firm's verdicts on the regulation (every entity,
// not just the first), so a match it no longer supports leaves that
// entity's page. Dismissals are kept.
//
//   POST /functions/v1/rematch-regulation
//   { "regulationId": "<uuid>", "note"?: "what's wrong with this match" }
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateImpact } from '../_shared/impact.ts'
import { handleOptions, json } from '../_shared/cors.ts'
import { companyFootprint, firmFootprint } from '../_shared/footprint.ts'
import { CANDIDATE_COLUMNS, judgeGeopolitical, type Candidate } from '../_shared/geopoliticalJudge.ts'
import { syncHoldingsRollup } from '../_shared/holdings.ts'
import {
  resolveFirmContext,
  loadFirmEntities,
  checkRateLimit,
  buildRelevanceRows,
  replaceRegulationVerdicts,
} from '../_shared/relevance.ts'
import { judgeRegulations } from '../_shared/regulatoryJudge.ts'
import { applySkeptic } from '../_shared/verdictReview.ts'

const FUNCTION_NAME = 'rematch-regulation'

interface RegulationRow extends Candidate {
  category: string
  jurisdiction: string | null
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const ctx = await resolveFirmContext(req, admin)
    if (ctx instanceof Response) return ctx
    const { firmId, rateLimitClient } = ctx

    const body = await req.json().catch(() => ({}))
    const regulationId = body.regulationId as string | undefined
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
    if (!regulationId) return json({ error: 'regulationId is required' }, 400)

    const { data: reg } = await admin.from('regulations').select(`${CANDIDATE_COLUMNS}, category, jurisdiction`).eq('id', regulationId).single<RegulationRow>()
    if (!reg) return json({ error: 'Regulation not found' }, 404)
    if (reg.category !== 'regulatory' && reg.category !== 'geopolitical') {
      return json({ error: 'Re-checking is not available for enforcement items yet.' }, 400)
    }

    if (rateLimitClient) {
      const allowed = await checkRateLimit(rateLimitClient, FUNCTION_NAME, 20, 60)
      if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
    }

    const { firm, funds, companies } = await loadFirmEntities(admin, firmId)
    if (!firm) return json({ error: 'Firm not found' }, 404)

    const judged =
      reg.category === 'geopolitical'
        ? await judgeGeopolitical(admin, {
            firmId,
            firmName: firm.name,
            companies,
            footprints: [firmFootprint(firm), ...companies.map(companyFootprint)],
            candidates: [reg],
            functionName: FUNCTION_NAME,
            correction: note || null,
          })
        : await judgeRegulations(admin, { firmId, entities: { firm, funds, companies }, candidates: [reg], functionName: FUNCTION_NAME, correction: note || null }).then(v =>
            // No verdict at all still records the re-check, as "not relevant".
            v.length ? v : [{ index: 0, relevant: false, reason: 'No verdict returned for this regulation.', scope: 'firm' as const, entity_name: null }],
          )
    // The re-check's verdict goes through the same second pass as a new match.
    const verdicts = await applySkeptic(admin, { firmId, category: reg.category as 'regulatory' | 'geopolitical', entities: { firm, funds, companies }, candidates: [reg], verdicts: judged, functionName: FUNCTION_NAME })

    await replaceRegulationVerdicts(admin, firmId, regulationId, buildRelevanceRows(verdicts, [reg], firmId, funds, companies))
    if (reg.category === 'geopolitical') await syncHoldingsRollup(admin, firmId, 'geopolitical', { funds, companies })

    const relevant = verdicts.some(v => v.relevant)
    if (relevant) {
      await generateImpact(admin, regulationId, firmId, { force: true }).catch(err => console.error('impact regeneration failed', regulationId, (err as Error).message))
    }

    // Relevant verdicts first; one line per entity the re-check judged.
    const perEntity = [...verdicts]
      .sort((a, b) => Number(b.relevant) - Number(a.relevant))
      .map(v => ({ entity: v.scope === 'firm' || !v.entity_name ? firm.name : v.entity_name, relevant: v.relevant, reason: v.reason }))
    return json({ relevant, reason: perEntity[0].reason, verdicts: perEntity })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
