// Generates the detailed, neutral impact analysis for one regulation and one
// firm, and stores it in `regulation_impacts`. Shared by the on-demand
// `regulation-impact` function and by the matchers, which call it in the
// background for newly relevant regulations so it's ready before anyone opens
// the regulation.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { withoutCoveredDuplicates } from './duplicates.ts'
import { COMPANY_FACTS, FIRM_FACTS, FUND_FACTS, facts } from './entityFacts.ts'
import { federalRegisterTextUrls, type FederalRegisterDocumentRef } from './federalRegister.ts'
import { fetchPlainText } from './text.ts'
import { recordUsage } from './usage.ts'
import { impactPromptFor } from './impactPrompts.ts'

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

interface RegulationTextSource {
  source: string
  raw: Record<string, unknown> | null
  source_url: string
  summary: string | null
  on_public_inspection: boolean
}

// Candidate URLs for a regulation's full text, best first.
const textUrls = (reg: RegulationTextSource): (string | undefined)[] =>
  reg.source === 'federal_register' && reg.raw
    ? federalRegisterTextUrls(reg.raw as unknown as FederalRegisterDocumentRef)
    : [reg.raw?.raw_text_url as string | undefined, reg.source_url]

// The text to analyse, or null when a document scheduled for a future
// Federal Register issue has no readable text yet (GovInfo only carries it
// once published). Its abstract alone would make a thin analysis that reads
// as if written from the document, so it waits for publication instead.
async function loadRegulationText(reg: RegulationTextSource): Promise<string | null> {
  // sync-sec-enforcement already extracts and stores the release's narrative
  // text directly — reuse it instead of re-fetching and re-stripping the
  // full site page, which would be noisier than what's already saved.
  const narrative = reg.raw?.narrative_text as string | undefined
  if (narrative) return narrative
  const text = await fetchPlainText(textUrls(reg))
  if (!text && reg.on_public_inspection) return null
  return text || reg.summary || ''
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
): Promise<'created' | 'exists' | 'awaiting_publication'> {
  if (!opts.force) {
    const { data: existing } = await admin
      .from('regulation_impacts')
      .select('id')
      .eq('regulation_id', regulationId)
      .eq('firm_id', firmId)
      .maybeSingle()
    if (existing) return 'exists'
  }

  const [{ data: reg }, { data: firm }, { data: funds }, { data: companies }, { data: links }, { data: holdings }] = await Promise.all([
    admin.from('regulations').select('id, source, title, agency, jurisdiction, summary, published_date, effective_date, source_url, raw, category, on_public_inspection').eq('id', regulationId).single(),
    admin.from('firms').select('name, hq_location, jurisdictions, profile').eq('id', firmId).single(),
    admin.from('funds').select('id, name, structure, size, jurisdictions, profile').eq('firm_id', firmId),
    admin.from('portfolio_companies').select('id, name, hq_location, sectors, regions, offerings, profile').eq('firm_id', firmId),
    admin.from('regulation_relevance').select('fund_id, portfolio_company_id, relevance_reason').eq('regulation_id', regulationId).eq('firm_id', firmId),
    admin.from('fund_holdings').select('fund_id, portfolio_company_id').eq('firm_id', firmId),
  ])
  if (!reg || !firm) throw new Error('Regulation or firm not found')

  const linkedFunds = new Set((links ?? []).map(l => l.fund_id).filter(Boolean))
  const linkedCompanies = new Set((links ?? []).map(l => l.portfolio_company_id).filter(Boolean))
  const reasons = (links ?? []).map(l => l.relevance_reason).filter((r): r is string => !!r && !r.startsWith('NOT_RELEVANT'))

  const entities = [
    `FIRM — ${firm.name}: ${facts(firm as Record<string, unknown>, FIRM_FACTS)}`,
    ...(funds ?? [])
      .filter(f => linkedFunds.has(f.id))
      .map(f => {
        // The companies a fund holds (fund_holdings), so an indirect match
        // can be written as a path: fund → company → location.
        const holds = (holdings ?? []).filter(h => h.fund_id === f.id).map(h => companies?.find(c => c.id === h.portfolio_company_id)?.name).filter(Boolean)
        return `FUND — ${f.name}: ${facts({ ...f, holds } as Record<string, unknown>, FUND_FACTS)}`
      }),
    ...(companies ?? [])
      .filter(c => linkedCompanies.has(c.id))
      .map(
        c =>
          `COMPANY — ${c.name}: ${facts(c as Record<string, unknown>, COMPANY_FACTS)}`,
      ),
  ]

  const fullText = await loadRegulationText(reg as RegulationTextSource)
  // Nothing stored: opening the item after publication generates it then.
  if (fullText === null) return 'awaiting_publication'
  const truncated = fullText.length > MAX_TEXT_CHARS
  const text = fullText.slice(0, MAX_TEXT_CHARS)

  // Category-specific wording (regulatory / enforcement / geopolitical) —
  // same output schema for all, so the UI needs no branching. See
  // impactPrompts.ts for why each category is framed the way it is.
  const prompt = impactPromptFor(reg.category)

  const result = await callClaude({
    max_tokens: 6000,
    tool_choice: { type: 'tool', name: 'submit_impact_analysis' },
    // Identical for every firm analyzing this same category of item — its
    // own cache breakpoint, separate from the per-regulation text below.
    system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
    tools: [
      {
        name: 'submit_impact_analysis',
        description: prompt.toolDescription,
        input_schema: {
          type: 'object',
          properties: {
            overview: { type: 'string', description: prompt.overview },
            scope: { type: 'string', description: prompt.scope },
            status: { type: 'string', description: prompt.status },
            key_provisions: { ...listOfStrings, description: prompt.keyProvisions },
            key_dates: {
              type: 'array',
              description: prompt.keyDates,
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, date: { type: 'string' }, note: { type: 'string' } },
                required: ['label', 'date', 'note'],
              },
            },
            impacts: {
              type: 'array',
              description: prompt.impacts,
              items: {
                type: 'object',
                properties: {
                  entity_type: { type: 'string', enum: ['firm', 'fund', 'company'] },
                  entity_name: { type: 'string' },
                  headline: { type: 'string', description: prompt.headline },
                  how_it_applies: { type: 'string', description: prompt.howItApplies },
                  obligations: { ...listOfStrings, description: prompt.obligations },
                  timeline: { type: 'string', description: 'Relevant dates for this entity, or an empty string.' },
                  operational_areas: { ...listOfStrings, description: 'Functions or workflows touched (e.g. investor reporting, marketing, custody, data handling).' },
                  open_questions: { ...listOfStrings, description: 'Facts not provided that would determine whether the overlap is meaningful.' },
                },
                required: ['entity_type', 'entity_name', 'headline', 'how_it_applies', 'obligations', 'timeline', 'operational_areas', 'open_questions'],
              },
            },
            considerations: { ...listOfStrings, description: prompt.considerations },
            limitations: { type: 'string', description: 'One or two sentences on what this analysis rests on (e.g. text truncated, profile information missing).' },
          },
          required: ['overview', 'scope', 'status', 'key_provisions', 'key_dates', 'impacts', 'considerations', 'limitations'],
        },
        // Static per category — cached so a run of several firms/regulations
        // in the same category doesn't re-bill it each time.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            // Regulation-level, not firm-level — identical whether this is
            // firm #1 or firm #50 analyzing the same item, and identical on
            // a `force: true` regeneration. Its own cache breakpoint,
            // separate from the firm-specific entity block below, so that
            // reuse isn't defeated by the one part that actually varies.
            type: 'text',
            cache_control: { type: 'ephemeral' },
            text: `${prompt.documentLabel}
Title: ${reg.title}
Agency: ${reg.agency ?? 'n/a'} · Jurisdiction: ${reg.jurisdiction ?? 'n/a'}
Published: ${reg.published_date ?? 'n/a'} · Effective: ${reg.effective_date ?? 'n/a'}
Official summary: ${reg.summary ?? 'none'}
TEXT${truncated ? ' (first portion only — the document is longer)' : ''}:
${text}`,
          },
          {
            type: 'text',
            text: `${reasons.length ? `Why it was matched to this firm: ${reasons.join(' | ')}\n` : ''}
ENTITIES (use only these facts)
${entities.join('\n')}`,
          },
        ],
      },
    ],
  })

  await recordUsage(admin, {
    functionName: 'regulation-impact',
    firmId,
    model: MODEL,
    inputTokens: result.usage?.input_tokens,
    cacheCreationInputTokens: result.usage?.cache_creation_input_tokens,
    cacheReadInputTokens: result.usage?.cache_read_input_tokens,
    outputTokens: result.usage?.output_tokens,
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

// Generates impacts for several regulations, capped, never throwing. Each
// one is handed to its own `regulation-impact` invocation rather than run
// here: an analysis takes 30–70 s and a function's background work is cut
// off at the platform's wall-clock limit (~150 s), so several run inside the
// caller died part-way (4 of 6 on the first scheduled matching run). This
// returns once every invocation has accepted its job; meant to be passed to
// EdgeRuntime.waitUntil(). `opts.force` re-generates even where a (now
// possibly stale) analysis already exists — used after a profile edit so the
// explanation for already-matched regulations catches up to the corrected
// facts instead of silently keeping the old text.
//
// A later version of a development the firm is already matched to (an
// announcement's Federal Register document, say) is listed under the first
// version, so its analysis isn't prepared ahead; opening it where it stands
// alone writes it then.
export async function generateImpacts(regulationIds: string[], firmId: string, max = 8, opts: { force?: boolean } = {}): Promise<void> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const wanted = opts.force
    ? regulationIds
    : await withoutCoveredDuplicates(createClient(Deno.env.get('SUPABASE_URL')!, key), firmId, regulationIds).catch(() => regulationIds)
  await Promise.all(
    wanted.slice(0, max).map(async regulationId => {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/regulation-impact`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ regulationId, firmId, force: !!opts.force }),
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) console.error('impact queueing failed', regulationId, res.status, await res.text())
        else await res.body?.cancel()
      } catch (err) {
        console.error('impact queueing failed', regulationId, (err as Error).message)
      }
    }),
  )
}
