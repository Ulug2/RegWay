import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

const change = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  firm_id: 'hig',
  scope: 'firm',
  entity_id: null,
  refresh_impacts: true,
  rediscover: false,
  geopolitical: false,
  continuing: false,
  rounds: 0,
  changed_at: minutesAgo(6),
  ...over,
})

interface Reply {
  evaluated?: number
  fail?: string
}

// Runs the job over `pending`; each function answers from `replies`.
async function run(pending: unknown[], replies: Record<string, Reply> = {}, claimed = true) {
  const db = fakeClient((q: Query) => {
    if (q.table !== 'profile_changes') return
    if (q.op === 'select') return { data: pending }
    // The claim: the rows deleted, or none if another run got there first.
    if (q.op === 'delete') return { data: claimed ? [{ id: 'x' }] : [] }
  })
  setClient(db)
  const { handler, background } = await loadHandler('apply-profile-changes')
  const calls = stubFetch(url => {
    const reply = replies[url.pathname.split('/').pop()!] ?? {}
    return reply.fail ? jsonResponse({ error: reply.fail }, 500) : jsonResponse({ evaluated: reply.evaluated ?? 0, relevant: 0 })
  })
  const res = await handler(post('apply-profile-changes', { token: SERVICE_KEY }))
  await Promise.all(background)
  return {
    res,
    db,
    made: calls.map(c => ({ fn: c.url.pathname.split('/').pop()!, ...JSON.parse(c.init!.body as string) })),
    inserted: db.ran('profile_changes', 'insert').flatMap(q => q.payload as Record<string, unknown> | Record<string, unknown>[]),
    recorded: db.ran('sync_runs', 'insert').map(q => q.payload as { source: string; ok: boolean; detail: string }),
  }
}

describe('apply-profile-changes', () => {
  it('refuses anything but the service key', async () => {
    const { handler } = await loadHandler('apply-profile-changes')
    const calls = stubFetch(() => undefined)
    expect((await handler(post('apply-profile-changes'))).status).toBe(401)
    expect((await handler(post('apply-profile-changes', { token: 'user-jwt' }))).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('does nothing and leaves no record while a firm is still being edited', async () => {
    // One change is old enough, but the firm saved again two minutes ago.
    const { made, db, recorded } = await run([change('a', { rediscover: true }), change('b', { changed_at: minutesAgo(2) })])
    expect(made).toEqual([])
    expect(db.ran('profile_changes', 'delete')).toEqual([])
    expect(recorded).toEqual([])
  })

  it('does everything several edits asked for in one round, five minutes after the last', async () => {
    const { made, db, inserted, recorded } = await run([
      change('a', { rediscover: true, changed_at: minutesAgo(9) }),
      change('b', { rediscover: true, geopolitical: true, changed_at: minutesAgo(7) }),
      change('c', { scope: 'company', entity_id: 'co-1', changed_at: minutesAgo(6) }),
      change('d', { scope: 'company', entity_id: 'co-1', changed_at: minutesAgo(5.5) }),
    ])
    expect(made.sort((x, y) => x.fn.localeCompare(y.fn) || String(x.scope).localeCompare(String(y.scope)))).toEqual([
      { fn: 'match-enforcement-relevance', firmId: 'hig', reevaluate: true },
      { fn: 'match-geopolitical-relevance', firmId: 'hig', reevaluate: true },
      { fn: 'match-relevance', firmId: 'hig', reevaluate: true },
      // The company was saved twice: its analyses are rewritten once.
      { fn: 'refresh-entity-impacts', firmId: 'hig', scope: 'company', entityId: 'co-1' },
      { fn: 'refresh-entity-impacts', firmId: 'hig', scope: 'firm' },
    ])
    expect(hasFilter(db.ran('profile_changes', 'delete')[0], 'in', 'id', ['a', 'b', 'c', 'd'])).toBe(true)
    expect(inserted).toEqual([])
    expect(recorded).toMatchObject([{ source: 'profile_changes', ok: true, detail: '1 firms, 5 calls' }])
  })

  it('only rewrites analyses when no matching fact changed', async () => {
    const { made } = await run([change('a')])
    expect(made).toEqual([{ fn: 'refresh-entity-impacts', firmId: 'hig', scope: 'firm' }])
  })

  it('handles each firm on its own clock', async () => {
    const { made } = await run([change('a'), change('b', { firm_id: 'other', changed_at: minutesAgo(1) })])
    expect(made.map(m => m.firmId)).toEqual(['hig'])
  })

  it('pays for nothing when another run has already taken the rows', async () => {
    const { made } = await run([change('a', { rediscover: true })], {}, false)
    expect(made).toEqual([])
  })

  it('continues a re-check that filled a batch on the next run, without forgetting verdicts again', async () => {
    const first = await run([change('a', { rediscover: true })], { 'match-relevance': { evaluated: 40 } })
    expect(first.inserted).toHaveLength(1)
    expect(first.inserted[0]).toMatchObject({ firm_id: 'hig', rediscover: true, continuing: true, rounds: 1 })
    // Due at once: its time is the cut-off, not now.
    expect(Date.parse(first.inserted[0].changed_at as string)).toBeLessThanOrEqual(Date.now() - 5 * 60_000)

    const next = await run([change('cont', { ...first.inserted[0], id: 'cont', refresh_impacts: false })], { 'match-relevance': { evaluated: 12 } })
    expect(next.made.sort((x, y) => x.fn.localeCompare(y.fn))).toEqual([
      { fn: 'match-enforcement-relevance', firmId: 'hig', reevaluate: false },
      { fn: 'match-relevance', firmId: 'hig', reevaluate: false },
    ])
    // A short batch: finished.
    expect(next.inserted).toEqual([])
  })

  it('puts the changes back after a failure, and gives up after six runs', async () => {
    const failed = await run([change('a', { rediscover: true })], { 'match-relevance': { fail: 'Anthropic API error: 400 credit balance is too low' } })
    expect(failed.inserted).toHaveLength(1)
    // Only the re-check goes back (the analyses were rewritten fine), still
    // fresh: the failure may have come before anything was forgotten.
    expect(failed.inserted[0]).toMatchObject({ firm_id: 'hig', rediscover: true, refresh_impacts: false, continuing: false, rounds: 1 })
    expect(failed.inserted[0]).not.toHaveProperty('id')
    expect(failed.recorded[0].ok).toBe(false)
    expect(failed.recorded[0].detail).toContain('credit balance is too low')

    const spent = await run([change('a', { rediscover: true, rounds: 6 })])
    expect(spent.made).toEqual([])
    expect(spent.db.ran('profile_changes', 'delete')).toHaveLength(1)
    expect(spent.inserted).toEqual([])
  })

  // Putting everything back after one failure made the next run repeat, and
  // pay for, the calls that had worked.
  it('after a partial failure, retries only what failed', async () => {
    const result = await run([change('a', { rediscover: true, scope: 'company', entity_id: 'co-1' })], { 'refresh-entity-impacts': { fail: 'timeout' } })
    expect(result.made.map(m => m.fn).sort()).toEqual(['match-enforcement-relevance', 'match-relevance', 'refresh-entity-impacts'])
    expect(result.inserted).toEqual([expect.objectContaining({ scope: 'company', entity_id: 'co-1', refresh_impacts: true, rediscover: false, geopolitical: false, rounds: 1 })])
  })

  // Found by the code review: an analysis retry beside a continuation made
  // the continuation start over and pay for its first batch again.
  it('an analysis retry does not make a continuation forget its verdicts again', async () => {
    const result = await run([change('a', { rediscover: true, continuing: true, refresh_impacts: false }), change('b', { refresh_impacts: true, rounds: 1 })])
    expect(result.made.filter(m => m.fn === 'match-relevance')).toEqual([expect.objectContaining({ reevaluate: false })])
  })

  it('a full geopolitical batch does not start the other matchers', async () => {
    const result = await run([change('a', { geopolitical: true, refresh_impacts: false })], { 'match-geopolitical-relevance': { evaluated: 40 } })
    expect(result.inserted).toEqual([])
  })
})
