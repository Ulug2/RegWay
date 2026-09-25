// Powers the RegWay AI copilot drawer. Loads the caller's firm/fund/
// portfolio-company context from the DB, asks Claude (with the web_search
// tool) to answer grounded in live regulatory sources, and persists the
// exchange to `harvey_messages` for conversation history.
//
//   POST /functions/v1/harvey-chat   { "message": "..." }
//   Authorization: Bearer <user session access_token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'

const MODEL = 'claude-sonnet-4-5'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { message } = await req.json()
    if (!message) return json({ error: 'message is required' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const { data: membership } = await supabase
      .from('firm_members')
      .select('firm_id, firms(name, hq_location, jurisdictions)')
      .eq('user_id', user.id)
      .single()

    if (!membership) return json({ error: 'No firm associated with this user' }, 404)

    const firm = (membership as unknown as { firms: { name: string; hq_location: string; jurisdictions: string[] } }).firms

    const [{ data: funds }, { data: companies }] = await Promise.all([
      supabase.from('funds').select('name, size, structure, jurisdictions').eq('firm_id', membership.firm_id),
      supabase.from('portfolio_companies').select('name, sectors, regions').eq('firm_id', membership.firm_id),
    ])

    const fundSummary =
      (funds ?? []).map(f => `${f.name} (${f.size ?? 'size n/a'}, ${f.structure ?? 'structure n/a'}, ${(f.jurisdictions ?? []).join('/')})`).join('; ') ||
      'none on file'
    const companySummary =
      (companies ?? []).map(c => `${c.name} (${(c.sectors ?? []).join('/')}, ${(c.regions ?? []).join('/')})`).join('; ') || 'none on file'

    const systemPrompt = `You are RegWay AI, an AI regulatory intelligence copilot for private equity general partners. You are advising ${firm?.name ?? 'the firm'}, headquartered in ${firm?.hq_location ?? 'an unspecified location'}, operating in: ${(firm?.jurisdictions ?? []).join(', ') || 'unspecified jurisdictions'}.

Active funds: ${fundSummary}.
Portfolio companies: ${companySummary}.

Use web search to ground every regulatory claim in a real, current source. Always cite the primary source (agency or publisher name, document title, URL, and date). If you are not confident a rule applies to this firm, say so plainly instead of guessing. Never assign an unprompted urgency label such as "critical" or "low impact" — describe obligations and deadlines factually and let the user judge priority themselves.`

    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_function_name: 'harvey-chat',
      p_limit: 30,
      p_window_minutes: 60,
    })
    if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1536,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: message }],
      }),
    })

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
    const result = await res.json()

    const textBlocks = (result.content ?? []).filter((b: { type: string }) => b.type === 'text')
    const content = textBlocks.map((b: { text: string }) => b.text).join('\n')
    const citations = textBlocks.flatMap((b: { citations?: unknown[] }) => b.citations ?? [])

    await supabase.from('harvey_messages').insert([
      { firm_id: membership.firm_id, user_id: user.id, role: 'user', content: message },
      { firm_id: membership.firm_id, user_id: user.id, role: 'assistant', content, citations },
    ])

    return json({ content, citations })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
