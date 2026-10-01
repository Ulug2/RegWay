// Pulls new/proposed federal rules from the Federal Register API (free,
// official, no key required) and upserts them into the shared `regulations`
// table. Intended to run on a schedule (see Supabase Cron in the dashboard,
// or `supabase functions schedule`) but can also be invoked manually:
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-federal-register \
//     -H "Authorization: Bearer <SERVICE_ROLE_OR_ANON_KEY>"
//
// Optional query param `?since=YYYY-MM-DD` overrides the default 7-day lookback.
//
// Runs two separate queries and merges the results:
// 1. RULE/PRORULE across the tracked agency list below.
// 2. SEC NOTICE-type documents, filtered client-side to just FINRA rule
//    filings (see FINRA_TITLE_MARKER below for why). NOTICE type is
//    otherwise deliberately excluded — blanket inclusion runs ~6,000
//    documents/9mo across these agencies, mostly administrative noise, a
//    volume/cost mismatch against match-relevance's per-user rate limit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'federal_register'

const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json'

// Safety cap on how many pages we'll follow in one sync run. Generous for
// any realistic daily/weekly sync or even a multi-month backfill, while
// still bounding a pathological request (e.g. a `since` date years back).
const MAX_PAGES = 20

// Agencies relevant to a PE firm's GP operations, fund structures, and
// typical portfolio-company sectors: securities/derivatives regulators,
// banking/financial-services regulators, tax, labor, competition, and the
// sector-specific bodies (energy, healthcare, transportation, environment).
// Extend this list as new portfolio-company sectors are added.
//
// Evaluated but deliberately excluded (see prompts/09-agency-list-investigate.md
// for the volume data behind these calls):
// - 'treasury-department' (the generic parent department): 157 RULE/PRORULE
//   items in a 9-month sample, almost entirely duplicate tagging of the same
//   joint OCC/FDIC/Fed rules already covered by the specific bureaus below,
//   plus unrelated noise. Redundant once those bureaus are tracked directly.
// - 'antitrust-division': 0 RULE/PRORULE items in the same 9-month sample —
//   DOJ antitrust activity is enforcement actions/consent decrees, not
//   codified rules, so it yields nothing under this pipeline's RULE/PRORULE
//   filter. Blanket NOTICE-type inclusion was evaluated and rejected (see
//   FINRA_TITLE_MARKER below) — not revisiting this exclusion via that path.
const AGENCY_SLUGS = [
  'securities-and-exchange-commission',
  'commodity-futures-trading-commission',
  'internal-revenue-service',
  'labor-department',
  'environmental-protection-agency',
  'federal-energy-regulatory-commission',
  'health-and-human-services-department',
  'federal-motor-carrier-safety-administration',
  'consumer-financial-protection-bureau',
  'federal-reserve-system',
  'comptroller-of-the-currency',
  'federal-deposit-insurance-corporation',
  'financial-crimes-enforcement-network',
  'federal-trade-commission',
  'national-labor-relations-board',
]

interface FederalRegisterDocument {
  document_number: string
  title: string
  abstract: string | null
  publication_date: string
  effective_on: string | null
  html_url: string
  agencies: { name: string; slug: string }[]
  type: string
}

const TRACKED_SLUGS = new Set(AGENCY_SLUGS)

// A document's `agencies` array often lists the parent department first even
// when a specific bureau we track (e.g. Comptroller of the Currency, FinCEN)
// is what actually matched our query — Federal Register's own convention,
// not something specific to this document. Picking `agencies[0]` blindly
// mislabels those as the generic parent. Prefer whichever entry's slug is
// one we actually track, falling back to the first entry if somehow none
// match (shouldn't happen, since the query itself filtered on these slugs).
function primaryAgency(doc: FederalRegisterDocument) {
  return doc.agencies?.find(a => TRACKED_SLUGS.has(a.slug)) ?? doc.agencies?.[0]
}

// FINRA has no Federal Register agency slug of its own — it's a private
// self-regulatory organization, not a federal agency, so it only ever
// appears inside SEC-filed notices. The API's `conditions[term]` full-text
// search isn't a precise entity filter (even an exact quoted phrase only
// matched the true subject in ~45% of results in testing — most hits were
// other exchanges' filings that merely reference FINRA in body text), so
// instead of trying to filter server-side, fetch all SEC NOTICE-type
// documents (modest volume — ~7/day normally) and filter client-side on
// the title, which reliably follows the pattern
// "Self-Regulatory Organizations; <SRO Name>; <action>" whenever an SRO is
// the actual subject.
const FINRA_TITLE_MARKER = 'Financial Industry Regulatory Authority'

interface FederalRegisterQuery {
  agencies: string[]
  types: string[]
}

async function fetchAllPages(since: string, query: FederalRegisterQuery): Promise<{ documents: FederalRegisterDocument[]; pages: number }> {
  const documents: FederalRegisterDocument[] = []
  let page = 1

  while (page <= MAX_PAGES) {
    const params = new URLSearchParams()
    for (const slug of query.agencies) params.append('conditions[agencies][]', slug)
    for (const type of query.types) params.append('conditions[type][]', type)
    params.set('conditions[publication_date][gte]', since)
    params.set('order', 'newest')
    params.set('per_page', '100')
    params.set('page', String(page))

    const res = await fetch(`${FEDERAL_REGISTER_API}?${params.toString()}`)
    if (!res.ok) throw new Error(`Federal Register API error: ${res.status} ${await res.text()}`)

    const data = await res.json()
    const results: FederalRegisterDocument[] = data.results ?? []
    if (results.length === 0) break

    documents.push(...results)
    page += 1
  }

  return { documents, pages: page - 1 }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const since =
      new URL(req.url).searchParams.get('since') ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [rulesResult, noticesResult] = await Promise.all([
      fetchAllPages(since, { agencies: AGENCY_SLUGS, types: ['RULE', 'PRORULE'] }),
      fetchAllPages(since, { agencies: ['securities-and-exchange-commission'], types: ['NOTICE'] }),
    ])

    const finraNotices = noticesResult.documents.filter(doc => doc.title.includes(FINRA_TITLE_MARKER))
    const documents = [...rulesResult.documents, ...finraNotices]

    const rows = documents.map(doc => {
      const agencyName = primaryAgency(doc)?.name ?? null
      return {
        source: 'federal_register' as const,
        external_id: doc.document_number,
        title: doc.title,
        agency: agencyName,
        jurisdiction: agencyName ? `${agencyName} · Federal` : 'Federal Register',
        summary: doc.abstract,
        published_date: doc.publication_date,
        effective_date: doc.effective_on,
        source_url: doc.html_url,
        raw: doc,
      }
    })

    if (rows.length > 0) {
      const { error } = await admin.from('regulations').upsert(rows, { onConflict: 'source,external_id' })
      if (error) throw error
    }

    await recordSyncRun(admin, SOURCE, true, `${rows.length} synced (${finraNotices.length} FINRA notices)`)

    return json({
      synced: rows.length,
      since,
      rulesPages: rulesResult.pages,
      noticesPages: noticesResult.pages,
      finraNotices: finraNotices.length,
      agencies: AGENCY_SLUGS,
    })
  } catch (err) {
    await recordSyncRun(admin, SOURCE, false, (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
