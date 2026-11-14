// Links later versions of a development to its first version
// (`regulations.duplicate_of`), so every list shows one card for it with the
// other versions as "also published as" links (roadmap item 15). The rules
// are in _shared/duplicates.ts.
//
// Runs after the syncs and before run-matching. Platform-wide, not per firm:
// whether two documents are the same development does not depend on who is
// reading. Each row is looked at once (`duplicates_checked_at`); a run with
// nothing new makes three small queries and no AI call.
//
// Only the announcement-to-Federal-Register rule calls a model (Haiku, one
// short call per new SEC, FTC or CFPB document that has a recent
// announcement to compare with), so this takes the service key, like
// run-matching.
//
//   POST /functions/v1/group-duplicates   {}                  (cron)
//   POST /functions/v1/group-duplicates   { "dryRun": true }  — report the links, write nothing
//   Authorization: Bearer <service key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import {
  ANNOUNCEMENT_LAG_DAYS,
  ANNOUNCEMENT_LEAD_DAYS,
  ANNOUNCING_AGENCIES,
  PAIR_DAYS,
  SAME_TITLE_SOURCES,
  VERSION_COLUMNS,
  announcementBody,
  announcementsFor,
  federalRegisterNumber,
  linkDuplicate,
  matchAnnouncement,
  neverAnnounced,
  sameTitleGroups,
  sanctionsPairs,
  scanResultLinks,
  type Link,
  type Version,
} from '../_shared/duplicates.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'
import { fetchPlainText } from '../_shared/text.ts'
import { automaticAiPaused } from '../_shared/ai/switch.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const SOURCE = 'duplicates'
// Older rows are never looked at: nothing new will be published for them.
const WINDOW_DAYS = 90
const MAX_ROWS = 300
// Model calls per run; documents beyond this wait for the next run.
const MAX_AI_CALLS = 30
const AI_CONCURRENCY = 5
const UPDATE_CHUNK = 100
const RETRY_DELAY_MS = 1000

const FEED_SOURCES = [...SAME_TITLE_SOURCES, 'eu_sanctions']
const AGENCIES = [...new Set(Object.values(ANNOUNCING_AGENCIES))]

type FederalRegisterVersion = Version & { external_id: string }

interface RunStats {
  checked: number
  links: (Link & { rule: string; secondaryTitle?: string; primaryTitle?: string })[]
  aiCalls: number
  backlog: boolean
  errors: string[]
}

const day = (date: Date) => date.toISOString().slice(0, 10)
const shifted = (isoDay: string, days: number) => day(new Date(Date.parse(isoDay) + days * 86_400_000))

// The database now and then refuses a freshly started function's first
// queries ("JWT issued at future": clock skew of a moment), so a read that
// fails is made once more.
async function rows<T>(query: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  let { data, error } = await query()
  if (error) {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    ;({ data, error } = await query())
  }
  if (error) throw new Error((error as { message?: string }).message ?? String(error))
  return (data ?? []) as T[]
}

// Federal Register documents published around a new announcement were
// compared before it existed: they get another look.
async function reopenDocuments(admin: SupabaseClient, announcements: Version[]): Promise<void> {
  for (const a of announcements) {
    if (!a.published_date) continue
    const { error } = await admin
      .from('regulations')
      .update({ duplicates_checked_at: null })
      .eq('source', 'federal_register')
      .eq('agency', ANNOUNCING_AGENCIES[a.source])
      .is('duplicate_of', null)
      .not('duplicates_checked_at', 'is', null)
      .gte('published_date', shifted(a.published_date, -ANNOUNCEMENT_LAG_DAYS))
      .lte('published_date', shifted(a.published_date, ANNOUNCEMENT_LEAD_DAYS))
    if (error) throw error
  }
}

// The Federal Register rows a company scan's results could be: by document
// number in the link, or by an identical title.
async function federalRegisterMatches(admin: SupabaseClient, scanned: Version[]): Promise<FederalRegisterVersion[]> {
  const columns = `${VERSION_COLUMNS}, external_id`
  const numbers = [...new Set(scanned.map(s => federalRegisterNumber(s.source_url)).filter((n): n is string => !!n))]
  const found = numbers.length ? await rows<FederalRegisterVersion>(() => admin.from('regulations').select(columns).eq('source', 'federal_register').in('external_id', numbers)) : []
  for (const title of new Set(scanned.filter(s => !federalRegisterNumber(s.source_url)).map(s => s.title))) {
    found.push(...(await rows<FederalRegisterVersion>(() => admin.from('regulations').select(columns).eq('source', 'federal_register').eq('title', title).limit(3))))
  }
  return [...new Map(found.map(f => [f.id, f])).values()]
}

async function run(admin: SupabaseClient, dryRun: boolean): Promise<RunStats> {
  const stats: RunStats = { checked: 0, links: [], aiCalls: 0, backlog: false, errors: [] }
  const since = shifted(day(new Date()), -WINDOW_DAYS)
  const unchecked = () => admin.from('regulations').select(VERSION_COLUMNS).is('duplicates_checked_at', null)

  const [feedRows, scanRows] = await Promise.all([
    rows<Version>(() => unchecked().in('source', FEED_SOURCES).gte('published_date', since).limit(MAX_ROWS)),
    rows<Version>(() => unchecked().eq('source', 'ai_search').limit(MAX_ROWS)),
  ])
  const titles = new Map<string, string>([...feedRows, ...scanRows].map(r => [r.id, r.title]))
  const add = (rule: string, links: Link[]) => stats.links.push(...links.map(l => ({ ...l, rule })))

  // 1. Same act published twice by one source (no AI).
  if (feedRows.length) {
    const earliest = feedRows.map(r => r.published_date ?? since).sort()[0]
    const pool = await rows<Version>(() =>
      admin.from('regulations').select(VERSION_COLUMNS).in('source', [...new Set(feedRows.map(r => r.source))]).gte('published_date', shifted(earliest, -PAIR_DAYS)).limit(1000),
    )
    for (const r of pool) titles.set(r.id, r.title)
    add('sanctions pair', sanctionsPairs(pool.filter(r => r.source === 'eu_sanctions')))
    add('same title', sameTitleGroups(pool.filter(r => SAME_TITLE_SOURCES.includes(r.source))))
  }

  // 2. A company scan's result that is a Federal Register document (no AI).
  if (scanRows.length) {
    const documents = await federalRegisterMatches(admin, scanRows)
    for (const d of documents) titles.set(d.id, d.title)
    add('scan result', scanResultLinks(scanRows, documents))
  }

  // 3. Federal Register documents against the agency's announcements.
  const newAnnouncements = feedRows.filter(r => r.source in ANNOUNCING_AGENCIES)
  if (!dryRun) await reopenDocuments(admin, newAnnouncements)

  const documents = await rows<Version>(() =>
    unchecked().eq('source', 'federal_register').in('agency', AGENCIES).is('duplicate_of', null).gte('published_date', since).order('published_date').limit(MAX_ROWS),
  )
  const announcements = documents.length
    ? await rows<Version>(() =>
        admin.from('regulations').select(VERSION_COLUMNS).in('source', Object.keys(ANNOUNCING_AGENCIES)).gte('published_date', shifted(since, -ANNOUNCEMENT_LEAD_DAYS)).limit(1000),
      )
    : []
  for (const r of [...documents, ...announcements]) titles.set(r.id, r.title)

  const checked = new Set<string>([...feedRows, ...scanRows].map(r => r.id))
  const toCompare: { document: Version; candidates: Version[] }[] = []
  for (const document of documents) {
    const candidates = neverAnnounced(document) ? [] : announcementsFor(document, announcements)
    if (candidates.length === 0) checked.add(document.id)
    // Paused: left unchecked, so a later run compares it.
    else if (!automaticAiPaused() && toCompare.length < MAX_AI_CALLS) toCompare.push({ document, candidates })
    else stats.backlog = true
  }

  // Each press release's page is read once per run, and only when a
  // document is about to be compared with it. A page that can't be read
  // (sec.gov turns cloud addresses away now and then) leaves the summary.
  const pages = new Map<string, Promise<string>>()
  const body = (a: Version) => {
    if (!pages.has(a.id)) pages.set(a.id, fetchPlainText([a.source_url]).then(text => announcementBody(text, a)).catch(() => ''))
    return pages.get(a.id)!
  }
  const bodies = async (candidates: Version[]) => new Map(await Promise.all(candidates.map(async a => [a.id, await body(a)] as const)))

  let next = 0
  let failed = false
  const worker = async () => {
    while (next < toCompare.length && !failed) {
      const { document, candidates } = toCompare[next++]
      try {
        stats.aiCalls++
        const index = await matchAnnouncement(admin, document, candidates, await bodies(candidates))
        // The document points at its announcement whichever came first by
        // a day or two (one announcement can cover several documents).
        if (index !== null) add('announcement', [{ secondary: document.id, primary: candidates[index].id }])
        checked.add(document.id)
      } catch (err) {
        // The provider refusing calls: the rest wait for the next run.
        failed = true
        stats.backlog = true
        const message = (err as Error).message.slice(0, 200)
        if (!stats.errors.includes(message)) stats.errors.push(message)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, toCompare.length) }, worker))

  stats.checked = checked.size
  for (const link of stats.links) {
    link.secondaryTitle = titles.get(link.secondary)
    link.primaryTitle = titles.get(link.primary)
  }
  if (dryRun) return stats

  const applied: RunStats['links'] = []
  for (const link of stats.links) if (await linkDuplicate(admin, link)) applied.push(link)
  stats.links = applied

  const ids = [...checked]
  for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
    const { error } = await admin.from('regulations').update({ duplicates_checked_at: new Date().toISOString() }).in('id', ids.slice(i, i + UPDATE_CHUNK))
    if (error) throw error
  }
  return stats
}

const summary = (stats: RunStats) =>
  `${stats.checked} checked, ${stats.links.length} linked, ${stats.aiCalls} AI calls${stats.backlog ? ', backlog remains' : ''}${stats.errors.length ? `; errors: ${stats.errors.join(' | ')}` : ''}`

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== key) return json({ error: 'Service key required' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key)
  const body = await req.json().catch(() => ({}))

  try {
    if (body?.dryRun === true) return json(await run(admin, true))
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  // Respond at once: cron doesn't wait. A run that looked at nothing leaves
  // no record.
  EdgeRuntime.waitUntil(
    run(admin, false)
      .then(stats => (stats.checked > 0 || stats.errors.length ? recordSyncRun(admin, SOURCE, stats.errors.length === 0, summary(stats), stats) : undefined))
      .catch(err => recordSyncRun(admin, SOURCE, false, (err as Error).message)),
  )
  return json({ started: true }, 202)
})
