// Pulls new SEC Litigation Releases (civil enforcement actions filed in
// federal court) and upserts them into the shared `regulations` table with
// category 'enforcement'. Free, official, no key required. Intended to run
// on a schedule (see the pg_cron job alongside sync-federal-register) but
// can also be invoked manually:
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-sec-enforcement \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
//
// SEC Administrative Proceedings and FINRA enforcement are covered by their
// own sync functions (`sync-sec-admin-proceedings`, `sync-finra-enforcement`)
// — different feed shapes (PDF-linked, and a general news feed needing
// title filtering, respectively) that don't fit this function's plain-HTML-
// release pattern. See docs/notes/23-enforcement-monitoring-investigate.md for
// the original SEC/FINRA feed investigation.

import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { corsHeaders, handleOptions, json, requireServiceKey } from '../_shared/cors.ts'
import { fetchPlainText } from '../_shared/text.ts'
import { parseRssItems } from '../_shared/rss.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'sec_enforcement'
const LITIGATION_RELEASES_RSS = 'https://www.sec.gov/enforcement-litigation/litigation-releases/rss'
// Safety cap on how many recent releases we fetch full text for in one run —
// the RSS feed itself has no date filter, it's just "most recent N". Generous
// for a daily sync; bounds a pathological first run.
const MAX_ITEMS = 60

// The release page is the SEC's full site chrome around one paragraph of
// actual content. Its body reliably starts at "Litigation Release No." —
// anchor on that instead of guessing at CSS structure that can change.
function extractNarrative(pageText: string): string {
  const marker = pageText.indexOf('Litigation Release No.')
  if (marker === -1) return ''
  // Cut off before the page's footer nav, which repeats the site menu again.
  const footerMarkers = ['Modified:', 'Contact Us Contact the SEC']
  let end = pageText.length
  for (const fm of footerMarkers) {
    const i = pageText.indexOf(fm, marker)
    if (i !== -1) end = Math.min(end, i)
  }
  return pageText.slice(marker, end).trim()
}

// Every release follows: "... (<court> filed <date>) <HEADLINE SENTENCE> On
// <Month> <day>, <year>, the Securities and Exchange Commission ...". The
// headline sentence is a much better one-line summary than the RSS title
// (which is just the list of respondent names) — pull it out by anchoring on
// the boilerplate that reliably follows it. `[^)]` in the capture keeps a
// multi-defendant release's second case caption (also closed in `)`) from
// being swallowed into the match.
const HEADLINE_PATTERN = /\)\s*([^)]+?)\s*On [A-Z][a-z]+\.? \d{1,2},? \d{4},? the (?:Securities and Exchange Commission|SEC)/

function extractHeadline(narrative: string): string {
  return HEADLINE_PATTERN.exec(narrative)?.[1]?.trim() ?? ''
}

// The card's summary: the headline sentence, or else the start of the
// release itself. Never the RSS title again (just the respondents' names):
// a card that repeated its title as the summary read as a broken card.
export function summaryOf(narrative: string, title: string): string | null {
  const headline = extractHeadline(narrative)
  if (headline) return headline.slice(0, 600)
  const opening = narrative.replace(/\s+/g, ' ').trim().slice(0, 400)
  if (opening.length < 40 || opening === title) return null
  return opening.length === 400 ? `${opening.replace(/\s+\S*$/, '')}…` : opening
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  const refused = requireServiceKey(req)
  if (refused) return refused

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const feedRes = await fetch(LITIGATION_RELEASES_RSS, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)' },
    })
    if (!feedRes.ok) throw new Error(`SEC litigation-releases feed returned ${feedRes.status}`)
    // Every real litigation-release item carries a release number in
    // `dc:creator` — used as the external_id, so an item without one isn't
    // usable.
    const items = parseRssItems(await feedRes.text()).filter(i => i.creator).slice(0, MAX_ITEMS)

    // Skip releases already stored — no point re-fetching and re-analyzing a
    // page we already have, and it keeps a daily run cheap (only the handful
    // of genuinely new releases pay the per-item fetch cost below).
    const { data: existing } = await admin
      .from('regulations')
      .select('external_id')
      .eq('source', 'sec_enforcement')
      .in('external_id', items.map(i => i.creator))
    const knownIds = new Set((existing ?? []).map(r => r.external_id))
    const newItems = items.filter(i => !knownIds.has(i.creator))

    const rows = []
    for (const item of newItems) {
      const pageText = await fetchPlainText([item.link], { minLength: 200 })
      const narrative = extractNarrative(pageText)
      rows.push({
        source: 'sec_enforcement' as const,
        category: 'enforcement' as const,
        external_id: item.creator,
        title: item.title,
        agency: 'Securities and Exchange Commission',
        jurisdiction: 'Federal',
        summary: summaryOf(narrative, item.title),
        published_date: new Date(item.pubDate).toISOString().slice(0, 10),
        effective_date: null,
        source_url: item.link,
        raw: { release_number: item.creator, narrative_text: narrative || null },
      })
    }

    if (rows.length > 0) {
      const { error } = await admin.from('regulations').upsert(rows, { onConflict: 'source,external_id' })
      if (error) throw error
    }

    await recordSyncRun(admin, SOURCE, true, `${rows.length} new of ${items.length} fetched`)
    return json({ fetched: items.length, new: rows.length })
  } catch (err) {
    await recordSyncRun(admin, SOURCE, false, (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
