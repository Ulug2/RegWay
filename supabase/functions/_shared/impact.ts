// Generates the detailed, neutral impact analysis for one regulation and one
// firm, and stores it in `regulation_impacts`. Shared by the on-demand
// `regulation-impact` function and by the matchers, which call it in the
// background for newly relevant regulations so it's ready before anyone opens
// the regulation.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { fetchPlainText } from './text.ts'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
// ~15K tokens of regulation text. Long final rules run to hundreds of pages;
// the preamble and operative sections come first, which is what matters most.
const MAX_TEXT_CHARS = 60000

export interface ImpactContent {
  overview: string
  scope: string
  status: string
  key_provisions: string[]
  key_dates: { label: string; date: string; note: string }[]
  impacts: {
    entity_type: 'firm' | 'fund' | 'company'
    entity_name: string
    headline: string
    how_it_applies: string
    obligations: string[]
    timeline: string
    operational_areas: string[]
    open_questions: string[]
  }[]
  considerations: string[]
  limitations: string
  text_truncated: boolean
}

async function loadRegulationText(reg: { raw: Record<string, unknown> | null; source_url: string; summary: string | null }) {
  // sync-sec-enforcement already extracts and stores the release's narrative
  // text directly — reuse it instead of re-fetching and re-stripping the
  // full site page, which would be noisier than what's already saved.
  const narrative = reg.raw?.narrative_text as string | undefined
  if (narrative) return narrative
  const text = await fetchPlainText([reg.raw?.raw_text_url as string | undefined, reg.source_url])
  return text || reg.summary || ''
}

const facts = (row: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!row) return ''
  const profile = (row.profile ?? {}) as Record<string, unknown>
  const parts = keys
    .map(k => [k, row[k] ?? profile[k]] as const)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`)
  return parts.join('; ')
}

async function callClaude(body: Record<string, unknown>) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  })
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
  return res.json()
}

const listOfStrings = { type: 'array', items: { type: 'string' } }

export async function generateImpact(
  admin: SupabaseClient,
  regulationId: string,
  firmId: string,
  opts: { force?: boolean } = {},
): Promise<'created' | 'exists'> {
  if (!opts.force) {
    const { data: existing } = await admin
      .from('regulation_impacts')
      .select('id')
      .eq('regulation_id', regulationId)
      .eq('firm_id', firmId)
      .maybeSingle()
    if (existing) return 'exists'
  }

  const [{ data: reg }, { data: firm }, { data: funds }, { data: companies }, { data: links }] = await Promise.all([
    admin.from('regulations').select('id, title, agency, jurisdiction, summary, published_date, effective_date, source_url, raw, category').eq('id', regulationId).single(),
    admin.from('firms').select('name, hq_location, jurisdictions, profile').eq('id', firmId).single(),
    admin.from('funds').select('id, name, structure, size, jurisdictions, profile').eq('firm_id', firmId),
    admin.from('portfolio_companies').select('id, name, hq_location, sectors, regions, offerings, profile').eq('firm_id', firmId),
    admin.from('regulation_relevance').select('fund_id, portfolio_company_id, relevance_reason').eq('regulation_id', regulationId).eq('firm_id', firmId),
  ])
  if (!reg || !firm) throw new Error('Regulation or firm not found')

  const linkedFunds = new Set((links ?? []).map(l => l.fund_id).filter(Boolean))
  const linkedCompanies = new Set((links ?? []).map(l => l.portfolio_company_id).filter(Boolean))
  const reasons = (links ?? []).map(l => l.relevance_reason).filter((r): r is string => !!r && !r.startsWith('NOT_RELEVANT'))

  const entities = [
    `FIRM — ${firm.name}: ${facts(firm as Record<string, unknown>, ['hq_location', 'jurisdictions', 'firm_type', 'adviser_registration', 'strategies', 'industries', 'geographies'])}`,
    ...(funds ?? [])
      .filter(f => linkedFunds.has(f.id))
      .map(f => `FUND — ${f.name}: ${facts(f as Record<string, unknown>, ['structure', 'size', 'jurisdictions', 'status', 'strategy', 'ownership', 'industries', 'geographies'])}`),
    ...(companies ?? [])
      .filter(c => linkedCompanies.has(c.id))
      .map(
        c =>
          `COMPANY — ${c.name}: ${facts(c as Record<string, unknown>, ['hq_location', 'sectors', 'regions', 'offerings', 'customers', 'consumer_facing', 'sensitive_data', 'regulated', 'license_types', 'gov_contracts', 'trade', 'outside_us', 'foreign_countries', 'ownership'])}`,
      ),
  ]

  const fullText = await loadRegulationText(reg as { raw: Record<string, unknown> | null; source_url: string; summary: string | null })
  const truncated = fullText.length > MAX_TEXT_CHARS
  const text = fullText.slice(0, MAX_TEXT_CHARS)

  // An enforcement item (an SEC litigation release, SEC administrative
  // proceeding, or FINRA disciplinary action) is a case against a named third
  // party, not a rule — reusing the rule-shaped prompt as-is would produce a
  // nonsensical "key provisions"/"proposed vs. final" framing, and worse,
  // risks writing prose that reads as if it's describing this firm's own
  // conduct. Same output schema (so the UI needs no change), different system
  // prompt and a few field descriptions. Deliberately source-agnostic: a
  // litigation release is contested allegations, an SEC administrative order
  // or FINRA action is often a settled consent order (findings the
  // respondent neither admits nor denies) — the model is told to state
  // whichever posture the source document itself describes, not assume one.
  const isEnforcement = reg.category === 'enforcement'

  const system = isEnforcement
    ? 'You are a regulatory analyst writing for the general partners and compliance staff of a private equity firm, summarizing an SEC or FINRA enforcement action (a litigation release, administrative proceeding, or disciplinary action) as background awareness for one or more of the firm\'s entities. This concerns named respondents/defendants who are NOT this firm, any of its funds, or any of its portfolio companies. State the matter\'s procedural posture exactly as the source describes it — contested allegations if litigation is pending, or a settled/consent order\'s findings if the source says the respondent neither admitted nor denied them — and never characterize it as more settled or more proven than the source states. Never state or imply that the firm, a fund, or a portfolio company did anything wrong, is under investigation, or is a party to this action. The only legitimate connection to describe is a genuine, factual overlap between the conduct described and that entity\'s own described activity (the same instrument, customer type, or practice) — never a bare shared-industry label. Write in precise, neutral, plain prose. Do NOT give legal advice or rate severity, urgency, or risk. Base every statement on the source text or entity facts provided; never invent facts. Where a fact needed to judge the overlap is missing, say so in open_questions instead of assuming.'
    : 'You are a regulatory analyst writing for the general partners and compliance staff of a private equity firm. Write in a precise, professional, strictly neutral register, in plain prose a senior professional can act on. Explain what the regulation says and how it applies to the specific entities described. Do NOT give legal advice, recommend actions, or rate or label anything by severity, urgency, risk or priority. Do not use alarmist or promotional language. Base every statement on the regulation text provided or the entity facts provided; never invent provisions, dates, thresholds or facts about an entity. Where an entity fact that would decide applicability is missing, say so in open_questions instead of assuming.'

  const result = await callClaude({
    max_tokens: 6000,
    tool_choice: { type: 'tool', name: 'submit_impact_analysis' },
    system,
    tools: [
      {
        name: 'submit_impact_analysis',
        description: isEnforcement ? 'Submit the structured summary of the enforcement action.' : 'Submit the structured analysis of the regulation.',
        input_schema: {
          type: 'object',
          properties: {
            overview: {
              type: 'string',
              description: isEnforcement
                ? 'Two to four paragraphs: who the action names, what they are alleged or found to have done, and the case\'s current procedural posture. Separate paragraphs with a blank line.'
                : 'Two to four paragraphs: what the regulation is, the problem it addresses, what it changes, and its procedural posture. Separate paragraphs with a blank line.',
            },
            scope: {
              type: 'string',
              description: isEnforcement
                ? 'What conduct, instruments, and parties the action covers, in one or two paragraphs.'
                : 'Who and what is covered, including thresholds and exemptions, in one or two paragraphs.',
            },
            status: {
              type: 'string',
              description: isEnforcement
                ? 'Procedural posture exactly as the source states it: litigation pending, settled/consent order, default judgment, bar/suspension imposed, etc., with the relevant forum and date.'
                : 'Proposed, final, interim, notice, etc., with comment deadlines or effectiveness where stated.',
            },
            key_provisions: {
              ...listOfStrings,
              description: isEnforcement
                ? '4-8 specific factual points from the source (the conduct alleged or found), each one or two sentences, framed with the same certainty the source itself uses (allegation vs. finding).'
                : '4-8 specific operative provisions, each one or two sentences.',
            },
            key_dates: {
              type: 'array',
              description: isEnforcement
                ? 'Dates stated in the release (filing date, alleged conduct period, court deadlines).'
                : 'Dates and deadlines stated in the text (publication, effective, compliance, comment).',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, date: { type: 'string' }, note: { type: 'string' } },
                required: ['label', 'date', 'note'],
              },
            },
            impacts: {
              type: 'array',
              description: isEnforcement
                ? 'One entry for the firm and one for each fund/company whose own described activity genuinely overlaps with the conduct alleged. Omit entities with no real overlap.'
                : 'One entry for the firm and one for each fund/company listed that the regulation actually touches. Omit entities it does not touch.',
              items: {
                type: 'object',
                properties: {
                  entity_type: { type: 'string', enum: ['firm', 'fund', 'company'] },
                  entity_name: { type: 'string' },
                  headline: {
                    type: 'string',
                    description: isEnforcement
                      ? 'One neutral sentence naming the specific factual overlap with this entity\'s own activity — never implying the entity is involved in the case.'
                      : 'One neutral sentence: how the regulation relates to this entity.',
                  },
                  how_it_applies: {
                    type: 'string',
                    description: isEnforcement
                      ? 'One or two paragraphs: what the case alleges, and the specific, concrete similarity to this entity\'s own described activity. Explicitly note this entity is not a party to the action.'
                      : 'One or two paragraphs connecting specific provisions to specific facts about this entity.',
                  },
                  obligations: {
                    ...listOfStrings,
                    description: isEnforcement
                      ? 'Leave empty — an enforcement action against a third party creates no obligation for this entity.'
                      : 'Concrete requirements that would apply, each tied to a provision. Empty if none.',
                  },
                  timeline: { type: 'string', description: 'Relevant dates for this entity, or an empty string.' },
                  operational_areas: { ...listOfStrings, description: 'Functions or workflows touched (e.g. investor reporting, marketing, custody, data handling).' },
                  open_questions: { ...listOfStrings, description: 'Facts not provided that would determine whether the overlap is meaningful.' },
                },
                required: ['entity_type', 'entity_name', 'headline', 'how_it_applies', 'obligations', 'timeline', 'operational_areas', 'open_questions'],
              },
            },
            considerations: {
              ...listOfStrings,
              description: isEnforcement
                ? 'Neutral notes on how this entity\'s situation differs from the case, or open questions about whether the overlap is meaningful. Not recommendations.'
                : 'Neutral points a reader may wish to confirm with counsel (interpretive ambiguities, pending rulemakings, cross-references). Not recommendations.',
            },
            limitations: { type: 'string', description: 'One or two sentences on what this analysis rests on (e.g. text truncated, profile information missing).' },
          },
          required: ['overview', 'scope', 'status', 'key_provisions', 'key_dates', 'impacts', 'considerations', 'limitations'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${isEnforcement ? 'ENFORCEMENT ACTION (SEC or FINRA — state procedural posture exactly as the source describes it)' : 'REGULATION'}
Title: ${reg.title}
Agency: ${reg.agency ?? 'n/a'} · Jurisdiction: ${reg.jurisdiction ?? 'n/a'}
Published: ${reg.published_date ?? 'n/a'} · Effective: ${reg.effective_date ?? 'n/a'}
Official summary: ${reg.summary ?? 'none'}
${reasons.length ? `Why it was matched to this firm: ${reasons.join(' | ')}\n` : ''}
TEXT${truncated ? ' (first portion only — the document is longer)' : ''}:
${text}

ENTITIES (use only these facts)
${entities.join('\n')}`,
      },
    ],
  })

  const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  if (!toolUse?.input) throw new Error('Model returned no structured analysis')
  const content: ImpactContent = { ...toolUse.input, text_truncated: truncated }

  const { error } = await admin
    .from('regulation_impacts')
    .upsert({ regulation_id: regulationId, firm_id: firmId, content, model: MODEL }, { onConflict: 'regulation_id,firm_id' })
  if (error) throw error
  return 'created'
}

// Generates impacts for several regulations without blocking the caller:
// a few at a time, capped, newest first, never throwing. Meant to be passed to
// EdgeRuntime.waitUntil().
export async function generateImpacts(admin: SupabaseClient, regulationIds: string[], firmId: string, max = 8): Promise<void> {
  const queue = regulationIds.slice(0, max)
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!
      try {
        await generateImpact(admin, id, firmId)
      } catch (err) {
        console.error('impact generation failed', id, (err as Error).message)
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
}
