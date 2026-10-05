// The regulatory matcher's verdict call: one batch of Federal Register
// documents judged against a firm's recorded jurisdictions, fund structures
// and portfolio sectors. Used by match-relevance; `model` is overridable so a
// cheaper model can be compared on the exact production prompt before any
// switch (roadmap item 6.3).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { describe, type FirmEntities, type Verdict } from './relevance.ts'
import { recordUsage } from './usage.ts'

export const REGULATORY_MODEL = 'claude-sonnet-4-5'

export interface RegulatoryCandidate {
  id: string
  title: string
  agency: string | null
  jurisdiction: string | null
  summary: string | null
}

export async function judgeRegulations(
  admin: SupabaseClient,
  opts: { firmId: string; entities: FirmEntities & { firm: NonNullable<FirmEntities['firm']> }; candidates: RegulatoryCandidate[]; functionName: string; model?: string },
): Promise<Verdict[]> {
  const { firmId, candidates, functionName, model = REGULATORY_MODEL } = opts
  const { firm, funds, companies } = opts.entities

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
  const regList = candidates.map((r, i) => `${i}. [${r.agency ?? r.jurisdiction}] ${r.title} — ${r.summary ?? 'no summary'}`).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
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
    functionName,
    firmId,
    model,
    inputTokens: result.usage?.input_tokens,
    cacheCreationInputTokens: result.usage?.cache_creation_input_tokens,
    cacheReadInputTokens: result.usage?.cache_read_input_tokens,
    outputTokens: result.usage?.output_tokens,
  })

  return verdicts
}
