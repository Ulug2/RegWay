import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, hasFilter, setClient } from './helpers/fakeSupabase'
import { loadHandler, post, stubFetch } from './helpers/handler'

const item = (title: string, link: string, pubDate = 'Thu, 01 Oct 2026 12:16:07 -0400', description = '') =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${pubDate}</pubDate><description>${description}</description></item>`
const rss = (...items: string[]) => new Response(`<rss><channel><title>Feed</title>${items.join('')}</channel></rss>`)

const SEC = () =>
  rss(
    item('SEC Proposes Amendments to Expand Responsible Retailization of Private Markets', 'https://www.sec.gov/newsroom/press-releases/2026-97-private-markets', undefined, 'The Commission today proposed amendments.'),
    item('SEC Charges Meyer Global Management and Its CEO', 'https://www.sec.gov/newsroom/press-releases/2026-98-meyer'),
    item('SEC Adopts Rule Amendments from long ago', 'https://www.sec.gov/newsroom/press-releases/2026-10-old', 'Mon, 03 Aug 2026 12:00:00 -0400'),
    item('SEC Proposes Amendments to Expand Responsible Retailization of Private Markets', 'https://www.sec.gov/newsroom/press-releases/2026-97-private-markets'),
  )
const EUR_LEX = () => rss(item('CELEX:32026R2108: Regulation (EU) 2026/2108 of the European Parliament and of the Council establishing the Union Customs Code', 'https://eur-lex.europa.eu/./legal-content/AUTO/?uri=CELEX:32026R2108', 'Tue, 06 Oct 2026 00:00:00 +0200'))
// Every other feed: present, with nothing recent in it.
const QUIET = () => rss(item('Final rule from the spring', 'https://example.test/spring', 'Wed, 01 Apr 2026 12:00:00 GMT'))

type Row = { source: string; category: string; external_id: string; title: string; agency: string; jurisdiction: string; summary: string; published_date: string; source_url: string }

async function sync(feeds: Record<string, () => Response>, known: string[] = [], lastRun: unknown = null) {
  const db = fakeClient(q => {
    if (q.table === 'regulations' && q.op === 'select') return { data: known.map(external_id => ({ external_id })) }
    if (q.table === 'sync_runs' && q.op === 'select') return { data: lastRun }
  })
  setClient(db)
  const { handler } = await loadHandler('sync-regulator-feeds')
  const fetched = stubFetch(url => {
    const key = Object.keys(feeds).find(k => url.href.includes(k))
    return key ? feeds[key]() : QUIET()
  })
  const res = await handler(post('sync-regulator-feeds'))
  const rows = db.ran('regulations', 'upsert').flatMap(u => u.payload as Row[])
  return { res, body: await res.json(), db, rows, fetched }
}

describe('sync-regulator-feeds', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T15:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('stores what each feed\'s rule keeps: recent, once, with where it applies', async () => {
    const { rows, body, db } = await sync({ 'sec.gov': SEC, 'rssId=162': EUR_LEX })
    expect(rows).toEqual([
      {
        source: 'sec_news',
        category: 'regulatory',
        external_id: '/newsroom/press-releases/2026-97-private-markets',
        title: 'SEC Proposes Amendments to Expand Responsible Retailization of Private Markets',
        agency: 'Securities and Exchange Commission (SEC)',
        jurisdiction: 'Federal',
        summary: 'The Commission today proposed amendments.',
        published_date: '2026-10-01',
        effective_date: null,
        source_url: 'https://www.sec.gov/newsroom/press-releases/2026-97-private-markets',
        raw: { feed: 'https://www.sec.gov/news/pressreleases.rss' },
      },
      expect.objectContaining({
        source: 'eur_lex',
        external_id: '/legal-content/AUTO?uri=CELEX:32026R2108',
        title: 'Regulation (EU) 2026/2108 of the European Parliament and of the Council establishing the Union Customs Code',
        jurisdiction: 'European Union',
        // No description in the feed: the title stands in.
        summary: 'Regulation (EU) 2026/2108 of the European Parliament and of the Council establishing the Union Customs Code',
        published_date: '2026-10-06',
      }),
    ])
    expect(body.new).toBe(2)
    expect(db.ran('regulations', 'upsert')[0].options).toEqual({ onConflict: 'source,external_id', ignoreDuplicates: true })
  })

  it('does not store an entry again', async () => {
    const { rows, body, db } = await sync({ 'sec.gov': SEC }, ['/newsroom/press-releases/2026-97-private-markets'])
    expect(rows).toEqual([])
    expect(body).toMatchObject({ new: 0, kept: 1 })
    const [lookup] = db.ran('regulations', 'select')
    expect(hasFilter(lookup, 'eq', 'source', 'sec_news')).toBe(true)
  })

  it('records one run for all feeds', async () => {
    const { db, fetched } = await sync({ 'sec.gov': SEC })
    expect(fetched).toHaveLength(9)
    const [run] = db.ran('sync_runs', 'insert')
    expect(run.payload).toMatchObject({ source: 'regulator_feeds', ok: true, detail: '1 new of 1 kept from 9 of 9 feeds' })
  })

  it('carries on when one feed is down or serves something else, and says which', async () => {
    const { rows, res, db } = await sync({ 'sec.gov': SEC, 'ftc.gov': () => new Response('unavailable', { status: 403 }), 'esma.europa.eu': () => new Response('<html>Access denied</html>') })
    expect(res.status).toBe(200)
    expect(rows).toHaveLength(1)
    const [run] = db.ran('sync_runs', 'insert')
    // One miss isn't an outage yet.
    expect(run.payload).toMatchObject({ ok: true, detail: '1 new of 1 kept from 7 of 9 feeds; failed: ftc_news (returned 403), esma_news (returned something that is not a feed)' })
  })

  it('an empty feed is not a failure', async () => {
    const { db } = await sync({ 'rssId=162': () => new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Lex Alerts</title></channel></rss>') })
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: true, detail: '0 new of 0 kept from 9 of 9 feeds' })
  })

  it('retries a rate-limited feed once', async () => {
    let calls = 0
    const { rows, db } = await sync({ 'sec.gov': () => (++calls === 1 ? new Response('slow down', { status: 429 }) : SEC()) })
    expect(calls).toBe(2)
    expect(rows).toHaveLength(1)
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: true })
  })

  it('counts the run as failed once a feed has failed three runs in a row', async () => {
    const down = { 'ftc.gov': () => new Response('blocked', { status: 403 }) }
    const lastRun = (failures: number) => ({ stats: { feeds: [{ source: 'ftc_news', url: 'https://www.ftc.gov/feeds/press-release.xml', error: 'returned 403', failures }] } })
    const second = await sync(down, [], lastRun(1))
    expect(second.db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: true })
    const third = await sync(down, [], lastRun(2))
    expect(third.db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: false, detail: '0 new of 0 kept from 8 of 9 feeds; failed: ftc_news (returned 403, 3 runs in a row)' })
    // A feed that answers again starts from zero.
    const recovered = await sync({}, [], lastRun(5))
    expect(recovered.db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: true })
  })

  it('fails outright when no feed can be read', async () => {
    const db = fakeClient()
    setClient(db)
    const { handler } = await loadHandler('sync-regulator-feeds')
    stubFetch(() => new Response('down', { status: 500 }))
    const res = await handler(post('sync-regulator-feeds'))
    expect(res.status).toBe(502)
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: false })
  })
})
