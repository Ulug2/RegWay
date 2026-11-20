import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query, type Resolver } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, promptText, stubModel, type FirmState } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// match-relevance and match-enforcement-relevance share their shape: load
// the newest candidates, drop the ones this firm was already evaluated
// against, ask the model about the rest in one call, store every verdict.

interface State extends FirmState {
  candidates?: Record<string, unknown>[]
  evaluated?: string[]
  // Unjudged documents older than the newest-200 window (migration 0046).
  older?: Record<string, unknown>[]
}

const rule = (id: string, title: string) => ({ id, title, agency: 'Securities and Exchange Commission', jurisdiction: 'SEC · Federal', summary: `${title} summary.`, raw: null })

function database(state: State): Resolver {
  return (q: Query) => {
    const shared = firmQueries(q, state)
    if (shared) return shared
    if (q.table === 'unjudged_regulations') return { data: (state.older ?? []).map(r => r.id) }
    // The older documents, read by id; the window otherwise.
    if (q.table === 'regulations') return { data: q.filters.some(f => f[0] === 'in' && f[1] === 'id') ? state.older : (state.candidates ?? []) }
    if (q.table === 'regulation_relevance' && q.op === 'select') return { data: (state.evaluated ?? []).map(regulation_id => ({ regulation_id })) }
  }
}

const asCron = (name: string) => post(name, { token: SERVICE_KEY, body: { firmId: FIRM_ID } })
const asUser = (name: string) => post(name, { token: 'user-jwt' })

async function run(name: string, state: State, verdicts: unknown[] | (() => Response), request = asCron(name)) {
  const db = fakeClient(database(state))
  setClient(db)
  const { handler, background } = await loadHandler(name)
  const net = stubModel({ submit_verdicts: typeof verdicts === 'function' ? verdicts : { verdicts } })
  const res = await handler(request)
  await Promise.all(background)
  return { res, db, ...net, rows: (db.ran('regulation_relevance', 'upsert')[0]?.payload ?? []) as Record<string, unknown>[] }
}

const three = [rule('reg-a', 'Form PF amendments'), rule('reg-b', 'Medicare payment update'), rule('reg-c', 'Truck driver hours')]

describe.each(['match-relevance', 'match-enforcement-relevance'])('%s', name => {
  it('asks the model only about items this firm has not been evaluated against', async () => {
    const { model, res } = await run(name, { candidates: three, evaluated: ['reg-a'] }, [])
    expect(model).toHaveLength(1)
    const text = promptText(model[0])
    expect(text).toContain('0. [Securities and Exchange Commission] Medicare payment update')
    expect(text).toContain('1. [Securities and Exchange Commission] Truck driver hours')
    expect(text).not.toContain('Form PF amendments')
    expect(res.status).toBe(200)
  })

  it('asks for verdicts at temperature 0, so an item gets the same answer every run', async () => {
    const { model } = await run(name, { candidates: three }, [])
    expect(model[0].body.temperature).toBe(0)
  })

  it('uses the model chosen for this matcher', async () => {
    const { model } = await run(name, { candidates: three }, [])
    // Regulatory moved to Haiku after the 2026-10-05 comparison; enforcement was not compared.
    expect(model[0].body.model).toBe(name === 'match-relevance' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5')
  })

  it('after a profile edit, forgets its rejections on the items it looks at (never matches or dismissals) and asks scheduled matching to continue', async () => {
    const reevaluate = post(name, { token: SERVICE_KEY, body: { firmId: FIRM_ID, reevaluate: true } })
    const { db } = await run(name, { candidates: three, evaluated: ['reg-a'] }, [], reevaluate)
    const [forget] = db.ran('regulation_relevance', 'delete')
    expect(hasFilter(forget, 'eq', 'firm_id', FIRM_ID)).toBe(true)
    expect(hasFilter(forget, 'in', 'regulation_id', ['reg-a', 'reg-b', 'reg-c'])).toBe(true)
    expect(hasFilter(forget, 'like', 'relevance_reason', 'NOT_RELEVANT:%')).toBe(true)
    expect(hasFilter(forget, 'is', 'dismissed_at', null)).toBe(true)
    const [request] = db.ran('scheduled_matching_firms', 'update')
    expect(hasFilter(request, 'eq', 'firm_id', FIRM_ID)).toBe(true)
  })

  it('a re-check refused by the rate limit forgets nothing', async () => {
    const reevaluate = post(name, { token: 'user-jwt', body: { reevaluate: true } })
    const { res, db, model } = await run(name, { candidates: three, evaluated: ['reg-a'], allowed: false }, [], reevaluate)
    expect(res.status).toBe(429)
    expect(db.ran('regulation_relevance', 'delete')).toEqual([])
    expect(db.ran('scheduled_matching_firms', 'update')).toEqual([])
    expect(model).toEqual([])
  })

  it('a re-check counts once against the rate limit', async () => {
    const reevaluate = post(name, { token: 'user-jwt', body: { reevaluate: true } })
    const { db, model } = await run(name, { candidates: three, evaluated: ['reg-a'] }, [], reevaluate)
    expect(db.ran('check_rate_limit')).toHaveLength(1)
    expect(db.ran('regulation_relevance', 'delete')).toHaveLength(1)
    expect(model).toHaveLength(1)
  })

  it('forgets nothing on an ordinary run', async () => {
    const { db } = await run(name, { candidates: three, evaluated: ['reg-a'] }, [])
    expect(db.ran('regulation_relevance', 'delete')).toEqual([])
    expect(db.ran('scheduled_matching_firms', 'update')).toEqual([])
  })

  it('makes no AI call, and uses none of the rate limit, when nothing is new', async () => {
    const { model, db, res } = await run(name, { candidates: three, evaluated: ['reg-a', 'reg-b', 'reg-c'] }, [], asUser(name))
    expect(await res.json()).toEqual({ evaluated: 0, relevant: 0 })
    expect(model).toEqual([])
    expect(db.ran('check_rate_limit')).toEqual([])

    const empty = await run(name, { candidates: [] }, [])
    expect(empty.model).toEqual([])
  })

  it('stores each verdict against the right entity, keeping "not relevant" as a marker', async () => {
    const { rows, res } = await run(name, { candidates: three }, [
      { index: 0, relevant: true, reason: 'The firm files Form PF.', scope: 'firm', entity_name: '' },
      { index: 1, relevant: true, reason: 'GetixHealth bills Medicare.', scope: 'company', entity_name: 'GetixHealth' },
      { index: 1, relevant: true, reason: 'Fund I holds healthcare assets.', scope: 'fund', entity_name: 'Fund I' },
      { index: 2, relevant: false, reason: 'No trucking operations.', scope: 'firm', entity_name: '' },
    ])
    expect(rows).toEqual([
      { regulation_id: 'reg-a', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: null, relevance_reason: 'The firm files Form PF.' },
      { regulation_id: 'reg-b', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: 'co-getix', relevance_reason: 'GetixHealth bills Medicare.' },
      { regulation_id: 'reg-b', firm_id: FIRM_ID, fund_id: 'fund-1', portfolio_company_id: null, relevance_reason: 'Fund I holds healthcare assets.' },
      { regulation_id: 'reg-c', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: No trucking operations.' },
    ])
    expect(await res.json()).toEqual({ evaluated: 4, relevant: 3 })
  })

  it('queues an analysis for each newly relevant item, once, and for nothing else', async () => {
    const { queued } = await run(name, { candidates: three }, [
      { index: 1, relevant: true, reason: 'a', scope: 'company', entity_name: 'GetixHealth' },
      { index: 1, relevant: true, reason: 'b', scope: 'fund', entity_name: 'Fund I' },
      { index: 2, relevant: false, reason: 'c', scope: 'firm', entity_name: '' },
    ])
    expect(queued).toEqual([{ regulationId: 'reg-b', firmId: FIRM_ID, force: false }])
  })

  it('evaluates at most one batch of 40 per call', async () => {
    const many = Array.from({ length: 55 }, (_, i) => rule(`reg-${i}`, `Rule ${i}`))
    const { model } = await run(name, { candidates: many }, [])
    const text = promptText(model[0])
    expect(text).toContain('39. [')
    expect(text).not.toContain('40. [')
  })

  it('fills the batch with older unjudged documents the newest-200 window no longer reaches', async () => {
    const older = [rule('old-1', 'Custody rule from October'), rule('old-2', 'Marketing rule from October')]
    const { model, db } = await run(name, { candidates: three, evaluated: ['reg-a'], older }, [])
    const text = promptText(model[0])
    // Window first, newest first; then the older ones.
    expect(text).toContain('1. [Securities and Exchange Commission] Truck driver hours')
    expect(text).toContain('2. [Securities and Exchange Commission] Custody rule from October')
    expect(text).toContain('3. [Securities and Exchange Commission] Marketing rule from October')
    const [lookup] = db.ran('unjudged_regulations')
    expect(lookup.payload).toMatchObject({ p_firm_id: FIRM_ID, p_category: name === 'match-relevance' ? 'regulatory' : 'enforcement', p_limit: 38, p_exclude_ids: ['reg-a', 'reg-b', 'reg-c'] })
    expect(text).not.toContain('4. [')
  })

  it('judges older documents even when the window has nothing left', async () => {
    const { model } = await run(name, { candidates: three, evaluated: ['reg-a', 'reg-b', 'reg-c'], older: [rule('old-1', 'Custody rule from October')] }, [])
    expect(model).toHaveLength(1)
    expect(promptText(model[0])).toContain('0. [Securities and Exchange Commission] Custody rule from October')
  })

  it('does not look further back when the window fills the batch', async () => {
    const many = Array.from({ length: 55 }, (_, i) => rule(`reg-${i}`, `Rule ${i}`))
    const { db } = await run(name, { candidates: many, older: [rule('old-1', 'Old')] }, [])
    expect(db.ran('unjudged_regulations')).toEqual([])
  })

  it("describes the firm, its funds and its companies to the model", async () => {
    const { model } = await run(name, { candidates: three }, [])
    const text = promptText(model[0])
    expect(text).toContain('H.I.G. Capital')
    expect(text).toContain('firm type: Private equity')
    expect(text).toContain('- Fund I (Delaware LP')
    expect(text).toContain('- GetixHealth (sectors: Healthcare, regions: United States; does: Revenue cycle management)')
  })

  it("a signed-in user's call is matched for their own firm and counted against the rate limit", async () => {
    const { db, model } = await run(name, { candidates: three }, [], asUser(name))
    expect(model).toHaveLength(1)
    expect(db.ran('check_rate_limit')).toHaveLength(1)
    expect(hasFilter(db.ran('regulation_relevance', 'select')[0], 'eq', 'firm_id', FIRM_ID)).toBe(true)
  })

  it('stops at the rate limit before calling the model', async () => {
    const { res, model, rows } = await run(name, { candidates: three, allowed: false }, [], asUser(name))
    expect(res.status).toBe(429)
    expect(model).toEqual([])
    expect(rows).toEqual([])
  })

  it('reports an AI outage as an error and marks nothing as evaluated', async () => {
    const { res, rows, queued } = await run(name, { candidates: three }, () => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Anthropic API error: 400/)
    expect(rows).toEqual([])
    expect(queued).toEqual([])
  })

  it('refuses a request with no session, and a firm that does not exist', async () => {
    expect((await run(name, {}, [], post(name))).res.status).toBe(401)
    expect((await run(name, { firmExists: false }, [])).res.status).toBe(404)
  })
})

describe('match-relevance candidates', () => {
  it('looks only at regulatory documents from the sources this firm is connected to, newest 200', async () => {
    const { db } = await run('match-relevance', { candidates: three }, [])
    const [query] = db.ran('regulations')
    // The Federal Register, the U.S. feeds, and (the test firm holds a company
    // in Italy) the EU feeds; not the UK's.
    expect(hasFilter(query, 'in', 'source', ['federal_register', 'sec_news', 'ftc_news', 'cfpb_news', 'esma_news', 'eur_lex'])).toBe(true)
    expect(hasFilter(query, 'eq', 'category', 'regulatory')).toBe(true)
    expect(hasFilter(query, 'limit', 200)).toBe(true)
  })

  it('looks further back with the same source filter', async () => {
    const { db } = await run('match-relevance', { candidates: three }, [])
    expect(db.ran('unjudged_regulations')[0].payload).toMatchObject({ p_sources: ['federal_register', 'sec_news', 'ftc_news', 'cfpb_news', 'esma_news', 'eur_lex'], p_countries: null })
  })
})

describe('match-enforcement-relevance candidates', () => {
  it('looks only at enforcement items', async () => {
    const { db } = await run('match-enforcement-relevance', { candidates: three }, [])
    expect(hasFilter(db.ran('regulations')[0], 'eq', 'category', 'enforcement')).toBe(true)
  })

  it("judges a case on its narrative, cut to an excerpt, not just its headline", async () => {
    const narrative = `The adviser charged undisclosed monitoring fees. ${'More detail. '.repeat(300)}END-OF-NARRATIVE`
    const { model } = await run('match-enforcement-relevance', { candidates: [{ ...rule('case-1', 'SEC Charges Adviser'), raw: { narrative_text: narrative } }] }, [])
    const text = promptText(model[0])
    expect(text).toContain('SEC Charges Adviser — The adviser charged undisclosed monitoring fees.')
    expect(text).not.toContain('END-OF-NARRATIVE')
  })
})
