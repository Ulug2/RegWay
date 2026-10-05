import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, stubModel } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'

const matched = (regulation_id: string, relevance_reason = 'Relevant.') => ({ regulation_id, relevance_reason })

async function refresh(body: unknown, rows: unknown[] = []) {
  const db = fakeClient((q: Query) => firmQueries(q) ?? (q.table === 'regulation_relevance' ? { data: rows } : undefined))
  setClient(db)
  const { handler, background } = await loadHandler('refresh-entity-impacts')
  const net = stubModel({})
  const res = await handler(post('refresh-entity-impacts', { token: 'user-jwt', body }))
  await Promise.all(background)
  return { res, db, ...net, query: db.ran('regulation_relevance')[0] }
}

describe('refresh-entity-impacts', () => {
  it('requires a scope, and an entity for a fund or company', async () => {
    expect((await refresh({})).res.status).toBe(400)
    expect((await refresh({ scope: 'everything' })).res.status).toBe(400)
    expect((await refresh({ scope: 'fund' })).res.status).toBe(400)
    expect((await refresh({ scope: 'company' })).res.status).toBe(400)
  })

  it("rewrites the analyses of what is matched to the edited company, within the caller's firm", async () => {
    const { res, queued, query } = await refresh({ scope: 'company', entityId: 'co-getix' }, [matched('reg-1'), matched('reg-2')])
    expect(await res.json()).toEqual({ queued: 2 })
    expect(queued).toEqual([
      { regulationId: 'reg-1', firmId: FIRM_ID, force: true },
      { regulationId: 'reg-2', firmId: FIRM_ID, force: true },
    ])
    expect(hasFilter(query, 'eq', 'firm_id', FIRM_ID)).toBe(true)
    expect(hasFilter(query, 'eq', 'portfolio_company_id', 'co-getix')).toBe(true)
    expect(hasFilter(query, 'is', 'dismissed_at', null)).toBe(true)
  })

  it('selects fund-level and firm-level matches by their own scope', async () => {
    const fund = await refresh({ scope: 'fund', entityId: 'fund-1' }, [matched('reg-1')])
    expect(hasFilter(fund.query, 'eq', 'fund_id', 'fund-1')).toBe(true)

    const firm = await refresh({ scope: 'firm' }, [matched('reg-1')])
    expect(hasFilter(firm.query, 'is', 'fund_id', null)).toBe(true)
    expect(hasFilter(firm.query, 'is', 'portfolio_company_id', null)).toBe(true)
  })

  it('skips items that were judged not relevant', async () => {
    const { queued } = await refresh({ scope: 'firm' }, [matched('reg-1'), matched('reg-2', 'NOT_RELEVANT: different sector.')])
    expect(queued.map(q => q.regulationId)).toEqual(['reg-1'])
  })

  // Each rewrite is a paid AI call.
  it('rewrites at most 10 analyses per edit', async () => {
    const { res, queued } = await refresh({ scope: 'firm' }, Array.from({ length: 25 }, (_, i) => matched(`reg-${i}`)))
    expect(await res.json()).toEqual({ queued: 10 })
    expect(queued).toHaveLength(10)
  })

  it('does nothing when the entity has no matches', async () => {
    const { res, queued } = await refresh({ scope: 'company', entityId: 'co-new' }, [])
    expect(await res.json()).toEqual({ queued: 0 })
    expect(queued).toEqual([])
  })
})
