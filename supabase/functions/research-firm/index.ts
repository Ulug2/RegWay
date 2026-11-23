// Researches a firm on the web after onboarding (roadmap item 18): what the
// firm, its funds and its portfolio companies are, from public pages, as
// proposals the firm confirms or rejects (migration 0039). A proposal is
// never written into the profile here: confirming one in Profile does that,
// with the link as its provenance. Until then only the chat sees it,
// labelled unconfirmed (regway-ai-chat/prompt.ts).
//
// Answers at once with the run's id; the research (about a minute) runs in
// the background, so it never holds up the first dashboard.
//
//   POST /functions/v1/research-firm   {}
//   Authorization: Bearer <user session access_token>   — the caller's own firm
//
// Or, run by the owner for a firm:
//   POST /functions/v1/research-firm   { "firmId": "<uuid>" }
//   Authorization: Bearer <service key>

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { AI_FAILURE_MESSAGES, aiFailure } from '../_shared/ai/client.ts'
import { handleOptions, json } from '../_shared/cors.ts'
import { checkRateLimit, resolveFirmContext } from '../_shared/relevance.ts'
import { research, type ResearchInput } from './research.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const FUNCTION_NAME = 'research-firm'
// Each run costs a web search session; a user can ask again, not often.
const RUNS_PER_DAY = 3
// A run still marked running after this long has died; another may start.
const STALE_RUN_MS = 10 * 60_000

async function loadFirm(admin: SupabaseClient, firmId: string): Promise<ResearchInput | null> {
  const [{ data: firm }, { data: funds }, { data: companies }] = await Promise.all([
    admin.from('firms').select('*').eq('id', firmId).single(),
    admin.from('funds').select('*').eq('firm_id', firmId).order('name'),
    admin.from('portfolio_companies').select('*').eq('firm_id', firmId).order('name'),
  ])
  if (!firm) return null
  return { firm, funds: funds ?? [], companies: companies ?? [] } as ResearchInput
}

async function run(admin: SupabaseClient, firmId: string, runId: string, input: ResearchInput): Promise<void> {
  const finish = (fields: Record<string, unknown>) =>
    admin.from('firm_research_runs').update({ ...fields, finished_at: new Date().toISOString() }).eq('id', runId)
  try {
    const result = await research(input, step => ({ admin, functionName: `${FUNCTION_NAME}:${step}`, firmId }))
    if (!result.confident) {
      await finish({ status: 'unsure', note: result.note })
      return
    }
    // What an earlier run proposed and no one decided gives way to this
    // one. Facts a member said (origin chat or recheck) are not research's
    // to replace.
    await admin.from('firm_findings').update({ status: 'superseded' }).eq('firm_id', firmId).eq('status', 'pending').eq('origin', 'web')
    if (result.findings.length) {
      const { error } = await admin.from('firm_findings').insert(result.findings.map(f => ({ ...f, firm_id: firmId, run_id: runId })))
      if (error) throw error
    }
    await finish({ status: 'done', found: result.findings.length })
  } catch (err) {
    console.error('firm research failed', (err as Error).message)
    const failure = aiFailure(err)
    await finish({ status: 'failed', note: failure ? AI_FAILURE_MESSAGES[failure] : 'The research could not be completed.' })
  }
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const ctx = await resolveFirmContext(req, admin)
    if (ctx instanceof Response) return ctx
    const { firmId } = ctx

    // One run at a time: a second request while one runs gets that one.
    const { data: latest } = await admin.from('firm_research_runs').select('id, status, started_at').eq('firm_id', firmId).order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (latest?.status === 'running' && Date.now() - Date.parse(latest.started_at) < STALE_RUN_MS) return json({ runId: latest.id, status: 'running' })

    if (ctx.rateLimitClient && !(await checkRateLimit(ctx.rateLimitClient, FUNCTION_NAME, RUNS_PER_DAY, 24 * 60))) {
      return json({ error: 'Research can run 3 times a day. Please try again tomorrow.' }, 429)
    }

    const input = await loadFirm(admin, firmId)
    if (!input) return json({ error: 'Firm not found' }, 404)

    const { data: started, error } = await admin.from('firm_research_runs').insert({ firm_id: firmId }).select('id').single()
    if (error || !started) throw error ?? new Error('Could not start the research')

    EdgeRuntime.waitUntil(run(admin, firmId, started.id, input))
    return json({ runId: started.id, status: 'running' }, 202)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
