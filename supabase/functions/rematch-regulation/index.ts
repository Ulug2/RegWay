// Re-evaluates one regulation against a firm on demand — the "flag an
// incorrect match ... have the explanation update" loop from the product
// doc. Reuses match-relevance's exact verdict prompt and shared plumbing,
// scoped to a single regulation instead of a batch, against whatever the
// firm's profile says *right now* (so a correction to a profile fact is
// reflected immediately, not just on the next scheduled sweep). An optional
// user-supplied note about what's wrong is folded into the prompt so a
// correction can actually change the verdict, not just re-confirm it.
//
// Regulatory category only for now — enforcement matching uses a
// deliberately different prompt (allegation-vs-finding framing, see
// match-enforcement-relevance) that a single shared re-match path would
// blur; re-matching a disputed enforcement item is a smaller, rarer case
// left for later.
//
//   POST /functions/v1/rematch-regulation
//   { "regulationId": "<uuid>", "note"?: "what's wrong with this match" }
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateImpact } from '../_shared/impact.ts'
import { handleOptions, json } from '../_shared/cors.ts'
import { resolveFirmContext, loadFirmEntities, describe, checkRateLimit, buildRelevanceRows, upsertRelevanceRows, type Verdict } from '../_shared/relevance.ts'
import { recordUsage } from '../_shared/usage.ts'

const MODEL = 'claude-sonnet-4-5'

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

    if (rateLimitClient) {
      const allowed = await checkRateLimit(rateLimitClient, 'rematch-regulation', 20, 60)
      if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
    }

    const { data: reg } = await admin.from('regulations').select('id, title, agency, jurisdiction, summary, category').eq('id', regulationId).single()
    if (!reg) return json({ error: 'Regulation not found' }, 404)
    if (reg.category !== 'regulatory') return json({ error: 'Re-matching is only supported for regulatory items right now.' }, 400)

    const { firm, funds, companies } = await loadFirmEntities(admin, firmId)
    if (!firm) return json({ error: 'Firm not found' }, 404)

    const firmProfile = describe(firm.profile, [
      ['firm_type', 'firm type'],
      ['adviser_registration', 'adviser registration'],
      ['strategies', 'strategies'],
      ['industries', 'industries'],
      ['geographies', 'geographies'],
    ])
    const fundDetail = (profile: Record<string, unknown> | null) =>
      describe(profile, [
        ['status', 'status'],
        ['strategy', 'strategy'],
        ['ownership', 'ownership'],
        ['priority_areas', 'priority areas'],
        ['proposed_regs', 'proposed-rule preference'],
      ])
    const fundList = (funds ?? []).map(f => `- ${f.name} (${f.structure ?? 'structure n/a'}, jurisdictions: ${(f.jurisdictions ?? []).join('/')}${fundDetail(f.profile) ? '; ' + fundDetail(f.profile) : ''})`).join('\n') || 'none on file'
    const companyList = (companies ?? []).map(c => `- ${c.name} (sectors: ${(c.sectors ?? []).join('/')}, regions: ${(c.regions ?? []).join('/')}${c.offerings ? `; does: ${c.offerings}` : ''})`).join('\n') || 'none on file'

    const correction = note
      ? `\n\nA user has flagged the previous verdict for this regulation as possibly incorrect and provided this correction: "${note}". Weigh it against the firm/fund/company facts above — if it changes your assessment, say so in your reason; if the stated correction doesn't actually change whether this regulation applies, explain why not.`
      : '\n\nA user has flagged the previous verdict for this regulation as possibly incorrect, with no further detail. Re-assess carefully against the firm/fund/company facts above.'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tool_choice: { type: 'tool', name: 'submit_verdicts' },
        tools: [
          {
            name: 'submit_verdicts',
            description: 'Submit a relevance verdict for the regulation.',
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
                      reason: { type: 'string', description: 'One or two sentences: why this does or does not affect the firm, addressing the flagged concern directly' },
                      scope: { type: 'string', enum: ['firm', 'fund', 'company'] },
                      entity_name: { type: 'string', description: 'Exact fund or company name if scope is fund/company, else empty string' },
                    },
                    required: ['index', 'relevant', 'reason', 'scope'],
                  },
                },
              },
              required: ['verdicts'],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Firm: ${firm.name}, headquartered in ${firm.hq_location ?? 'unknown'}, operating in: ${(firm.jurisdictions ?? []).join(', ') || 'unspecified'}.${firmProfile ? `
Firm profile — ${firmProfile}.` : ''}

Funds:
${fundList}

Portfolio companies:
${companyList}

Decide whether this regulation creates a real compliance obligation or material exposure for this specific firm, one of its funds, or one of its portfolio companies — based on jurisdiction, sector, and structure match. Be strict: a generic federal rule that doesn't actually touch this firm's jurisdictions, fund structures, or portfolio sectors should be marked not relevant. Mark relevant only when you can name the specific new obligation, deadline, or requirement being created, and the specific fund, portfolio company, or jurisdiction it actually touches.${correction}

0. [${reg.agency ?? reg.jurisdiction}] ${reg.title} — ${reg.summary ?? 'no summary'}`,
          },
        ],
      }),
    })

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
    const result = await res.json()
    const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    const verdicts: Verdict[] = toolUse?.input?.verdicts ?? []
    const verdict = verdicts[0]
    if (!verdict) throw new Error('Model returned no verdict')

    await recordUsage(admin, {
      functionName: 'rematch-regulation',
      firmId,
      model: MODEL,
      inputTokens: result.usage?.input_tokens,
      cacheCreationInputTokens: result.usage?.cache_creation_input_tokens,
      cacheReadInputTokens: result.usage?.cache_read_input_tokens,
      outputTokens: result.usage?.output_tokens,
    })

    const rows = buildRelevanceRows([verdict], [reg], firmId, funds, companies)
    await upsertRelevanceRows(admin, rows)

    if (verdict.relevant) {
      await generateImpact(admin, regulationId, firmId, { force: true }).catch(err => console.error('impact regeneration failed', regulationId, (err as Error).message))
    }

    return json({ relevant: verdict.relevant, reason: verdict.reason })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
