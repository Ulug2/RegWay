// Powers the RegWay AI copilot drawer. Loads the caller's firm/fund/
// portfolio-company context from the DB, asks Claude (with the web_search
// tool) to answer grounded in live regulatory sources, and persists the
// exchange to `regway_ai_messages` for conversation history.
//
// Streams the response back as raw Anthropic SSE (text/event-stream) so the
// frontend can render text as it arrives instead of waiting for the full
// reply. The full exchange is still saved to `regway_ai_messages` once the
// stream ends — this function tees the upstream bytes: forwarded to the
// client unchanged, and parsed in parallel just to accumulate the final
// text/citations/usage for that one DB write.
//
// The system prompt and the web_search tool definition are marked
// cache_control: ephemeral — both are identical across every message in a
// session (same firm/fund/company context, same tool), so repeat messages
// within the 5-minute cache window get that portion of input billed at a
// fraction of normal price instead of re-sent-and-rebilled from scratch.
//
//   POST /functions/v1/regway-ai-chat   { "message": "...", "attachment"?: { "name": string, "mimeType": string, "content": string (text) | "base64Data": string (pdf) } }
//   Authorization: Bearer <user session access_token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { mergeUsage, recordUsage, type UsageTotals } from '../_shared/usage.ts'

const MODEL = 'claude-sonnet-4-5'

interface Attachment {
  name: string
  mimeType: string
  content?: string // already-decoded text (.txt/.md)
  base64Data?: string // raw base64 (.pdf)
}

// Mirrors src/lib/types.ts's AiContext — set when the copilot was opened
// from a specific regulation/fund/company page instead of the generic
// Dashboard bar, so the system prompt can focus on that item without the
// user having to restate what they're asking about.
interface AiContext {
  type: 'regulation' | 'fund' | 'company'
  id: string
  name: string
  regulation?: {
    agency?: string | null
    jurisdiction?: string | null
    summary?: string | null
    published_date?: string | null
    effective_date?: string | null
  }
}

function contextInstruction(context?: AiContext): string {
  if (!context) return ''
  if (context.type === 'regulation') {
    const r = context.regulation
    const details = [
      r?.agency ? `agency: ${r.agency}` : '',
      r?.jurisdiction ? `jurisdiction: ${r.jurisdiction}` : '',
      r?.published_date ? `published: ${r.published_date}` : '',
      r?.effective_date ? `effective: ${r.effective_date}` : '',
    ].filter(Boolean).join(', ')
    const summary = r?.summary ? ` Summary: ${r.summary}` : ''
    return `\n\nThe user opened this chat directly from the regulation "${context.name}"${details ? ` (${details})` : ''}.${summary} Treat the conversation as being about this regulation unless the user clearly asks about something else — don't make them restate what they're asking about.`
  }
  const label = context.type === 'fund' ? 'fund' : 'portfolio company'
  return `\n\nThe user opened this chat directly from the ${label} "${context.name}". Treat the conversation as being about this specific ${label} unless the user clearly asks about something else — don't make them restate what they're asking about.`
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { message, attachment, context } = (await req.json()) as { message?: string; attachment?: Attachment; context?: AiContext }
    if (!message) return json({ error: 'message is required' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    // usage_events has no RLS policies for authenticated users (internal
    // cost telemetry, not firm-scoped data) — needs the service role.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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

    const ambiguityInstruction =
      !context && ((funds?.length ?? 0) > 1 || (companies?.length ?? 0) > 1)
        ? '\n\nIf the user refers to "my fund", "this company", "the portfolio company", or similar without naming which one, and more than one exists, ask them which one they mean instead of guessing.'
        : ''

    const systemPrompt = `You are RegWay AI, an AI regulatory intelligence copilot for private equity general partners. You are advising ${firm?.name ?? 'the firm'}, headquartered in ${firm?.hq_location ?? 'an unspecified location'}, operating in: ${(firm?.jurisdictions ?? []).join(', ') || 'unspecified jurisdictions'}.

Active funds: ${fundSummary}.
Portfolio companies: ${companySummary}.

Use web search to ground every regulatory claim in a real, current source. Always cite the primary source (agency or publisher name, document title, URL, and date). If you are not confident a rule applies to this firm, say so plainly instead of guessing. Never assign an unprompted urgency label such as "critical" or "low impact" — describe obligations and deadlines factually and let the user judge priority themselves.${contextInstruction(context)}${ambiguityInstruction}`

    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_function_name: 'regway-ai-chat',
      p_limit: 30,
      p_window_minutes: 60,
    })
    if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)

    // Text attachments (.txt/.md) are inlined into the message; a .pdf is
    // sent as a native Anthropic `document` content block — no separate
    // parsing needed. Not persisted anywhere; scoped to this one turn.
    const userContent: unknown[] = []
    if (attachment?.base64Data) {
      userContent.push({ type: 'document', source: { type: 'base64', media_type: attachment.mimeType || 'application/pdf', data: attachment.base64Data } })
    }
    const textWithAttachment = attachment?.content ? `${message}\n\n--- Attached file: ${attachment.name} ---\n${attachment.content}` : message
    userContent.push({ type: 'text', text: textWithAttachment })

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        stream: true,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!anthropicRes.ok || !anthropicRes.body) {
      throw new Error(`Anthropic API error: ${anthropicRes.status} ${await anthropicRes.text()}`)
    }

    const decoder = new TextDecoder()
    let sseBuffer = ''
    let fullText = ''
    const citations: unknown[] = []
    const usage: UsageTotals = {}
    let persisted = false

    const persist = async () => {
      if (persisted) return
      persisted = true
      await Promise.all([
        supabase.from('regway_ai_messages').insert([
          { firm_id: membership.firm_id, user_id: user.id, role: 'user', content: message },
          { firm_id: membership.firm_id, user_id: user.id, role: 'assistant', content: fullText, citations },
        ]),
        recordUsage(admin, { functionName: 'regway-ai-chat', firmId: membership.firm_id, model: MODEL, ...usage }),
      ])
    }

    const tee = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // Forward bytes to the client immediately and unchanged — parsing
        // below is only to accumulate the final record for regway_ai_messages
        // and usage_events.
        controller.enqueue(chunk)
        sseBuffer += decoder.decode(chunk, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              fullText += evt.delta.text
            } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'citations_delta' && evt.delta.citation) {
              citations.push(evt.delta.citation)
            } else if (evt.type === 'message_start') {
              mergeUsage(usage, evt.message?.usage)
            } else if (evt.type === 'message_delta') {
              mergeUsage(usage, evt.usage)
            }
          } catch {
            // Partial line (split across chunks) or a non-JSON SSE comment — skip.
          }
        }
      },
      async flush() {
        await persist()
      },
    })

    return new Response(anthropicRes.body.pipeThrough(tee), {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
