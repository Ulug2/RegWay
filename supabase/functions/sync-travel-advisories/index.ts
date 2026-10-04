// Pulls U.S. State Department travel advisories and upserts the serious ones
// into `regulations` with category 'geopolitical'. The official,
// country-tagged signal for political disruption (spec §8: "political
// disruption, and events affecting locations ... recorded in the entity
// profile"). Free, no key required. Runs daily (migration 0023):
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-travel-advisories \
//     -H "Authorization: Bearer <SERVICE_ROLE_OR_ANON_KEY>"
//
// One feed item per country, re-issued in place whenever the advisory is
// reviewed. A row's identity is (countries, level), so a level change (e.g.
// 2 → 4 after a coup) arrives as a new development to match, while a
// same-level re-issue just refreshes the existing row's text and date. Not
// the page URL: the site is migrating URL schemes and serves the same
// country under either one from run to run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { countryByName, extractCountries } from '../_shared/countries.ts'
import { parseRssItems } from '../_shared/rss.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'state_travel_advisories'
const ADVISORIES_RSS = 'https://travel.state.gov/_res/rss/TAsTWs.xml'

// Level 3 ("Reconsider Travel") and 4 ("Do Not Travel") are where the State
// Department is describing real disruption (unrest, conflict, terrorism,
// wrongful detention). Levels 1-2 cover most of the world at any time and
// would make this a general travel page, which spec §8 rules out.
const MIN_LEVEL = 3

// Titles read "<Country> - Level <n>: <Label>" (hyphen or en dash).
const TITLE_PATTERN = /^(.+?)\s+[-–]\s+Level\s+(\d)\s*:\s*(.+)$/

// One advisory can cover several places ("Mainland China, Hong Kong &
// Macau - See Summaries"), so every country named counts. A bare name the
// free-text extractor skips as ambiguous ("Jordan", "Chad") is still a
// country here, since the title's subject is always a place.
// A re-issue opens its description with a note about what changed ("There
// were no changes to the advisory level or risk indicators. Advisory summary
// was updated."), half the feed on any given day. The summary shown in the
// app starts at the advisory itself; the full text keeps the note.
const CHANGE_NOTE =
  /^(?:(?:Reissued statement:\s*)?(?:There (?:were|was|are|is) no changes?\b[^.]*\.|Reissued\b[^.]*\.|Advisory summary was updated\b[^.]*\.)\s*)+/i

// "Curaçao" → "curacao": accents dropped, anything else non-alphanumeric → "-".
const slug = (s: string) =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

function parseAdvisory(title: string) {
  const match = TITLE_PATTERN.exec(title.trim())
  if (!match) return null
  const [, rawPlace, level, label] = match
  const place = rawPlace.trim()
  const named = extractCountries(place)
  const countries = named.length ? named : [countryByName(place) ?? place]
  return { place, countries, level: Number(level), label: label.trim() }
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const feedRes = await fetch(ADVISORIES_RSS, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)' },
    })
    if (!feedRes.ok) throw new Error(`State Department advisories feed returned ${feedRes.status}`)
    const items = parseRssItems(await feedRes.text())
    if (items.length === 0) throw new Error('State Department advisories feed parsed to zero items')

    const rows = items
      .map(item => ({ item, advisory: parseAdvisory(item.title) }))
      .filter(({ advisory }) => advisory && advisory.level >= MIN_LEVEL)
      .map(({ item, advisory }) => ({
        source: SOURCE,
        category: 'geopolitical' as const,
        countries: advisory!.countries,
        external_id: `${advisory!.countries.map(slug).join('+')}#level-${advisory!.level}`,
        title: item.title,
        agency: 'U.S. Department of State',
        jurisdiction: advisory!.countries.join(', '),
        summary: (item.description.replace(CHANGE_NOTE, '') || `${advisory!.place}: Level ${advisory!.level}, ${advisory!.label}.`).slice(0, 600),
        published_date: new Date(item.pubDate).toISOString().slice(0, 10),
        effective_date: null,
        source_url: item.link,
        raw: { level: advisory!.level, level_label: advisory!.label, place: advisory!.place, narrative_text: item.description || null },
      }))

    // Dedupe by external_id: one upsert can't touch the same row twice, so a
    // country page listed twice in the feed would otherwise fail the run.
    const unique = [...new Map(rows.map(r => [r.external_id, r])).values()]

    if (unique.length > 0) {
      const { error } = await admin.from('regulations').upsert(unique, { onConflict: 'source,external_id' })
      if (error) throw error
    }

    await recordSyncRun(admin, SOURCE, true, `${unique.length} level ${MIN_LEVEL}+ advisories of ${items.length} in feed`)
    return json({ inFeed: items.length, stored: unique.length })
  } catch (err) {
    await recordSyncRun(admin, SOURCE, false, (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
