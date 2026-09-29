// On-demand path for the detailed impact analysis: the detail view calls this
// when a regulation has no stored analysis yet (background generation usually
// has it ready). Returns the analysis and stores it.
//
//   POST /functions/v1/regulation-impact   { "regulationId": "<uuid>", "force"?: true }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { generateImpact } from '../_shared/impact.ts'

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { regulationId, force } = await req.json()
    if (!regulationId) return json({ error: 'regulationId is required' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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
    const { data: impact } = await admin
      .from('regulation_impacts')
      .select('content')
      .eq('regulation_id', regulationId)
      .eq('firm_id', membership.firm_id)
      .single()

    return json({ status, content: impact?.content })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
