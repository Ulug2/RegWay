import { SERVICE_KEY } from './helpers/setup'
import { describe, expect, it } from 'vitest'
import { fakeClient, setClient } from './helpers/fakeSupabase'
import { loadHandler, post, stubFetch } from './helpers/handler'

const advisory = (title: string, description: string, link = 'https://travel.state.gov/x') =>
  `<item><title>${title}</title><link>${link}</link><pubDate>Fri, 02 Oct 2026 00:00:00 GMT</pubDate><description><![CDATA[${description}]]></description></item>`

const FEED = `<rss><channel>
${advisory('Mali - Level 4: Do Not Travel', 'There were no changes to the advisory level or risk indicators. Advisory summary was updated.<p>Do not travel to Mali due to terrorism.</p>')}
${advisory('France - Level 2: Exercise Increased Caution', 'Exercise increased caution in France.')}
${advisory('Jordan – Level 3: Reconsider Travel', 'Reconsider travel to Jordan.')}
${advisory('Mainland China, Hong Kong &amp; Macau - Level 3: Reconsider Travel', 'Reconsider travel.')}
${advisory('Mali - Level 4: Do Not Travel', 'Duplicate listing under the other URL scheme.', 'https://travel.state.gov/other/mali')}
${advisory('Worldwide Caution', 'Not an advisory with a level.')}
</channel></rss>`

type Row = { external_id: string; countries: string[]; summary: string; category: string; jurisdiction: string; published_date: string; raw: { level: number } }

async function sync(feed: Response) {
  const db = fakeClient()
  setClient(db)
  const { handler } = await loadHandler('sync-travel-advisories')
  stubFetch(url => (url.hostname === 'travel.state.gov' ? feed : undefined))
  const res = await handler(post('sync-travel-advisories', { token: SERVICE_KEY }))
  return { res, db, rows: (db.ran('regulations', 'upsert')[0]?.payload ?? []) as Row[] }
}

describe('sync-travel-advisories', () => {
  it('stores level 3 and 4 advisories only, one row per country set and level', async () => {
    const { res, rows, db } = await sync(new Response(FEED))
    expect(await res.json()).toEqual({ inFeed: 6, stored: 3 })
    expect(rows.map(r => r.external_id)).toEqual(['mali#level-4', 'jordan#level-3', 'china+hong-kong+macau#level-3'])
    expect(rows.every(r => r.category === 'geopolitical')).toBe(true)
    expect(db.ran('regulations', 'upsert')[0].options).toEqual({ onConflict: 'source,external_id' })
  })

  it('tags each advisory with its countries, including names ambiguous in free text', async () => {
    const { rows } = await sync(new Response(FEED))
    expect(rows.map(r => r.countries)).toEqual([['Mali'], ['Jordan'], ['China', 'Hong Kong', 'Macau']])
    expect(rows[2].jurisdiction).toBe('China, Hong Kong, Macau')
    expect(rows[0].raw.level).toBe(4)
    expect(rows[0].published_date).toBe('2026-10-02')
  })

  it('starts the summary at the advisory, not at the re-issue note', async () => {
    const { rows } = await sync(new Response(FEED))
    // The duplicate Mali listing comes later in the feed and wins the row.
    expect(rows[1].summary).toBe('Reconsider travel to Jordan.')
    const { rows: single } = await sync(new Response(`<rss><channel>${advisory('Mali - Level 4: Do Not Travel', 'There were no changes to the advisory level or risk indicators. Advisory summary was updated.<p>Do not travel to Mali due to terrorism.</p>')}</channel></rss>`))
    expect(single[0].summary).toBe('Do not travel to Mali due to terrorism.')
  })

  it('records the run as succeeded', async () => {
    const { db } = await sync(new Response(FEED))
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ source: 'state_travel_advisories', ok: true, detail: '3 level 3+ advisories of 6 in feed' })
  })

  it.each([
    ['the feed is down', new Response('unavailable', { status: 503 })],
    ['the feed returns something that is not the feed', new Response('<html>Access denied</html>')],
  ])('records a failed run and stores nothing when %s', async (_, feed) => {
    const { res, db, rows } = await sync(feed)
    expect(res.status).toBe(500)
    expect(rows).toEqual([])
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ source: 'state_travel_advisories', ok: false })
  })
})
