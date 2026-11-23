// Pulls DOJ press releases about companies (False Claims Act settlements,
// antitrust, FCPA, sanctions and export cases, environmental settlements)
// into `regulations` as 'enforcement' items, judged per firm by
// match-enforcement-relevance. Free, official, no key. Every release from
// every office comes through the API; `_shared/doj.ts` keeps the few about
// companies (about one a day) before anything is stored. Issue #41.
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-doj-press-releases \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"

import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { handleOptions, json, requireServiceKey } from '../_shared/cors.ts'
import { DOJ_API, DOJ_PAGES, DOJ_PAGE_SIZE, releaseRow, selectReleases, type DojRelease } from '../_shared/doj.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'doj_press'

async function fetchPage(page: number): Promise<DojRelease[]> {
  const url = `${DOJ_API}?pagesize=${DOJ_PAGE_SIZE}&sort=date&direction=DESC&page=${page}`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`DOJ press releases API returned ${res.status}`)
  const body = await res.json()
  if (!Array.isArray(body?.results)) throw new Error('DOJ press releases API returned no results list')
  return body.results as DojRelease[]
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  const refused = requireServiceKey(req)
  if (refused) return refused

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const releases: DojRelease[] = []
    for (let page = 0; page < DOJ_PAGES; page++) releases.push(...(await fetchPage(page)))
    const kept = selectReleases(releases)

    const { data: existing, error: readError } = await admin
      .from('regulations')
      .select('external_id')
      .eq('source', SOURCE)
      .in('external_id', kept.map(r => r.uuid))
    if (readError) throw readError
    const known = new Set((existing ?? []).map(r => r.external_id))
    const rows = kept.filter(r => !known.has(r.uuid)).map(releaseRow)

    if (rows.length > 0) {
      const { error } = await admin.from('regulations').upsert(rows, { onConflict: 'source,external_id' })
      if (error) throw error
    }

    await recordSyncRun(admin, SOURCE, true, `${rows.length} new of ${kept.length} kept from ${releases.length} releases`)
    return json({ fetched: releases.length, kept: kept.length, new: rows.length })
  } catch (err) {
    await recordSyncRun(admin, SOURCE, false, (err as Error).message)
    return json({ error: (err as Error).message }, 500)
  }
})
