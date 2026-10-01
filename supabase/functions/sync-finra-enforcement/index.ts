// Pulls FINRA enforcement outcomes (bars, fines, suspensions, expulsions) and
// upserts them into `regulations` with category 'enforcement'. Free, no key
// required.
//
// FINRA has no disciplinary-actions-specific feed — every candidate checked
// was a dead end: `feeds.finra.org` is a dead FeedBurner alias (TLS handshake
// fails), a guessed disciplinary-actions RSS path 404s, and the site's
// generic `rss.xml` is unrelated page-update content, not enforcement (see
// prompts/23-enforcement-monitoring-investigate.md). What *does* work is
// FINRA's own newsreleases RSS feed
// (finra.org/media-center/newsreleases/rss) — a real, official feed that
// happens to mix genuine enforcement outcomes ("FINRA Bars...", "FINRA
// Fines...") with unrelated PR (Foundation news, board elections, industry
// reports). Filtered here by title pattern — the same approach already used
// for Federal Register's FINRA-notice coverage, because (as there) no
// FINRA-specific official feed exists.
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-finra-enforcement \
//     -H "Authorization: Bearer <SERVICE_ROLE_OR_ANON_KEY>"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { fetchPlainText } from '../_shared/text.ts'
import { parseRssItems } from '../_shared/rss.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'finra_enforcement'
const NEWS_RSS = 'https://www.finra.org/media-center/newsreleases/rss'
const MAX_ITEMS = 30

// Matches the small, stable vocabulary FINRA's own enforcement press-release
// titles use ("FINRA Bars...", "FINRA Fines...", "FINRA Expels...", "...
// Suspended...", "... Censures..."). Verified against a real feed pull: every
// title matching this correctly was a real enforcement outcome, and every
// non-enforcement release (Foundation news, board elections, research
// reports) correctly did not match.
const ENFORCEMENT_TITLE_PATTERN = /\b(bars?|barred|expels?|expelled|fines?|fined|suspends?|suspended|sanctions?|censures?)\b/i

// FINRA press releases reliably open with a "WASHINGTON—" dateline and end
// with an "About FINRA" boilerplate block plus site-navigation chrome —
// anchor on both instead of guessing at CSS structure that can change.
function extractNarrative(pageText: string): string {
  const marker = pageText.indexOf('WASHINGTON')
  if (marker === -1) return ''
  const footerMarkers = ['About FINRA', 'Share this FINRA Utility Menu']
  let end = pageText.length
  for (const fm of footerMarkers) {
    const i = pageText.indexOf(fm, marker)
    if (i !== -1) end = Math.min(end, i)
  }
  return pageText.slice(marker, end).trim()
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const feedRes = await fetch(NEWS_RSS, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)' },
    })
    if (!feedRes.ok) throw new Error(`FINRA newsreleases feed returned ${feedRes.status}`)
    const items = parseRssItems(await feedRes.text())
      .filter(i => ENFORCEMENT_TITLE_PATTERN.test(i.title))
      .slice(0, MAX_ITEMS)

    // No release-number equivalent here (`dc:creator` is empty on this feed)
    // — the URL path is stable and unique per release, so it's the external_id.
    const externalId = (link: string) => new URL(link).pathname

    const { data: existing } = await admin
      .from('regulations')
      .select('external_id')
      .eq('source', 'finra_enforcement')
      .in('external_id', items.map(i => externalId(i.link)))
    const knownIds = new Set((existing ?? []).map(r => r.external_id))
    const newItems = items.filter(i => !knownIds.has(externalId(i.link)))

    const rows = []
    for (const item of newItems) {
      const pageText = await fetchPlainText([item.link], { minLength: 200 })
      const narrative = extractNarrative(pageText)
      rows.push({
        source: 'finra_enforcement' as const,
        category: 'enforcement' as const,
        external_id: externalId(item.link),
        title: item.title,
        agency: 'Financial Industry Regulatory Authority (FINRA)',
        jurisdiction: 'Federal',
        summary: (item.description || item.title).slice(0, 600),
        published_date: new Date(item.pubDate).toISOString().slice(0, 10),
        effective_date: null,
        source_url: item.link,
        raw: { narrative_text: narrative || null },
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
