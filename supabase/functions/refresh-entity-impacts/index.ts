// After a firm/fund/company profile edit, the regulations already matched to
// that entity keep their old AI-written explanation even though the facts it
// was based on just changed — editing a profile fact used to go unnoticed by
// the already-generated analysis ("silently go stale" in the roadmap). This
// force-regenerates the impact analysis for every regulation currently
// linked to the given entity, so the explanation visibly catches up to the
// correction.
//
// Deliberately bounded to what's already matched — this never re-discovers
// new matches and never re-runs the historical regulation backlog (that's a
// much larger, separately-scoped "per-firm scheduled relevance checks"
// problem). A firm/fund/company realistically has a handful of live matches,
// so this stays cheap: one Claude call per matched regulation, capped.
//
//   POST /functions/v1/refresh-entity-impacts
//   { "scope": "firm" | "fund" | "company", "entityId"?: "<fund or company id>" }
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateImpacts } from '../_shared/impact.ts'
import { handleOptions, json } from '../_shared/cors.ts'
import { resolveFirmContext } from '../_shared/relevance.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_REFRESHED = 10

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const ctx = await resolveFirmContext(req, admin)
    if (ctx instanceof Response) return ctx
    const { firmId } = ctx

    const body = await req.json().catch(() => ({}))
    const scope = body.scope as 'firm' | 'fund' | 'company' | undefined
    const entityId = body.entityId as string | undefined
    if (scope !== 'firm' && scope !== 'fund' && scope !== 'company') return json({ error: 'scope must be firm, fund, or company' }, 400)
    if ((scope === 'fund' || scope === 'company') && !entityId) return json({ error: 'entityId is required for fund/company scope' }, 400)

    let query = admin.from('regulation_relevance').select('regulation_id, relevance_reason').eq('firm_id', firmId).is('dismissed_at', null)
    query = scope === 'firm' ? query.is('fund_id', null).is('portfolio_company_id', null) : scope === 'fund' ? query.eq('fund_id', entityId!) : query.eq('portfolio_company_id', entityId!)

    const { data, error } = await query
    if (error) throw error

    const regulationIds = (data ?? [])
      .filter(r => !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
      .map(r => r.regulation_id)

    if (regulationIds.length === 0) return json({ queued: 0 })

    EdgeRuntime.waitUntil(generateImpacts(admin, regulationIds, firmId, MAX_REFRESHED, { force: true }))

    return json({ queued: Math.min(regulationIds.length, MAX_REFRESHED) })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
