import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, stubModel } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// The candidate pre-filter of match-geopolitical-relevance. The verdict
// step has its own tests (geopoliticalJudge.test.ts).

async function run() {
  const db = fakeClient(q => firmQueries(q) ?? (q.table === 'regulations' ? { data: [] } : undefined))
  setClient(db)
  const { handler, background } = await loadHandler('match-geopolitical-relevance')
  const net = stubModel({})
  const res = await handler(post('match-geopolitical-relevance', { token: SERVICE_KEY, body: { firmId: FIRM_ID } }))
  await Promise.all(background)
  return { res, db, ...net }
}

describe('match-geopolitical-relevance candidates', () => {
  it('reads geopolitical items naming a country the firm touches, skipping sanctions of a region it has no connection to', async () => {
    const { db, model, res } = await run()
    expect(res.status).toBe(200)
    const queries = db.ran('regulations', 'select')
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(hasFilter(query, 'eq', 'category', 'geopolitical')).toBe(true)
      // The test firm holds a company in Italy: EU sanctions are read, the UK's aren't.
      expect(hasFilter(query, 'not', 'source', 'in', '(uk_sanctions,ofsi)')).toBe(true)
    }
    expect(queries.some(q => hasFilter(q, 'overlaps', 'countries', ['Italy']))).toBe(true)
    // Nothing matched the pre-filter: no AI call.
    expect(model).toEqual([])
  })
})
