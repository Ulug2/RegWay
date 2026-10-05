import { describe, expect, it } from 'vitest'
import { syncHoldingsRollup } from '../../supabase/functions/_shared/holdings.ts'
import { fakeClient, hasFilter, type Query } from './helpers/fakeSupabase'

const FIRM = 'firm-1'
const names = {
  funds: [
    { id: 'fund-1', name: 'Fund I' },
    { id: 'fund-2', name: 'Fund II' },
  ],
  companies: [
    { id: 'aero', name: 'Aero Logistics' },
    { id: 'soft', name: 'SoftCo' },
  ],
}

interface World {
  holdings: { fund_id: string; portfolio_company_id: string }[]
  // Relevant, undismissed company verdicts (what the function's query asks for).
  companyMatches: { regulation_id: string; portfolio_company_id: string; relevance_reason: string }[]
  fundRows: { id: string; regulation_id: string; fund_id: string; relevance_reason: string | null; via_holdings: boolean; dismissed_at: string | null }[]
}

const isCompanyQuery = (q: Query) => q.filters.some(f => f[0] === 'not' && f[1] === 'portfolio_company_id')

function run(world: World) {
  const db = fakeClient(q => {
    if (q.op !== 'select') return
    if (q.table === 'fund_holdings') return { data: world.holdings }
    return { data: isCompanyQuery(q) ? world.companyMatches : world.fundRows }
  })
  return syncHoldingsRollup(db as never, FIRM, 'geopolitical', names).then(changed => ({
    changed,
    upserts: db.ran('regulation_relevance', 'upsert').flatMap(q => q.payload as Record<string, unknown>[]),
    deleted: db.ran('regulation_relevance', 'delete').flatMap(q => q.filters.find(f => f[0] === 'in')![2] as string[]),
    db,
  }))
}

const aeroMatch = { regulation_id: 'tariff', portfolio_company_id: 'aero', relevance_reason: 'Direct: Aero Logistics is headquartered in Italy; the tariff could raise its costs.' }
const derived = (over: Partial<World['fundRows'][number]> = {}) => ({
  id: 'row-1',
  regulation_id: 'tariff',
  fund_id: 'fund-1',
  relevance_reason: 'Indirect: Fund I holds Aero Logistics, which has a direct connection: Aero Logistics is headquartered in Italy; the tariff could raise its costs.',
  via_holdings: true,
  dismissed_at: null,
  ...over,
})

describe('syncHoldingsRollup', () => {
  it('gives a fund a derived row for a development matched to a company it holds', async () => {
    const { upserts, deleted, changed } = await run({ holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'aero' }], companyMatches: [aeroMatch], fundRows: [] })
    expect(upserts).toEqual([
      {
        regulation_id: 'tariff',
        firm_id: FIRM,
        fund_id: 'fund-1',
        portfolio_company_id: null,
        relevance_reason: 'Indirect: Fund I holds Aero Logistics, which has a direct connection: Aero Logistics is headquartered in Italy; the tariff could raise its costs.',
        via_holdings: true,
      },
    ])
    expect(deleted).toEqual([])
    expect(changed).toEqual(['tariff'])
  })

  // Spec §13: a sibling in the same fund gets nothing from the fund's exposure.
  it('writes fund rows only, never a row for a sibling company', async () => {
    const { upserts } = await run({
      holdings: [
        { fund_id: 'fund-1', portfolio_company_id: 'aero' },
        { fund_id: 'fund-1', portfolio_company_id: 'soft' },
      ],
      companyMatches: [aeroMatch],
      fundRows: [],
    })
    expect(upserts).toHaveLength(1)
    expect(upserts.every(u => u.portfolio_company_id === null && u.fund_id === 'fund-1')).toBe(true)
  })

  it('derives nothing without a recorded holding: ownership is never assumed', async () => {
    const { upserts, changed } = await run({ holdings: [], companyMatches: [aeroMatch], fundRows: [] })
    expect(upserts).toEqual([])
    expect(changed).toEqual([])
  })

  it('writes one row per fund when several funds hold the company', async () => {
    const { upserts } = await run({
      holdings: [
        { fund_id: 'fund-1', portfolio_company_id: 'aero' },
        { fund_id: 'fund-2', portfolio_company_id: 'aero' },
      ],
      companyMatches: [aeroMatch],
      fundRows: [],
    })
    expect(upserts.map(u => u.fund_id)).toEqual(['fund-1', 'fund-2'])
    expect(upserts[1].relevance_reason).toMatch(/^Indirect: Fund II holds Aero Logistics/)
  })

  it('combines the paths when a fund holds two matched companies', async () => {
    const { upserts } = await run({
      holdings: [
        { fund_id: 'fund-1', portfolio_company_id: 'aero' },
        { fund_id: 'fund-1', portfolio_company_id: 'soft' },
      ],
      companyMatches: [aeroMatch, { regulation_id: 'tariff', portfolio_company_id: 'soft', relevance_reason: 'Indirect: SoftCo has key suppliers in Italy.' }],
      fundRows: [],
    })
    expect(upserts).toHaveLength(1)
    expect(upserts[0].relevance_reason).toBe(
      'Indirect: Fund I holds Aero Logistics, which has a direct connection: Aero Logistics is headquartered in Italy; the tariff could raise its costs. Also, Fund I holds SoftCo, which has an indirect connection: SoftCo has key suppliers in Italy.',
    )
  })

  it('does nothing on a repeat run with no changes', async () => {
    const { upserts, deleted, changed, db } = await run({ holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'aero' }], companyMatches: [aeroMatch], fundRows: [derived()] })
    expect(upserts).toEqual([])
    expect(deleted).toEqual([])
    expect(changed).toEqual([])
    expect(db.queries.every(q => q.op === 'select')).toBe(true)
  })

  it("rewrites a derived row when the company's reason changes", async () => {
    const { upserts, changed } = await run({ holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'aero' }], companyMatches: [aeroMatch], fundRows: [derived({ relevance_reason: 'Indirect: old wording' })] })
    expect(upserts).toHaveLength(1)
    expect(changed).toEqual(['tariff'])
  })

  it('removes a derived row when the holding is removed', async () => {
    const { deleted, upserts, changed } = await run({ holdings: [], companyMatches: [aeroMatch], fundRows: [derived()] })
    expect(deleted).toEqual(['row-1'])
    expect(upserts).toEqual([])
    // Still matched to the company, so the analysis loses the fund's card.
    expect(changed).toEqual(['tariff'])
  })

  it('removes a derived row when the company is no longer matched, without regenerating its analysis', async () => {
    const { deleted, changed } = await run({ holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'aero' }], companyMatches: [], fundRows: [derived()] })
    expect(deleted).toEqual(['row-1'])
    expect(changed).toEqual([])
  })

  it("never overwrites or removes a direct verdict about the fund itself", async () => {
    const direct = derived({ id: 'direct', via_holdings: false, relevance_reason: 'Fund I is domiciled in Luxembourg.' })
    const withHolding = await run({ holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'aero' }], companyMatches: [aeroMatch], fundRows: [direct] })
    expect(withHolding.upserts).toEqual([])
    const withoutHolding = await run({ holdings: [], companyMatches: [], fundRows: [direct] })
    expect(withoutHolding.deleted).toEqual([])
  })

  it('keeps a derived row the user dismissed', async () => {
    const { deleted } = await run({ holdings: [], companyMatches: [], fundRows: [derived({ dismissed_at: '2026-10-04T00:00:00Z' })] })
    expect(deleted).toEqual([])
  })

  it("reads only this firm's rows in the requested category, and only live company matches", async () => {
    const { db } = await run({ holdings: [], companyMatches: [], fundRows: [] })
    expect(db.queries).toHaveLength(3)
    for (const q of db.queries) expect(hasFilter(q, 'eq', 'firm_id', FIRM)).toBe(true)
    const companyQuery = db.ran('regulation_relevance').find(isCompanyQuery)!
    expect(hasFilter(companyQuery, 'eq', 'regulations.category', 'geopolitical')).toBe(true)
    expect(hasFilter(companyQuery, 'is', 'dismissed_at', null)).toBe(true)
    expect(hasFilter(companyQuery, 'not', 'relevance_reason', 'like', 'NOT_RELEVANT:%')).toBe(true)
  })

  it('throws when a read fails rather than deleting rows from partial data', async () => {
    const db = fakeClient(q => (q.table === 'fund_holdings' ? { error: new Error('timeout') } : { data: [] }))
    await expect(syncHoldingsRollup(db as never, FIRM, 'geopolitical', names)).rejects.toThrow('timeout')
    expect(db.queries.every(q => q.op === 'select')).toBe(true)
  })
})
