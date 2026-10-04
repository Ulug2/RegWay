// This is the "AI searches the internet for a portfolio company" flow:
// given a portfolio_company_id, it builds a query from that company's
// sector + location, asks Claude (with the web_search tool) to find recent
// regulatory activity, then makes a second Claude call to force the answer
// into a strict structured list — which we upsert as normal `regulations`
// rows, each linked to the company via `regulation_relevance`. That way the
// dashboard's Portfolio Companies feed renders these exactly like any other
// headline card, and results are cached instead of re-searched on every click.
//
// Called from the browser with the user's own session token:
//   POST /functions/v1/company-regulations   { "companyId": "<uuid>" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { generateImpacts } from '../_shared/impact.ts'
import { recordUsage } from '../_shared/usage.ts'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MODEL = 'claude-sonnet-4-5'

interface RegulationItem {
  title: string
  agency: string
  jurisdiction: string
  published_date: string | null
  effective_date: string | null
  summary: string
  why_it_applies?: string
  source_url: string
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

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { companyId } = await req.json()
    if (!companyId) return json({ error: 'companyId is required' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Scoped to the caller's own session — RLS ensures they can only read
    // a portfolio company that belongs to their own firm.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: company, error: companyError } = await supabase
      .from('portfolio_companies')
      .select('id, name, sectors, regions, hq_location, firm_id, website, offerings, profile')
      .eq('id', companyId)
      .single()

    if (companyError || !company) return json({ error: 'Company not found or not accessible' }, 404)

    // Needed early for usage logging after each Claude call below —
    // usage_events has no RLS policies for authenticated users.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // auth.uid() resolves server-side from the JWT already attached to
    // `supabase` above — no separate user lookup needed here.
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_function_name: 'company-regulations',
      p_limit: 15,
      p_window_minutes: 60,
    })
    if (!allowed) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)

    const locationDescriptor = company.hq_location || (company.regions ?? []).join(', ') || 'the United States'
    const sectorDescriptor = (company.sectors ?? []).join(' / ') || 'general business'

    // Extra context from the questionnaire so the search targets what this
    // company actually does and where, not just its sector and HQ.
    const p = (company.profile ?? {}) as Record<string, unknown>
    const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '')
    const facts = [
      company.website ? `website ${company.website}` : '',
      company.offerings ? `what it does: ${company.offerings}` : '',
      list(company.regions) ? `operates in: ${list(company.regions)}` : '',
      list(p.customers) ? `customers: ${list(p.customers)}` : '',
      p.consumer_facing === 'yes' ? 'sells directly to consumers' : '',
      list(p.sensitive_data) && !list(p.sensitive_data).includes('None') ? `handles: ${list(p.sensitive_data)}` : '',
      p.regulated === 'Yes' ? `licensed/regulated${list(p.license_types) ? ` (${list(p.license_types)})` : ''}` : '',
      p.gov_contracts === 'Yes' ? `government contractor${list(p.gov_level) ? ` (${list(p.gov_level)})` : ''}` : '',
      p.trade === 'Yes' ? `imports/exports${list(p.trade_regions) ? ` (${list(p.trade_regions)})` : ''}` : '',
      p.outside_us === 'yes' && list(p.foreign_countries) ? `operates abroad in: ${list(p.foreign_countries)}` : '',
    ].filter(Boolean)
    const factsText = facts.length ? ` Known facts about the company — ${facts.join('; ')}.` : ''

    // Step 1: grounded search.
    const searchResult = await callClaude({
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [
        {
          role: 'user',
          content: `Search for regulatory changes published or proposed in the last 90 days that would create compliance obligations for a company in the "${sectorDescriptor}" sector headquartered in ${locationDescriptor}. Include federal, state/local, and (if applicable) foreign regulators. For each distinct item found, report: the exact rule or document title, the issuing regulator/agency, the jurisdiction, the publication or effective date, a one-sentence plain-language summary, which of the company's known facts (sector, location, activity) it applies to, and the official source URL. Only include items you found real sources for — do not invent items.${factsText}`,
        },
      ],
    })

    await recordUsage(admin, {
      functionName: 'company-regulations:search',
      firmId: company.firm_id,
      model: MODEL,
      inputTokens: searchResult.usage?.input_tokens,
      cacheCreationInputTokens: searchResult.usage?.cache_creation_input_tokens,
      cacheReadInputTokens: searchResult.usage?.cache_read_input_tokens,
      outputTokens: searchResult.usage?.output_tokens,
      webSearchRequests: searchResult.usage?.server_tool_use?.web_search_requests,
    })

    const searchText = (searchResult.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')

    // Step 2: force the free-text findings into a strict structured list via
    // tool-choice, so we get reliable fields to store instead of parsing prose.
    const extraction = await callClaude({
      max_tokens: 2048,
      tool_choice: { type: 'tool', name: 'submit_regulations' },
      tools: [
        {
          name: 'submit_regulations',
          description: 'Submit the structured list of distinct regulations found.',
          input_schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    agency: { type: 'string' },
                    jurisdiction: { type: 'string' },
                    published_date: { type: 'string', description: 'YYYY-MM-DD or empty string if unknown' },
                    effective_date: { type: 'string', description: 'YYYY-MM-DD or empty string if unknown' },
                    summary: { type: 'string', description: 'One plain-language sentence' },
                    why_it_applies: {
                      type: 'string',
                      description:
                        "One sentence: which known fact about the company (its sector, location, or a stated activity) this item reaches, as the findings support it. Don't assert facts about the company that weren't given.",
                    },
                    source_url: { type: 'string' },
                  },
                  required: ['title', 'agency', 'jurisdiction', 'summary', 'source_url'],
                },
              },
            },
            required: ['items'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Convert these regulatory findings into the structured tool call. Only include items that have a real source_url from the findings below — never fabricate one.\n\n${searchText}`,
        },
      ],
    })

    await recordUsage(admin, {
      functionName: 'company-regulations:extract',
      firmId: company.firm_id,
      model: MODEL,
      inputTokens: extraction.usage?.input_tokens,
      cacheCreationInputTokens: extraction.usage?.cache_creation_input_tokens,
      cacheReadInputTokens: extraction.usage?.cache_read_input_tokens,
      outputTokens: extraction.usage?.output_tokens,
    })

    const toolUse = (extraction.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
    const items: RegulationItem[] = toolUse?.input?.items ?? []

    const insertedIds: string[] = []
    for (const item of items) {
      if (!item.source_url) continue
      const externalId = `${companyId}:${item.source_url}`
      const { data: reg, error: regError } = await admin
        .from('regulations')
        .upsert(
          {
            source: 'ai_search',
            external_id: externalId,
            title: item.title,
            agency: item.agency,
            jurisdiction: item.jurisdiction,
            summary: item.summary,
            published_date: item.published_date || null,
            effective_date: item.effective_date || null,
            source_url: item.source_url,
            raw: item,
          },
          { onConflict: 'source,external_id' },
        )
        .select('id')
        .single()

      if (regError || !reg) continue

      await admin.from('regulation_relevance').upsert(
        {
          regulation_id: reg.id,
          firm_id: company.firm_id,
          portfolio_company_id: company.id,
          // The model's reason when it gave one; the scan descriptor otherwise
          // (scans before 2026-10-04 stored only this).
          relevance_reason: item.why_it_applies?.trim() || `AI web-search scan for ${company.name} (${sectorDescriptor}, ${locationDescriptor})`,
        },
        { onConflict: 'regulation_id,firm_id,portfolio_company_id,fund_id' },
      )

      insertedIds.push(reg.id)
    }

    // Mark the scan complete even when it found nothing, so the app doesn't
    // keep re-scanning a company whose result is genuinely empty.
    await admin.from('portfolio_companies').update({ last_scanned_at: new Date().toISOString() }).eq('id', company.id)

    // Prepare the detailed impact analysis in the background.
    if (insertedIds.length > 0) EdgeRuntime.waitUntil(generateImpacts(insertedIds, company.firm_id))

    return json({ found: items.length, stored: insertedIds.length })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
