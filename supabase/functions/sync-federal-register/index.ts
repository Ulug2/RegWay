// Pulls new/proposed federal rules from the Federal Register API (free,
// official, no key required) and upserts them into the shared `regulations`
// table. Intended to run on a schedule (see Supabase Cron in the dashboard,
// or `supabase functions schedule`) but can also be invoked manually:
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-federal-register \
//     -H "Authorization: Bearer <SERVICE_ROLE_OR_ANON_KEY>"
//
// Optional query param `?since=YYYY-MM-DD` overrides the default 7-day lookback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'

const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json'

// Safety cap on how many pages we'll follow in one sync run. Generous for
// any realistic daily/weekly sync or even a multi-month backfill, while
// still bounding a pathological request (e.g. a `since` date years back).
const MAX_PAGES = 20

// Agencies most relevant to a PE firm's GP operations, fund structures, and
// typical portfolio-company sectors. Extend this list as new sectors are added.
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
]

interface FederalRegisterDocument {
  document_number: string
  title: string
  abstract: string | null
  publication_date: string
  effective_on: string | null
  html_url: string
  agencies: { name: string }[]
  type: string
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const since =
      new URL(req.url).searchParams.get('since') ??
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const documents: FederalRegisterDocument[] = []
    let page = 1

    while (page <= MAX_PAGES) {
      const params = new URLSearchParams()
      for (const slug of AGENCY_SLUGS) params.append('conditions[agencies][]', slug)
      params.append('conditions[type][]', 'RULE')
      params.append('conditions[type][]', 'PRORULE')
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

    const rows = documents.map(doc => ({
      source: 'federal_register' as const,
      external_id: doc.document_number,
      title: doc.title,
      agency: doc.agencies?.[0]?.name ?? null,
      jurisdiction: doc.agencies?.[0]?.name ? `${doc.agencies[0].name} · Federal` : 'Federal Register',
      summary: doc.abstract,
      published_date: doc.publication_date,
      effective_date: doc.effective_on,
      source_url: doc.html_url,
      raw: doc,
    }))

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (rows.length > 0) {
      const { error } = await admin.from('regulations').upsert(rows, { onConflict: 'source,external_id' })
      if (error) throw error
    }

    return json({ synced: rows.length, since, pages: page - 1, agencies: AGENCY_SLUGS })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
