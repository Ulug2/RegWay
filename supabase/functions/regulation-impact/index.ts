// On-demand path for the detailed impact analysis: the detail view calls this
// when a regulation has no stored analysis yet (background generation usually
// has it ready). Returns the analysis and stores it.
//
//   POST /functions/v1/regulation-impact   { "regulationId": "<uuid>", "force"?: true }
//   Authorization: Bearer <user session access_token>
//
// Also the background path (`generateImpacts`): called with the service key
// and a firmId, it accepts the job (202) and generates in the background, so
// each analysis gets its own invocation and wall-clock budget.
//
//   POST /functions/v1/regulation-impact   { "regulationId", "firmId", "force"? }
//   Authorization: Bearer <service key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { generateImpact } from '../_shared/impact.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

// When another invocation is already writing the analysis (a matcher's
// background job, another user, another tab), the user's request waits for
// it rather than paying for a second one. An analysis takes 30-70 s.
const WAIT_MS = 90_000
const POLL_MS = 3_000

async function waitForImpact(admin: SupabaseClient, regulationId: string, firmId: string): Promise<unknown | null> {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
    const { data } = await admin.from('regulation_impacts').select('content').eq('regulation_id', regulationId).eq('firm_id', firmId).maybeSingle()
    if (data?.content) return data.content
  }
  return null
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { regulationId, force, firmId } = await req.json()
    if (!regulationId) return json({ error: 'regulationId is required' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (authHeader.replace(/^Bearer\s+/i, '') === serviceKey) {
      if (!firmId) return json({ error: 'firmId is required' }, 400)
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
      EdgeRuntime.waitUntil(
        generateImpact(admin, regulationId, firmId, { force: !!force }).catch(err => console.error('impact generation failed', regulationId, (err as Error).message)),
      )
      return json({ queued: true }, 202)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const { data: membership } = await supabase.from('firm_members').select('firm_id').eq('user_id', user.id).single()
    if (!membership) return json({ error: 'No firm associated with this user' }, 404)

    // Only regulations already linked to this firm can be analysed.
    const { data: link } = await supabase
      .from('regulation_relevance')
      .select('id')
      .eq('regulation_id', regulationId)
      .eq('firm_id', membership.firm_id)
      .limit(1)
      .maybeSingle()
    if (!link) return json({ error: 'Regulation not found for this firm' }, 404)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

    // Only a fresh generation is billable, so only that counts against the limit.
    const { data: existing } = await admin
      .from('regulation_impacts')
      .select('id')
      .eq('regulation_id', regulationId)
      .eq('firm_id', membership.firm_id)
      .maybeSingle()

    if (!existing || force) {
      const { data: allowed } = await supabase.rpc('check_rate_limit', {
        p_function_name: 'regulation-impact',
        p_limit: 30,
        p_window_minutes: 60,
      })
      if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
    }

    const status = await generateImpact(admin, regulationId, membership.firm_id, { force: !!force })
    if (status === 'in_progress') {
      const content = await waitForImpact(admin, regulationId, membership.firm_id)
      if (!content) return json({ error: 'The analysis is still being written. Try again in a minute.' }, 503)
      return json({ status: 'exists', content })
    }
    const { data: impact } = await admin
      .from('regulation_impacts')
      .select('content')
      .eq('regulation_id', regulationId)
      .eq('firm_id', membership.firm_id)
      .maybeSingle()

    // `awaiting_publication`: a public-inspection document whose text can't
    // be read yet; content is null and the panel says so.
    return json({ status, content: impact?.content ?? null })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
