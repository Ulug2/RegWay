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
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'

const MODEL = 'claude-sonnet-4-5'
const BATCH_SIZE = 40

interface Verdict {
  index: number
  relevant: boolean
  reason: string
  scope: 'firm' | 'fund' | 'company'
  entity_name: string | null
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let firmId: string
    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      // Trusted admin/cron path: caller presented the service role key, so a
      // client-supplied firmId is safe to use as-is.
      const body = await req.json()
      if (!body.firmId) return json({ error: 'firmId is required' }, 400)
      firmId = body.firmId
    } else {
      // Ordinary user session: never trust a client-supplied firmId — derive
      // it from the caller's own membership so a user can only ever trigger
      // matching for their own firm.
      const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
      } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Not authenticated' }, 401)

      const { data: membership } = await admin.from('firm_members').select('firm_id').eq('user_id', user.id).single()
      if (!membership) return json({ error: 'No firm associated with this user' }, 404)
      firmId = membership.firm_id
    }

    const [{ data: firm }, { data: funds }, { data: companies }] = await Promise.all([
      admin.from('firms').select('name, hq_location, jurisdictions').eq('id', firmId).single(),
      admin.from('funds').select('id, name, structure, jurisdictions').eq('firm_id', firmId),
      admin.from('portfolio_companies').select('id, name, sectors, regions').eq('firm_id', firmId),
    ])

    if (!firm) return json({ error: 'Firm not found' }, 404)

    // Regulations not yet evaluated for this firm (no relevance row of any
    // kind — including the "not relevant" marker rows, see below).
    const { data: candidates } = await admin
      .from('regulations')
      .select('id, title, agency, jurisdiction, summary')
      .eq('source', 'federal_register')
      .order('published_date', { ascending: false })
      .limit(200)

    if (!candidates || candidates.length === 0) return json({ evaluated: 0, relevant: 0 })

    const { data: alreadyEvaluated } = await admin
      .from('regulation_relevance')
      .select('regulation_id')
      .eq('firm_id', firmId)
      .in('regulation_id', candidates.map(c => c.id))

    const evaluatedIds = new Set((alreadyEvaluated ?? []).map(r => r.regulation_id))
    const unevaluated = candidates.filter(c => !evaluatedIds.has(c.id)).slice(0, BATCH_SIZE)

    if (unevaluated.length === 0) return json({ evaluated: 0, relevant: 0 })

    const fundList = (funds ?? []).map(f => `- ${f.name} (${f.structure ?? 'structure n/a'}, jurisdictions: ${(f.jurisdictions ?? []).join('/')})`).join('\n') || 'none on file'
    const companyList =
      (companies ?? []).map(c => `- ${c.name} (sectors: ${(c.sectors ?? []).join('/')}, regions: ${(c.regions ?? []).join('/')})`).join('\n') || 'none on file'
    const regList = unevaluated.map((r, i) => `${i}. [${r.agency ?? r.jurisdiction}] ${r.title} — ${r.summary ?? 'no summary'}`).join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        tool_choice: { type: 'tool', name: 'submit_verdicts' },
        tools: [
          {
            name: 'submit_verdicts',
            description: 'Submit a relevance verdict for every numbered regulation.',
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
                      reason: { type: 'string', description: 'One sentence: why this does or does not affect the firm' },
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
            content: `Firm: ${firm.name}, headquartered in ${firm.hq_location ?? 'unknown'}, operating in: ${(firm.jurisdictions ?? []).join(', ') || 'unspecified'}.

Funds:
${fundList}

Portfolio companies:
${companyList}

For each numbered regulation below, decide whether it creates a real compliance obligation or material exposure for this specific firm, one of its funds, or one of its portfolio companies — based on jurisdiction, sector, and structure match. Be strict: a generic federal rule that doesn't actually touch this firm's jurisdictions, fund structures, or portfolio sectors should be marked not relevant. Mark relevant only when there's a genuine, explainable connection.

${regList}`,
          },
        ],
      }),
    })

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
    const result = await res.json()
    const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    const verdicts: Verdict[] = toolUse?.input?.verdicts ?? []

    const fundByName = new Map((funds ?? []).map(f => [f.name.toLowerCase(), f.id]))
    const companyByName = new Map((companies ?? []).map(c => [c.name.toLowerCase(), c.id]))

    const rows = verdicts.map(v => {
      const reg = unevaluated[v.index]
      if (!reg) return null
      const fundId = v.scope === 'fund' && v.entity_name ? fundByName.get(v.entity_name.toLowerCase()) ?? null : null
      const companyId = v.scope === 'company' && v.entity_name ? companyByName.get(v.entity_name.toLowerCase()) ?? null : null
      return {
        regulation_id: reg.id,
        firm_id: firmId,
        fund_id: fundId,
        portfolio_company_id: companyId,
        // `relevant: false` rows are kept as a "already evaluated, skip" marker
        // so we don't re-ask Claude about the same regulation every run.
        relevance_reason: v.relevant ? v.reason : `NOT_RELEVANT: ${v.reason}`,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length > 0) {
      const { error } = await admin.from('regulation_relevance').upsert(rows, {
        onConflict: 'regulation_id,firm_id,portfolio_company_id,fund_id',
      })
      if (error) throw error
    }

    const relevantCount = verdicts.filter(v => v.relevant).length
    return json({ evaluated: rows.length, relevant: relevantCount })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
