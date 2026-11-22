// Generates the detailed, neutral impact analysis for one regulation and one
// firm, and stores it in `regulation_impacts`. Shared by the on-demand
// `regulation-impact` function and by the matchers, which call it in the
// background for newly relevant regulations so it's ready before anyone opens
// the regulation.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { withoutCoveredDuplicates } from './duplicates.ts'
import { COMPANY_FACTS, COMPANY_UNKNOWNS, FACT_MARKERS, FIRM_FACTS, FIRM_UNKNOWNS, FUND_FACTS, FUND_UNKNOWNS, facts } from './entityFacts.ts'
import { federalRegisterTextUrls, type FederalRegisterDocumentRef } from './federalRegister.ts'
import { fetchPlainText } from './text.ts'
import { callClaude, toolInput } from './ai/client.ts'
import { MODEL_FOR } from './ai/models.ts'
import { impactPromptFor } from './impactPrompts.ts'
import { automaticAiPaused } from './ai/switch.ts'

const MODEL = MODEL_FOR.impactAnalysis
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

const listOfStrings = { type: 'array', items: { type: 'string' } }

export type ImpactStatus = 'created' | 'exists' | 'awaiting_publication' | 'in_progress'

async function hasImpact(admin: SupabaseClient, regulationId: string, firmId: string): Promise<boolean> {
  const { data: existing } = await admin
    .from('regulation_impacts')
    .select('id')
    .eq('regulation_id', regulationId)
    .eq('firm_id', firmId)
    .maybeSingle()
  return !!existing
}

// `in_progress`: another invocation is writing this analysis right now
// (migration 0045). Nothing is spent; a forced request is passed on to it as
// a rerun, which it starts once it finishes.
export async function generateImpact(
  admin: SupabaseClient,
  regulationId: string,
  firmId: string,
  opts: { force?: boolean } = {},
): Promise<ImpactStatus> {
  if (!opts.force && (await hasImpact(admin, regulationId, firmId))) return 'exists'

  const job = { p_regulation_id: regulationId, p_firm_id: firmId }
  const { data: claimed, error: claimError } = await admin.rpc('claim_impact_job', { ...job, p_force: !!opts.force })
  // Without the claim table (a function deployed before its migration) the
  // analysis is still written, as before the lock existed.
  if (claimError) console.error('impact claim failed', regulationId, claimError.message)
  else if (claimed !== true) return 'in_progress'

  try {
    // Another invocation may have finished it between the check and the claim.
    if (!opts.force && (await hasImpact(admin, regulationId, firmId))) return 'exists'
    return await writeImpact(admin, regulationId, firmId)
  } finally {
    if (!claimError) {
      const { data, error } = await admin.rpc('release_impact_job', job)
      // An unreleased claim goes stale after 5 minutes and is taken over.
      if (error) console.error('impact release failed', regulationId, error.message)
      // A forced rewrite asked for while this one was being written: start
      // it in its own invocation, as the matchers do.
      if (data === true) await generateImpacts([regulationId], firmId, 1, { force: true })
    }
  }
}

async function writeImpact(admin: SupabaseClient, regulationId: string, firmId: string): Promise<'created' | 'awaiting_publication'> {
  const [{ data: reg }, { data: firm }, { data: funds }, { data: companies }, { data: links }, { data: holdings }] = await Promise.all([
    admin.from('regulations').select('id, source, title, agency, jurisdiction, summary, published_date, effective_date, source_url, raw, category, on_public_inspection').eq('id', regulationId).single(),
    admin.from('firms').select('name, hq_location, jurisdictions, profile, profile_meta').eq('id', firmId).single(),
    admin.from('funds').select('id, name, structure, size, jurisdictions, profile, profile_meta').eq('firm_id', firmId),
    admin.from('portfolio_companies').select('id, name, hq_location, sectors, regions, offerings, profile, profile_meta').eq('firm_id', firmId),
    admin.from('regulation_relevance').select('fund_id, portfolio_company_id, relevance_reason').eq('regulation_id', regulationId).eq('firm_id', firmId),
    admin.from('fund_holdings').select('fund_id, portfolio_company_id').eq('firm_id', firmId),
  ])
  if (!reg || !firm) throw new Error('Regulation or firm not found')

  const linkedFunds = new Set((links ?? []).map(l => l.fund_id).filter(Boolean))
  const linkedCompanies = new Set((links ?? []).map(l => l.portfolio_company_id).filter(Boolean))
  const reasons = (links ?? []).map(l => l.relevance_reason).filter((r): r is string => !!r && !r.startsWith('NOT_RELEVANT'))

  const entities = [
    `FIRM — ${firm.name}: ${facts(firm as Record<string, unknown>, FIRM_FACTS, FIRM_UNKNOWNS)}`,
    ...(funds ?? [])
      .filter(f => linkedFunds.has(f.id))
      .map(f => {
        // The companies a fund holds (fund_holdings), so an indirect match
        // can be written as a path: fund → company → location.
        const holds = (holdings ?? []).filter(h => h.fund_id === f.id).map(h => companies?.find(c => c.id === h.portfolio_company_id)?.name).filter(Boolean)
        return `FUND — ${f.name}: ${facts({ ...f, holds } as Record<string, unknown>, FUND_FACTS, FUND_UNKNOWNS)}`
      }),
    ...(companies ?? [])
      .filter(c => linkedCompanies.has(c.id))
      .map(
        c =>
          `COMPANY — ${c.name}: ${facts(c as Record<string, unknown>, COMPANY_FACTS, COMPANY_UNKNOWNS)}`,
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
    model: MODEL,
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
            // Regulation-level, not firm-level. Not cached: a cache write
            // costs 25% more than plain input and pays off only when another
            // firm analyses the same item within minutes, which with one
            // firm almost never happens (2026-10-18: ~6,500 tokens written
            // per analysis, ~400 read back). Add a cache_control breakpoint
            // here again once many firms share the same developments.
            type: 'text',
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
ENTITIES (use only these facts. ${FACT_MARKERS})
${entities.join('\n')}`,
          },
        ],
      },
    ],
  }, { usage: { admin, functionName: 'regulation-impact', firmId } })

  const analysis = toolInput<Omit<ImpactContent, 'text_truncated'>>(result, 'submit_impact_analysis')
  if (!analysis) throw new Error('Model returned no structured analysis')
  const content: ImpactContent = { ...analysis, text_truncated: truncated }

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
  // Written when someone opens the development instead (regulation-impact).
  if (automaticAiPaused()) return
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
