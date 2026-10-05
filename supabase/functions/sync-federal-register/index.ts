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
// Runs every query in FEEDS below and merges the results. Each feed is one
// Federal Register query plus an optional client-side filter. Adding a
// source is one new entry there, not a new code path. NOTICE type is
// deliberately excluded except where a feed filters it down: blanket
// inclusion runs ~6,000 documents/9mo across these agencies, mostly
// administrative noise, a volume/cost mismatch against the matchers' per-user
// rate limits.
//
// Every row gets a `category` (see categoryOf: sanctions, export-control and
// trade-action documents are `geopolitical`, everything else `regulatory`)
// and the `countries` it names (see _shared/countries.ts), which the
// geopolitical matcher pre-filters on.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { extractCountries } from '../_shared/countries.ts'
import { federalRegisterTextUrl, federalRegisterTextUrls } from '../_shared/federalRegister.ts'
import { sanctionsProgramCountries } from '../_shared/sanctionsPrograms.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'
import { fetchPlainText } from '../_shared/text.ts'

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
//
// 2026-10-02 expansion (healthcare + trade/sanctions, from the regulatory
// source registry doc), each confirmed via real 9-month volume before
// adding — same bar as the original list:
// - 'food-and-drug-administration' (88) and 'centers-for-medicare-medicaid-services'
//   (28): every sampled document from both is *also* tagged with the
//   already-tracked 'health-and-human-services-department' parent, so these
//   were already being synced — just mislabeled as generic "Health and
//   Human Services Department" via `primaryAgency()`'s fallback, the same
//   bug class as the earlier OCC/FinCEN mislabeling. Adding the specific
//   slugs doesn't meaningfully change sync volume, it fixes the label.
// - 'drug-enforcement-administration' (21), 'foreign-assets-control-office'
//   (20, sanctions), 'industry-and-security-bureau' (20, export controls),
//   'u-s-customs-and-border-protection' (15): genuinely new coverage — each
//   tags only with its own (untracked, correctly so) parent department
//   (Justice/Treasury/Commerce/Homeland Security respectively), so none of
//   this was reaching the feed before. All four volumes are in the same
//   range as existing tracked agencies (e.g. SEC 25, FDIC 12, FTC 10 over
//   the same window) — not noise.
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
  'food-and-drug-administration',
  'centers-for-medicare-medicaid-services',
  'drug-enforcement-administration',
  'foreign-assets-control-office',
  'industry-and-security-bureau',
  'u-s-customs-and-border-protection',
]

interface FederalRegisterDocument {
  document_number: string
  title: string
  abstract: string | null
  publication_date: string
  effective_on: string | null
  html_url: string
  agencies: { name: string; slug: string; parent_id: number | null }[]
  type: string
}

// A document's `agencies` array often lists the parent department first even
// when a specific bureau we track (e.g. Comptroller of the Currency, FinCEN)
// is what actually matched our query — Federal Register's own convention,
// not something specific to this document. Picking `agencies[0]` blindly
// mislabels those as the generic parent.
//
// Since the 2026-10-02 expansion tracks both a parent (HHS) and its own
// children (FDA, CMS), a naive "first tracked match" still picks the
// parent — it's listed first and is tracked too, so `.find()` short-circuits
// before reaching the more specific child. Prefer whichever tracked entry
// has a parent_id (a sub-agency) over one without (a top-level department),
// falling back to the first tracked match, then the first entry overall.
function primaryAgency(doc: FederalRegisterDocument) {
  const tracked = doc.agencies?.filter(a => TRACKED_SLUGS.has(a.slug)) ?? []
  return tracked.find(a => a.parent_id != null) ?? tracked[0] ?? doc.agencies?.[0]
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

// Sanctions (OFAC), export controls (BIS) and trade actions (USTR) are
// geopolitical developments per the spec's own definition (§8: "sanctions
// announcements, tariffs, trade restrictions"), not ordinary rulemaking —
// they're matched on where an entity operates and sources from, not on its
// sector or fund structure, so they go through match-geopolitical-relevance.
const GEOPOLITICAL_AGENCY_SLUGS = new Set([
  'foreign-assets-control-office',
  'industry-and-security-bureau',
  'trade-representative-office-of-united-states',
])

// Presidential documents are mostly ceremonial (heritage months, days of
// observance). The ones that matter here create or extend a sanctions
// program (IEEPA national emergencies, blocking orders) or change trade
// terms (Section 232/301 tariff proclamations).
// Word forms matter: titles say "Importation", "Duty-Free", "Trading With
// the Enemy Act" (the Cuba program) as often as "imports" or "tariffs".
const GEOPOLITICAL_TOPIC_PATTERN =
  /\b(sanctions?|sanctioned|tariffs?|duty|duties|imports?|importation|exports?|exportation|embargo(es)?|national emergency|blocking property|International Emergency Economic Powers|Trading With the Enemy|Section 232|Section 301|trade|customs|de minimis)\b/i

// USTR's NOTICE stream also carries advisory-committee nominations and
// hearing logistics; keep only actual trade actions.
const TRADE_ACTION_PATTERN = /\b(tariffs?|duties|Section 301|Section 232|imports?|exports?|trade (action|agreement|preference)s?|exclusions?)\b/i

interface FederalRegisterQuery {
  agencies: string[]
  types: string[]
}

type Category = 'regulatory' | 'geopolitical'

interface Feed {
  name: string
  query: FederalRegisterQuery
  // Client-side filter for feeds whose server-side query is broader than
  // what we want (the API has no precise topic filter).
  keep?: (doc: FederalRegisterDocument) => boolean
  // Forces a category for the whole feed; otherwise categoryOf decides.
  category?: Category
  // Read countries from the document's full text, not just title/abstract,
  // for feeds whose abstract is boilerplate (see ofacNotices).
  countriesFromFullText?: boolean
}

const docText = (doc: FederalRegisterDocument) => `${doc.title} ${doc.abstract ?? ''}`

const FEEDS: Feed[] = [
  { name: 'rules', query: { agencies: AGENCY_SLUGS, types: ['RULE', 'PRORULE'] } },
  {
    name: 'finraNotices',
    query: { agencies: ['securities-and-exchange-commission'], types: ['NOTICE'] },
    keep: doc => doc.title.includes(FINRA_TITLE_MARKER),
  },
  // OFAC publishes each round of SDN designations as a "Notice of OFAC
  // Sanctions Actions": the official record of who was sanctioned and under
  // which program. Every one carries the same boilerplate abstract, and the
  // designee list itself is usually an image, so the countries come from the
  // full text: any it names, plus the country of the sanctions program its
  // authority line cites (_shared/sanctionsPrograms.ts). ~5 notices a week.
  { name: 'ofacNotices', query: { agencies: ['foreign-assets-control-office'], types: ['NOTICE'] }, countriesFromFullText: true },
  {
    name: 'tradeActions',
    query: { agencies: ['trade-representative-office-of-united-states'], types: ['RULE', 'PRORULE', 'NOTICE'] },
    keep: doc => TRADE_ACTION_PATTERN.test(docText(doc)),
  },
  {
    name: 'presidentialDocuments',
    query: { agencies: [], types: ['PRESDOCU'] },
    keep: doc => GEOPOLITICAL_TOPIC_PATTERN.test(docText(doc)),
    category: 'geopolitical',
  },
]

// Every agency any feed queries, so primaryAgency labels a USTR or OFAC
// notice by that office rather than its parent (Executive Office of the
// President, Treasury), which Federal Register lists first.
const TRACKED_SLUGS = new Set(FEEDS.flatMap(feed => feed.query.agencies))

interface Countries {
  countries: string[]
  // Whether the full text was actually read (not just title/abstract).
  // Stored as raw.countries_from_full_text so later runs can reuse it.
  fromFullText: boolean
}

// `known`: countries already read from this document's full text by an
// earlier run. The sync runs every 30 minutes over a 7-day window, so
// without this every OFAC notice would be re-downloaded ~48 times a day. A
// document whose text couldn't be read last time (e.g. blocked) isn't in
// `known` and is tried again.
async function countriesOf(doc: FederalRegisterDocument, feed: Feed, known: Map<string, string[]>): Promise<Countries> {
  if (!feed.countriesFromFullText) return { countries: extractCountries(docText(doc)), fromFullText: false }
  const stored = known.get(doc.document_number)
  if (stored) return { countries: stored, fromFullText: true }
  const body = await fetchPlainText(federalRegisterTextUrls(doc), { minLength: 200 })
  const countries = [...new Set([...extractCountries(`${docText(doc)} ${body}`), ...sanctionsProgramCountries(body)])]
  return { countries, fromFullText: !!body }
}

// Countries already read from full text, for the documents about to be
// synced (see countriesOf).
async function countriesReadBefore(admin: SupabaseClient, documentNumbers: string[]): Promise<Map<string, string[]>> {
  const known = new Map<string, string[]>()
  for (let i = 0; i < documentNumbers.length; i += 100) {
    const { data, error } = await admin
      .from('regulations')
      .select('external_id, countries')
      .eq('source', SOURCE)
      .eq('raw->>countries_from_full_text', 'true')
      .in('external_id', documentNumbers.slice(i, i + 100))
    if (error) throw error
    for (const r of data ?? []) known.set(r.external_id, r.countries ?? [])
  }
  return known
}

// Bounded parallelism for the per-document full-text fetches, so a long
// backfill doesn't open a hundred connections to federalregister.gov at once.
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function categoryOf(doc: FederalRegisterDocument, feed: Feed): Category {
  if (feed.category) return feed.category
  return doc.agencies?.some(a => GEOPOLITICAL_AGENCY_SLUGS.has(a.slug)) ? 'geopolitical' : 'regulatory'
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

function documentRow(doc: FederalRegisterDocument, feed: Feed, countries: Countries, today: string) {
  const agencyName = primaryAgency(doc)?.name ?? null
  return {
    source: SOURCE,
    category: categoryOf(doc, feed),
    countries: countries.countries,
    external_id: doc.document_number,
    title: doc.title,
    agency: agencyName,
    jurisdiction: agencyName ? `${agencyName} · Federal` : 'Federal Register',
    summary: doc.abstract,
    published_date: doc.publication_date,
    effective_date: doc.effective_on,
    source_url: doc.html_url,
    on_public_inspection: doc.publication_date > today,
    raw: { ...doc, raw_text_url: federalRegisterTextUrl(doc), countries_from_full_text: countries.fromFullText },
  }
}

// The documents search also returns documents scheduled for a future issue
// (filed and on public inspection, typically 1-3 days ahead), so they're
// ingested early by the same feeds; a separate public-inspection feed was
// checked and adds no lead time (2026-10-04: every tracked rule on the
// public-inspection list was already here). Flag them so the app says
// "Publishes <date>", not "Published", until their issue date. Federal
// Register issues are dated in Eastern time; the 30-minute sync re-upserts
// each document after its date, which clears the flag.
const todayEastern = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

const DEFAULT_LOOKBACK_DAYS = 7
// The furthest back `?since=` may reach. This endpoint accepts the
// publishable key (cron uses it), so anyone can call it: an unbounded date
// would let a stranger start a years-long backfill.
const MAX_LOOKBACK_DAYS = 400

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// The start date to sync from, or an error message for a bad `?since=`.
function sinceDate(param: string | null): { since: string } | { error: string } {
  if (param === null) return { since: daysAgo(DEFAULT_LOOKBACK_DAYS) }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param) || Number.isNaN(Date.parse(param))) return { error: 'since must be a date, YYYY-MM-DD' }
  if (param < daysAgo(MAX_LOOKBACK_DAYS)) return { error: `since can be at most ${MAX_LOOKBACK_DAYS} days back` }
  return { since: param }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const requested = sinceDate(new URL(req.url).searchParams.get('since'))
  if ('error' in requested) return json({ error: requested.error }, 400)
  const { since } = requested

  try {

    const results = await Promise.all(
      FEEDS.map(async feed => {
        const { documents, pages } = await fetchAllPages(since, feed.query)
        return { feed, pages, documents: feed.keep ? documents.filter(feed.keep) : documents }
      }),
    )

    const fullTextDocs = results.filter(r => r.feed.countriesFromFullText).flatMap(r => r.documents.map(d => d.document_number))
    const known = await countriesReadBefore(admin, fullTextDocs)

    const today = todayEastern()
    // Keyed by document number: one document can come back from more than
    // one feed, and a single upsert can't touch the same row twice.
    const rowsById = new Map<string, Record<string, unknown>>()
    for (const { feed, documents } of results) {
      const countries = await mapLimited(documents, 4, doc => countriesOf(doc, feed, known))
      documents.forEach((doc, i) => rowsById.set(doc.document_number, documentRow(doc, feed, countries[i], today)))
    }
    const rows = [...rowsById.values()]

    if (rows.length > 0) {
      const { error } = await admin.from('regulations').upsert(rows, { onConflict: 'source,external_id' })
      if (error) throw error
    }

    const perFeed = Object.fromEntries(results.map(r => [r.feed.name, { documents: r.documents.length, pages: r.pages }]))
    const geopolitical = rows.filter(r => r.category === 'geopolitical').length
    const feedSummary = results.map(r => `${r.feed.name} ${r.documents.length}`).join(', ')
    const scheduled = rows.filter(r => r.on_public_inspection).length
    await recordSyncRun(admin, SOURCE, true, `${rows.length} synced, ${geopolitical} geopolitical (${feedSummary}); ${scheduled} not yet published`)

    return json({
      synced: rows.length,
      geopolitical,
      since,
      feeds: perFeed,
      notYetPublished: scheduled,
      fullTextReads: fullTextDocs.length - known.size,
    })
  } catch (err) {
    await recordSyncRun(admin, SOURCE, false, (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
