// Polls the regulator feeds in _shared/regulatorFeeds.ts (U.S. agencies'
// own announcements, UK and EU sources, UK and EU sanctions) and stores the entries each feed's
// rule keeps into `regulations`. Free: no AI call, no key. New rows are
// picked up by run-matching ten minutes later, where each firm's matcher
// reads only the regions that firm is connected to.
//
// One feed failing doesn't stop the others. The run is recorded once, as
// source `regulator_feeds`. A single miss is normal (sec.gov rate-limits
// cloud addresses now and then) and the next poll is 30 minutes away, so
// the run only counts as failed, and shows in the dashboard's failing-source
// banner, once a feed has failed several runs in a row.
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-regulator-feeds \
//     -H "Authorization: Bearer <SERVICE_ROLE_OR_ANON_KEY>"

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { extractCountries } from '../_shared/countries.ts'
import { HOME_COUNTRIES, JURISDICTION, REGULATOR_FEEDS, type RegulatorFeed } from '../_shared/regulatorFeeds.ts'
import { parseFeedEntries } from '../_shared/rss.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'regulator_feeds'
// A feed lists its latest 10–100 entries, some of them months old; only
// recent ones are news, and the cap bounds what a first run brings in.
const MAX_AGE_DAYS = 30
const MAX_PER_FEED = 40
const SUMMARY_CHARS = 600
const RETRY_DELAY_MS = 1500
// Consecutive failed runs (1.5 hours of polls) before a feed counts as down.
const FAILURES_BEFORE_DOWN = 3

interface FeedResult {
  source: string
  url: string
  inFeed: number
  kept: number
  new: number
  error?: string
  // Runs in a row this feed has failed, this one included.
  failures?: number
}

const feedKey = (f: { source: string; url: string }) => `${f.source} ${f.url}`

// How many runs in a row each feed had failed as of the last run.
async function earlierFailures(admin: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await admin.from('sync_runs').select('stats').eq('source', SOURCE).order('ran_at', { ascending: false }).limit(1).maybeSingle()
  const feeds = ((data?.stats as { feeds?: FeedResult[] } | null)?.feeds ?? []) as FeedResult[]
  return new Map(feeds.map(f => [feedKey(f), f.error ? (f.failures ?? 1) : 0]))
}

// Stable and unique per entry: the page's path, plus the query where the
// site addresses documents by parameter (EUR-Lex: `?uri=CELEX:…`).
function externalId(link: string): string {
  const url = new URL(link)
  return url.pathname.replace(/\/$/, '') + url.search
}

// sec.gov answers 429 now and then to a first request from a shared cloud
// address and accepts the next one; one retry, not a loop.
async function fetchFeed(url: string): Promise<Response> {
  const get = () =>
    fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    })
  const res = await get()
  if (res.status !== 429 && res.status < 500) return res
  await res.body?.cancel()
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
  return get()
}

// A geopolitical entry is matched by the countries it names (never the
// publisher's own). Null when it names none: it would otherwise be a
// "global" candidate for every firm with any foreign footprint.
function countriesNamed(feed: RegulatorFeed, text: string): string[] | null {
  const countries = extractCountries(text).filter(c => !HOME_COUNTRIES[feed.region].includes(c))
  return countries.length ? countries : null
}

// Two feeds can read the same URL (a regulatory rule and a sanctions rule
// over one publication stream): fetched once per run.
type Fetched = Map<string, Promise<string>>

function feedXml(url: string, fetched: Fetched): Promise<string> {
  let xml = fetched.get(url)
  if (!xml) {
    xml = fetchFeed(url).then(res => {
      if (!res.ok) throw new Error(`returned ${res.status}`)
      return res.text()
    })
    fetched.set(url, xml)
  }
  return xml
}

async function syncFeed(admin: SupabaseClient, feed: RegulatorFeed, today: Date, fetched: Fetched): Promise<FeedResult> {
  const result: FeedResult = { source: feed.source, url: feed.url, inFeed: 0, kept: 0, new: 0 }
  try {
    const xml = await feedXml(feed.url, fetched)
    const entries = parseFeedEntries(xml)
    // An error or block page served with a 200 isn't a feed at all. A real
    // feed with nothing in it is fine (EUR-Lex's is empty for part of each day).
    if (entries.length === 0 && !/<(rss|feed|rdf:RDF)[\s>]/.test(xml)) throw new Error('returned something that is not a feed')
    result.inFeed = entries.length

    const oldest = new Date(today.getTime() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10)
    const rows = new Map<string, Record<string, unknown>>()
    for (const entry of entries) {
      if (!entry.date || entry.date < oldest || !feed.keep(entry)) continue
      let id: string
      try {
        id = externalId(entry.link)
      } catch {
        continue
      }
      if (rows.size >= MAX_PER_FEED || rows.has(id)) continue
      const title = (feed.cleanTitle?.(entry.title) ?? entry.title).slice(0, 500)
      const countries = feed.category === 'geopolitical' ? countriesNamed(feed, `${title} ${entry.description}`) : []
      if (!countries) continue
      rows.set(id, {
        source: feed.source,
        category: feed.category,
        external_id: id,
        title,
        agency: feed.agency,
        jurisdiction: JURISDICTION[feed.region],
        summary: (entry.description || title).slice(0, SUMMARY_CHARS),
        published_date: entry.date,
        effective_date: null,
        source_url: entry.link,
        countries,
        raw: { feed: feed.url },
      })
    }
    result.kept = rows.size
    if (rows.size === 0) return result

    const known = () => admin.from('regulations').select('external_id').eq('source', feed.source).in('external_id', [...rows.keys()])
    let { data: existing, error: readError } = await known()
    // The database now and then refuses a freshly started function's first
    // queries ("JWT issued at future": clock skew of a moment); once more.
    if (readError) ({ data: existing, error: readError } = await known())
    if (readError) throw readError
    for (const row of existing ?? []) rows.delete(row.external_id)
    result.new = rows.size
    if (rows.size > 0) {
      const { error } = await admin.from('regulations').upsert([...rows.values()], { onConflict: 'source,external_id', ignoreDuplicates: true })
      if (error) throw error
    }
  } catch (err) {
    result.error = (err as Error).message
  }
  return result
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = new Date()
  const fetched: Fetched = new Map()
  const [feeds, before] = await Promise.all([Promise.all(REGULATOR_FEEDS.map(feed => syncFeed(admin, feed, today, fetched))), earlierFailures(admin)])
  for (const feed of feeds) if (feed.error) feed.failures = (before.get(feedKey(feed)) ?? 0) + 1

  const failed = feeds.filter(f => f.error)
  const down = failed.filter(f => (f.failures ?? 0) >= FAILURES_BEFORE_DOWN)
  const total = (key: 'kept' | 'new') => feeds.reduce((sum, f) => sum + f[key], 0)
  const detail = `${total('new')} new of ${total('kept')} kept from ${feeds.length - failed.length} of ${feeds.length} feeds${failed.length ? `; failed: ${failed.map(f => `${f.source} (${f.error}${(f.failures ?? 1) > 1 ? `, ${f.failures} runs in a row` : ''})`).join(', ')}` : ''}`
  // Every feed failing at once isn't a publisher's hiccup.
  const ok = down.length === 0 && failed.length < feeds.length
  await recordSyncRun(admin, SOURCE, ok, detail, { feeds })
  return json({ new: total('new'), kept: total('kept'), feeds }, failed.length === feeds.length ? 502 : 200)
})
