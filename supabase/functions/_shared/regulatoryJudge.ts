// The regulatory matcher's verdict call: one batch of Federal Register
// documents judged against a firm's recorded jurisdictions, fund structures
// and portfolio sectors. Used by match-relevance; `model` is overridable so a
// cheaper model can be compared on the exact production prompt before any
// switch (roadmap item 6.3).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { describe, type FirmEntities, type Verdict } from './relevance.ts'
import { callClaude, toolInput } from './ai/client.ts'
import { MODEL_FOR } from './ai/models.ts'

// Haiku 4.5 (a third of Sonnet 4.5's price): on 40 already-judged H.I.G.
// items at temperature 0 it gave the same verdict as Sonnet on all 40
// (2026-10-05, roadmap item 6.3). The geopolitical judge stays on Sonnet:
// there Haiku linked sanctions on persons in a country to any company there.
export const REGULATORY_MODEL = MODEL_FOR.regulatoryJudge

export interface RegulatoryCandidate {
  id: string
  title: string
  agency: string | null
  jurisdiction: string | null
  summary: string | null
}

const NON_US = new Set(['United Kingdom', 'European Union'])

const correctionText = (correction: string | null | undefined) =>
  correction === undefined
    ? ''
    : correction
      ? `\n\nA user has flagged the previous verdict for this regulation as possibly incorrect and provided this correction: "${correction}". Weigh it against the firm/fund/company facts above — if it changes your assessment, say so in your reason; if the stated correction doesn't actually change whether this regulation applies, explain why not.`
      : '\n\nA user has flagged the previous verdict for this regulation as possibly incorrect, with no further detail. Re-assess carefully against the firm/fund/company facts above.'

export async function judgeRegulations(
  admin: SupabaseClient,
  opts: { firmId: string; entities: FirmEntities & { firm: NonNullable<FirmEntities['firm']> }; candidates: RegulatoryCandidate[]; functionName: string; model?: string; correction?: string | null },
): Promise<Verdict[]> {
  const { firmId, candidates, functionName, model = REGULATORY_MODEL } = opts
  // undefined: a normal match. null: a user re-check with no note.
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
  // A non-U.S. item says where it applies: the issuer's name alone ("ESMA")
  // doesn't tell the model it binds only entities connected to that place.
  const issuer = (r: RegulatoryCandidate) => (r.agency && r.jurisdiction && NON_US.has(r.jurisdiction) ? `${r.agency}, ${r.jurisdiction}` : (r.agency ?? r.jurisdiction))
  const regList = candidates.map((r, i) => `${i}. [${issuer(r)}] ${r.title} — ${r.summary ?? 'no summary'}`).join('\n')

  const result = await callClaude({
    model,
    max_tokens: 4096,
    // Verdicts, not prose: the same item should get the same answer on
    // every run (at the default temperature borderline items flipped).
    temperature: 0,
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

For each numbered regulation below, decide whether it creates a real compliance obligation or material exposure for this specific firm, one of its funds, or one of its portfolio companies — based on jurisdiction, sector, and structure match. Be strict: a generic federal rule that doesn't actually touch this firm's jurisdictions, fund structures, or portfolio sectors should be marked not relevant. Speculative or hypothetical connections are not sufficient grounds for relevance — if your reasoning would need words like "may have," "could be exposed to," or "might apply," mark it not relevant instead. Also mark not relevant anything that is purely administrative or procedural and creates no new obligation — an award determination, an individual's case outcome, a routine data-availability or agency-organizational notice, or a state-program approval that doesn't itself bind this firm. Mark relevant only when you can name the specific new obligation, deadline, or requirement being created, and the specific fund, portfolio company, or jurisdiction it actually touches — not just "this firm is generally in a regulated industry." Some items are a regulator's own announcement of a proposal, rule, guidance or relief rather than the published document: judge them by the measure they announce. An item marked United Kingdom or European Union binds only an entity established, authorised, marketing or operating there: mark it relevant only when the facts above record that connection for the entity you name.`,
          },
          { type: 'text', text: regList + correctionText(opts.correction) },
        ],
      },
    ],
  }, { usage: { admin, functionName, firmId } })

  return toolInput<{ verdicts?: Verdict[] }>(result, 'submit_verdicts')?.verdicts ?? []
}
