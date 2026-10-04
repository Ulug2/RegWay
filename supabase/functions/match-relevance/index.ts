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
import { resolveFirmContext, loadFirmEntities, describe, checkRateLimit, buildRelevanceRows, upsertRelevanceRows, type Verdict } from '../_shared/relevance.ts'
import { recordUsage } from '../_shared/usage.ts'

const MODEL = 'claude-sonnet-4-5'
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BATCH_SIZE = 40

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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

    // Questionnaire answers (stored in `profile`) sharpen the match: adviser
    // registration decides which SEC rules apply, strategy/industries narrow
    // sector rules, and the fund's proposed-vs-final preference is honoured.
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
    const companyList =
      (companies ?? []).map(c => `- ${c.name} (sectors: ${(c.sectors ?? []).join('/')}, regions: ${(c.regions ?? []).join('/')}${c.offerings ? `; does: ${c.offerings}` : ''})`).join('\n') || 'none on file'
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
            // Static across every call — cached so a batch sequence for the
            // same firm doesn't re-bill this definition every time.
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                // Identical across every batch for this firm (changes only
                // when the firm edits its profile/funds/companies) — its own
                // cache breakpoint, separate from the per-batch regulation
                // list below which never repeats.
                type: 'text',
                cache_control: { type: 'ephemeral' },
                text: `Firm: ${firm.name}, headquartered in ${firm.hq_location ?? 'unknown'}, operating in: ${(firm.jurisdictions ?? []).join(', ') || 'unspecified'}.${firmProfile ? `
Firm profile — ${firmProfile}.` : ''}

Funds:
${fundList}

Portfolio companies:
${companyList}

For each numbered regulation below, decide whether it creates a real compliance obligation or material exposure for this specific firm, one of its funds, or one of its portfolio companies — based on jurisdiction, sector, and structure match. Be strict: a generic federal rule that doesn't actually touch this firm's jurisdictions, fund structures, or portfolio sectors should be marked not relevant. Speculative or hypothetical connections are not sufficient grounds for relevance — if your reasoning would need words like "may have," "could be exposed to," or "might apply," mark it not relevant instead. Also mark not relevant anything that is purely administrative or procedural and creates no new obligation — an award determination, an individual's case outcome, a routine data-availability or agency-organizational notice, or a state-program approval that doesn't itself bind this firm. Mark relevant only when you can name the specific new obligation, deadline, or requirement being created, and the specific fund, portfolio company, or jurisdiction it actually touches — not just "this firm is generally in a regulated industry."`,
              },
              { type: 'text', text: regList },
            ],
          },
        ],
      }),
    })

    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
    const result = await res.json()
    const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    const verdicts: Verdict[] = toolUse?.input?.verdicts ?? []

    await recordUsage(admin, {
      functionName: 'match-relevance',
      firmId,
      model: MODEL,
      inputTokens: result.usage?.input_tokens,
      cacheCreationInputTokens: result.usage?.cache_creation_input_tokens,
      cacheReadInputTokens: result.usage?.cache_read_input_tokens,
      outputTokens: result.usage?.output_tokens,
    })

    const rows = buildRelevanceRows(verdicts, unevaluated, firmId, funds, companies)
    await upsertRelevanceRows(admin, rows)

    const relevantCount = verdicts.filter(v => v.relevant).length

    // Prepare the detailed impact analysis for newly relevant regulations in
    // the background so it's ready before anyone opens them.
    const newlyRelevantIds = [...new Set(verdicts.filter(v => v.relevant).map(v => unevaluated[v.index]?.id).filter((id): id is string => !!id))]
    if (newlyRelevantIds.length > 0) EdgeRuntime.waitUntil(generateImpacts(admin, newlyRelevantIds, firmId))

    return json({ evaluated: rows.length, relevant: relevantCount })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
