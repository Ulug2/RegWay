import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Resolver } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

const lastRun = (stats: unknown, ok = true) => ({ ran_at: '2026-10-04T21:40:00Z', ok, stats })

// The database as run-matching sees it.
function database(opts: { last?: unknown; newRegulations?: number; newFirms?: number; firms?: string[] }): Resolver {
  return q => {
    if (q.table === 'sync_runs' && q.op === 'select') return { data: opts.last ?? null }
    if (q.table === 'regulations') return { count: opts.newRegulations ?? 0 }
    if (q.table === 'scheduled_matching_firms') return q.options ? { count: opts.newFirms ?? 0 } : { data: (opts.firms ?? []).map(firm_id => ({ firm_id })) }
  }
}

const matcherOf = (url: URL) => url.pathname.split('/').pop()!

describe('run-matching', () => {
  it('refuses anything but the service key (it spends AI money)', async () => {
    const { handler } = await loadHandler('run-matching')
    const calls = stubFetch(() => undefined)
    expect((await handler(post('run-matching'))).status).toBe(401)
    expect((await handler(post('run-matching', { token: 'test-anon-key' }))).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('skips without calling any matcher when nothing arrived since a clean run', async () => {
    const db = fakeClient(database({ last: lastRun({ backlog: false }), firms: ['hig'] }))
    setClient(db)
    const { handler, background } = await loadHandler('run-matching')
    const calls = stubFetch(() => undefined)

    const res = await handler(post('run-matching', { token: SERVICE_KEY }))
    expect(await res.json()).toEqual({ skipped: true })
    expect(calls).toEqual([])
    expect(background).toEqual([])
    expect(db.ran('sync_runs', 'insert')).toEqual([])
    // "New" means created after the last run.
    expect(hasFilter(db.ran('regulations')[0], 'gt', 'created_at', '2026-10-04T21:40:00Z')).toBe(true)
  })

  it.each([
    ['there has never been a run', { last: null }],
    ['the last run left a backlog', { last: lastRun({ backlog: true }) }],
    ['the last run failed', { last: lastRun({ backlog: false }, false) }],
    ['a development arrived since', { last: lastRun({ backlog: false }), newRegulations: 3 }],
    ['a firm was enrolled since', { last: lastRun({ backlog: false }), newFirms: 1 }],
  ])('runs when %s', async (_, state) => {
    setClient(fakeClient(database({ ...state, firms: ['hig'] })))
    const { handler, background } = await loadHandler('run-matching')
    stubFetch(() => jsonResponse({ evaluated: 0, relevant: 0 }))
    const res = await handler(post('run-matching', { token: SERVICE_KEY }))
    expect(res.status).toBe(202)
    await Promise.all(background)
  })

  it('runs all three matchers for each enrolled firm only, and records the outcome', async () => {
    const db = fakeClient(database({ last: null, firms: ['hig', 'second'] }))
    setClient(db)
    const { handler, background } = await loadHandler('run-matching')
    const calls = stubFetch(url => jsonResponse(matcherOf(url) === 'match-relevance' ? { evaluated: 12, relevant: 2 } : { evaluated: 0, relevant: 0 }))

    expect(await (await handler(post('run-matching', { token: SERVICE_KEY }))).json()).toEqual({ started: true })
    await Promise.all(background)

    const made = calls.map(c => `${matcherOf(c.url)}:${JSON.parse(c.init!.body as string).firmId}`).sort()
    expect(made).toEqual([
      'match-enforcement-relevance:hig',
      'match-enforcement-relevance:second',
      'match-geopolitical-relevance:hig',
      'match-geopolitical-relevance:second',
      'match-relevance:hig',
      'match-relevance:second',
    ])
    expect(calls.every(c => (c.init!.headers as Record<string, string>).Authorization === `Bearer ${SERVICE_KEY}`)).toBe(true)

    const [record] = db.ran('sync_runs', 'insert')
    expect(record.payload).toMatchObject({
      source: 'matching',
      ok: true,
      detail: '2 firms, 6 matcher calls: 24 evaluated, 4 relevant',
      stats: { firms: 2, calls: 6, evaluated: 24, relevant: 4, backlog: false, errors: [] },
    })
  })

  it('flags a backlog when a matcher filled its batch, so the next run continues', async () => {
    const db = fakeClient(database({ last: null, firms: ['hig'] }))
    setClient(db)
    const { handler, background } = await loadHandler('run-matching')
    stubFetch(url => jsonResponse({ evaluated: matcherOf(url) === 'match-relevance' ? 40 : 3, relevant: 1 }))
    await handler(post('run-matching', { token: SERVICE_KEY }))
    await Promise.all(background)
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ ok: true, stats: { backlog: true, evaluated: 46 } })
  })

  it('records a failed run, with one line per distinct error, when the AI provider refuses calls', async () => {
    const db = fakeClient(database({ last: null, firms: ['hig', 'second'] }))
    setClient(db)
    const { handler, background } = await loadHandler('run-matching')
    stubFetch(url => (matcherOf(url) === 'match-relevance' ? jsonResponse({ error: 'Anthropic API error: 400 credit balance is too low' }, 500) : jsonResponse({ evaluated: 1, relevant: 0 })))
    await handler(post('run-matching', { token: SERVICE_KEY }))
    await Promise.all(background)

    const payload = db.ran('sync_runs', 'insert')[0].payload as { ok: boolean; stats: { errors: string[]; evaluated: number } }
    expect(payload.ok).toBe(false)
    expect(payload.stats.errors).toEqual(['match-relevance: Anthropic API error: 400 credit balance is too low'])
    // The other matchers still ran.
    expect(payload.stats.evaluated).toBe(4)
  })

  it('runs when forced, even with nothing new', async () => {
    setClient(fakeClient(database({ last: lastRun({ backlog: false }), firms: [] })))
    const { handler, background } = await loadHandler('run-matching')
    stubFetch(() => undefined)
    expect((await handler(post('run-matching', { token: SERVICE_KEY, body: { force: true } }))).status).toBe(202)
    await Promise.all(background)
  })
})
