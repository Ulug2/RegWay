import { afterEach, describe, expect, it } from 'vitest'
import { firmRecord } from '../../supabase/functions/_shared/roles/entityContext.ts'
import { reviewVerdicts, type VerdictUnderReview } from '../../supabase/functions/_shared/roles/skeptic.ts'
import { applySkeptic, skepticMode } from '../../supabase/functions/_shared/verdictReview.ts'
import type { Verdict } from '../../supabase/functions/_shared/relevance.ts'
import { fakeClient, setClient, type Query, type Resolver } from './helpers/fakeSupabase'
import { FIRM_ID, companies, firm, firmQueries, funds, promptText, stubModel } from './helpers/firm'
import { jsonResponse, loadHandler, post } from './helpers/handler'
import { SERVICE_KEY, setEnv } from './helpers/setup'

afterEach(() => setEnv('SKEPTIC_MODE', undefined))

const entities = { firm, funds, companies }
const record = () => firmRecord(entities, [{ fund_id: 'fund-1', portfolio_company_id: 'co-getix' }])

const doc = (title: string, extra: Record<string, unknown> = {}) => ({ title, issuer: 'Environmental Protection Agency', jurisdiction: 'Federal', summary: `${title} summary.`, ...extra })

const items: VerdictUnderReview[] = [
  { index: 0, document: doc('Florida air permit program approval'), scope: 'firm', entity_name: null, reason: 'H.I.G. is headquartered in Florida.' },
  { index: 1, document: doc('Employment Rights Act'), scope: 'firm', entity_name: null, reason: 'Applies to A.L.A. operations in the UK.' },
  { index: 2, document: doc('Medicare revenue cycle rule'), scope: 'company', entity_name: 'GetixHealth', reason: 'GetixHealth does revenue cycle management.' },
]

const reviews = [
  { index: 0, decision: 'reject', scope: 'firm', entity_name: '', reason: 'An approval of a state program creates no obligation for the firm.', unsupported_assumptions: ['portfolio companies with air emissions in Florida'] },
  { index: 1, decision: 'move', scope: 'company', entity_name: 'aero logistics', reason: 'Aero Logistics is recorded as operating in Italy.', unsupported_assumptions: [] },
  { index: 2, decision: 'keep', scope: 'company', entity_name: 'GetixHealth', reason: 'Recorded revenue cycle management activity.', unsupported_assumptions: [] },
]

describe('the Skeptic reviewing matches', () => {
  it('sees what is recorded about every entity, and each match with its stated reason', async () => {
    const db = fakeClient()
    const { model } = stubModel({ submit_reviews: { reviews } })
    await reviewVerdicts({ record: record(), category: 'regulatory', items }, { admin: db as never, functionName: 'match-relevance/skeptic', firmId: FIRM_ID })

    const call = model[0]
    expect(call.body.model).toBe('claude-sonnet-4-5')
    expect(call.body.temperature).toBe(0)
    expect(call.tool).toBe('submit_reviews')
    const text = promptText(call)
    expect(text).toContain('FIRM — H.I.G. Capital: hq_location: Miami, Florida')
    expect(text).toContain('FUND — Fund I: structure: Delaware LP')
    expect(text).toContain('holds: GetixHealth')
    expect(text).toContain('COMPANY — GetixHealth')
    expect(text).toContain('held by: Fund I')
    expect(text).toContain('not recorded:')
    expect(text).toContain('Matched to the firm. Stated reason: H.I.G. is headquartered in Florida.')
    expect(text).toContain('Matched to company "GetixHealth"')
    // Location footprints are for geopolitical items only.
    expect(text).not.toContain('Location footprints')
    expect(call.body.system[0].text).toContain('Could the opposite be true')
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'match-relevance/skeptic', firm_id: FIRM_ID })
  })

  it('gives geopolitical items the location footprints and its own rules', async () => {
    const { model } = stubModel({ submit_reviews: { reviews: [{ ...reviews[2], index: 0 }] } })
    await reviewVerdicts({ record: record(), category: 'geopolitical', items: [{ ...items[2], index: 0 }] }, { admin: fakeClient() as never, functionName: 'x' })
    const text = promptText(model[0])
    expect(text).toContain('Location footprints')
    expect(text).toContain('A designation of named persons or entities is not a measure on their country')
  })

  it('keeps and rejects on the entity the matcher named, and moves to the exact entity listed', async () => {
    stubModel({ submit_reviews: { reviews } })
    const result = await reviewVerdicts({ record: record(), category: 'regulatory', items }, { admin: fakeClient() as never, functionName: 'x' })
    expect(result).toEqual([
      { ...reviews[0], scope: 'firm', entity_name: null },
      { ...reviews[1], entity_name: 'Aero Logistics' },
      { ...reviews[2], entity_name: 'GetixHealth' },
    ])
  })

  it('asks again when a match was not reviewed or was moved to an entity that does not exist', async () => {
    let call = 0
    const answers = [{ reviews: reviews.slice(0, 2) }, { reviews: [reviews[0], { ...reviews[1], entity_name: 'Nobody Inc' }, reviews[2]] }]
    const { model } = stubModel({ submit_reviews: () => jsonResponse({ content: [{ type: 'tool_use', name: 'submit_reviews', input: answers[Math.min(call++, 1)] }] }) })
    await expect(reviewVerdicts({ record: record(), category: 'regulatory', items }, { admin: fakeClient() as never, functionName: 'x' })).rejects.toThrow('moved to an entity not listed')
    expect(model).toHaveLength(2)
  })

  it('never moves a geopolitical match to a fund', async () => {
    stubModel({ submit_reviews: { reviews: [{ ...reviews[1], index: 0, scope: 'fund', entity_name: 'Fund I' }] } })
    await expect(reviewVerdicts({ record: record(), category: 'geopolitical', items: [items[1]].map(i => ({ ...i, index: 0 })) }, { admin: fakeClient() as never, functionName: 'x' })).rejects.toThrow()
  })
})

describe('applySkeptic', () => {
  const candidates = [
    { id: 'reg-air', title: 'Florida air permit program approval', agency: 'EPA', summary: null },
    { id: 'reg-era', title: 'Employment Rights Act', agency: 'UK Parliament', summary: null },
    { id: 'reg-medicare', title: 'Medicare revenue cycle rule', agency: 'CMS', summary: null },
    { id: 'reg-trucks', title: 'Truck driver hours', agency: 'FMCSA', summary: null },
  ]
  const verdicts: Verdict[] = [
    { index: 0, relevant: true, reason: 'H.I.G. is headquartered in Florida.', scope: 'firm', entity_name: null },
    { index: 1, relevant: true, reason: 'Applies to A.L.A. operations in the UK.', scope: 'firm', entity_name: '' },
    { index: 2, relevant: true, reason: 'GetixHealth does revenue cycle management.', scope: 'company', entity_name: 'GetixHealth' },
    { index: 3, relevant: false, reason: 'No trucking.', scope: 'firm', entity_name: null },
  ]
  const database: Resolver = q => (q.table === 'fund_holdings' ? { data: [] } : undefined)
  const run = (mode?: 'off' | 'shadow' | 'on', reply: unknown = { reviews }) => {
    const db = fakeClient(database)
    const net = stubModel({ submit_reviews: reply })
    const result = applySkeptic(db as never, { firmId: FIRM_ID, category: 'regulatory', entities, candidates, verdicts, functionName: 'match-relevance', mode })
    return { db, ...net, result }
  }

  it('is off unless SKEPTIC_MODE says otherwise', async () => {
    expect(skepticMode()).toBe('off')
    setEnv('SKEPTIC_MODE', 'shadow')
    expect(skepticMode()).toBe('shadow')
    setEnv('SKEPTIC_MODE', 'nonsense')
    expect(skepticMode()).toBe('off')

    const { model, result } = run()
    expect(await result).toBe(verdicts)
    expect(model).toEqual([])
  })

  it('makes no call when nothing was marked relevant', async () => {
    const db = fakeClient(database)
    const { model } = stubModel({})
    const none = verdicts.map(v => ({ ...v, relevant: false }))
    expect(await applySkeptic(db as never, { firmId: FIRM_ID, category: 'regulatory', entities, candidates, verdicts: none, functionName: 'm', mode: 'on' })).toBe(none)
    expect(model).toEqual([])
  })

  it('in shadow mode records every review and changes nothing', async () => {
    const { db, model, result } = run('shadow')
    expect(await result).toBe(verdicts)
    // Only the three relevant matches were sent.
    expect(promptText(model[0])).not.toContain('Truck driver hours')
    const [insert] = db.ran('verdict_reviews', 'insert')
    const rows = insert.payload as Record<string, unknown>[]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      firm_id: FIRM_ID,
      regulation_id: 'reg-air',
      function_name: 'match-relevance',
      mode: 'shadow',
      decision: 'reject',
      original: { scope: 'firm', entity_name: null, reason: 'H.I.G. is headquartered in Florida.' },
      unsupported_assumptions: ['portfolio companies with air emissions in Florida'],
      model: 'claude-sonnet-4-5',
    })
    expect(rows[1]).toMatchObject({ regulation_id: 'reg-era', decision: 'move', scope: 'company', entity_name: 'Aero Logistics' })
  })

  it('when on, rejects, moves and keeps, and leaves the unreviewed verdicts alone', async () => {
    const { db, result } = run('on')
    expect(await result).toEqual([
      { ...verdicts[0], relevant: false, reason: 'Reviewed: An approval of a state program creates no obligation for the firm.' },
      { ...verdicts[1], scope: 'company', entity_name: 'Aero Logistics', reason: 'Aero Logistics is recorded as operating in Italy.' },
      verdicts[2],
      verdicts[3],
    ])
    expect((db.ran('verdict_reviews', 'insert')[0].payload as { mode: string }[])[0].mode).toBe('on')
  })

  it('when on, a kept match that depends on facts not recorded says so in its reason', async () => {
    const withNote = reviews.map(r => (r.index === 2 ? { ...r, unsupported_assumptions: ['whether GetixHealth bills Medicare'] } : r))
    const { result } = run('on', { reviews: withNote })
    const kept = (await result)[2]
    expect(kept).toMatchObject({ relevant: true, scope: 'company', entity_name: 'GetixHealth' })
    expect(kept.reason).toBe(`${verdicts[2].reason} Depends on facts not recorded: whether GetixHealth bills Medicare.`)
  })

  it('a failed review keeps the verdicts as the matcher gave them, and is recorded as failed', async () => {
    const { db, result } = run('on', () => new Response('{"error":"credit balance is too low"}', { status: 400 }))
    expect(await result).toBe(verdicts)
    const rows = db.ran('verdict_reviews', 'insert')[0].payload as Record<string, unknown>[]
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.decision === 'failed' && String(r.reason).includes('400'))).toBe(true)
  })
})

describe('the Skeptic inside match-relevance', () => {
  const rule = (id: string, title: string) => ({ id, title, agency: 'Environmental Protection Agency', jurisdiction: 'Federal', summary: `${title}.` })
  const candidates = [rule('reg-air', 'Florida air permit program approval'), rule('reg-era', 'Employment Rights Act'), rule('reg-medicare', 'Medicare revenue cycle rule')]
  const matcherVerdicts = [
    { index: 0, relevant: true, reason: 'H.I.G. is headquartered in Florida.', scope: 'firm', entity_name: '' },
    { index: 1, relevant: true, reason: 'Applies to A.L.A. operations.', scope: 'firm', entity_name: '' },
    { index: 2, relevant: true, reason: 'GetixHealth does revenue cycle management.', scope: 'company', entity_name: 'GetixHealth' },
  ]

  async function match(mode: string | undefined) {
    setEnv('SKEPTIC_MODE', mode)
    const db = fakeClient((q: Query) => {
      const shared = firmQueries(q)
      if (shared) return shared
      if (q.table === 'regulations') return { data: candidates }
      if (q.table === 'regulation_relevance' && q.op === 'select') return { data: [] }
      if (q.table === 'fund_holdings') return { data: [] }
    })
    setClient(db)
    const { handler, background } = await loadHandler('match-relevance')
    const net = stubModel({ submit_verdicts: { verdicts: matcherVerdicts }, submit_reviews: { reviews } })
    const res = await handler(post('match-relevance', { token: SERVICE_KEY, body: { firmId: FIRM_ID } }))
    await Promise.all(background)
    return { res, db, ...net, rows: db.ran('regulation_relevance', 'upsert')[0].payload as Record<string, unknown>[] }
  }

  it('stores what the review decided, and prepares analyses only for matches that survived', async () => {
    const { res, rows, queued, model } = await match('on')
    expect(model.map(m => m.tool)).toEqual(['submit_verdicts', 'submit_reviews'])
    expect(rows).toEqual([
      { regulation_id: 'reg-air', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: Reviewed: An approval of a state program creates no obligation for the firm.' },
      { regulation_id: 'reg-era', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: 'co-aero', relevance_reason: 'Aero Logistics is recorded as operating in Italy.' },
      { regulation_id: 'reg-medicare', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: 'co-getix', relevance_reason: 'GetixHealth does revenue cycle management.' },
    ])
    expect(queued.map(q => q.regulationId).sort()).toEqual(['reg-era', 'reg-medicare'])
    expect(await res.json()).toMatchObject({ relevant: 2 })
  })

  it('when off, matches exactly as before, with no second call', async () => {
    const { rows, model } = await match(undefined)
    expect(model.map(m => m.tool)).toEqual(['submit_verdicts'])
    expect(rows.map(r => r.relevance_reason)).toEqual(matcherVerdicts.map(v => v.reason))
  })
})
