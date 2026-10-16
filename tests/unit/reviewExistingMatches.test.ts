import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, promptText, stubModel } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// review-existing-matches: the Skeptic over matches that already exist,
// recorded for the owner to read; applied only by review id.

const reg = (id: string, title: string, category = 'regulatory') => ({ id, title, agency: 'EPA', jurisdiction: 'Federal', summary: `${title}.`, published_date: '2026-10-01', effective_date: null, countries: [], category, source: 'federal_register' })

const matches = [
  { id: 'rel-air', regulation_id: 'reg-air', fund_id: null, portfolio_company_id: null, relevance_reason: 'H.I.G. is headquartered in Florida.', funds: null, portfolio_companies: null, regulations: reg('reg-air', 'Florida air permit program approval') },
  { id: 'rel-medicare', regulation_id: 'reg-medicare', fund_id: null, portfolio_company_id: 'co-getix', relevance_reason: 'GetixHealth bills Medicare.', funds: null, portfolio_companies: { name: 'GetixHealth' }, regulations: reg('reg-medicare', 'Medicare rule') },
  { id: 'rel-301', regulation_id: 'reg-301', fund_id: null, portfolio_company_id: 'co-getix', relevance_reason: 'Operations in India.', funds: null, portfolio_companies: { name: 'GetixHealth' }, regulations: reg('reg-301', 'Section 301 manufacturing investigation', 'geopolitical') },
]

interface State {
  reviewed?: string[] // relevance ids already reviewed by a backfill
  stored?: Record<string, unknown>[] // verdict_reviews rows an apply finds
  targetRow?: { id: string } | null // a row already on a moved match's target entity
}

function database(state: State) {
  return (q: Query) => {
    const shared = firmQueries(q)
    if (shared) return shared
    if (q.table === 'fund_holdings') return { data: [] }
    if (q.table === 'regulation_relevance' && q.op === 'select' && q.columns?.includes('regulations!inner')) return { data: matches }
    if (q.table === 'regulation_relevance' && q.op === 'select') return { data: state.targetRow ?? null }
    if (q.table === 'verdict_reviews' && q.op === 'select') return { data: q.columns === 'relevance_id' ? (state.reviewed ?? []).map(relevance_id => ({ relevance_id })) : (state.stored ?? []) }
    if (q.table === 'verdict_reviews' && q.op === 'insert') return { data: (q.payload as Record<string, unknown>[]).map((r, i) => ({ id: `rev-${r.relevance_id}-${i}`, ...r })) }
  }
}

async function call(state: State, body: Record<string, unknown>, token = SERVICE_KEY) {
  const db = fakeClient(database(state))
  setClient(db)
  const { handler, background } = await loadHandler('review-existing-matches')
  const net = stubModel({
    submit_reviews: {
      reviews: [
        { index: 0, decision: 'reject', scope: 'firm', entity_name: '', reason: 'A state program approval binds no one here.', unsupported_assumptions: [] },
        { index: 1, decision: 'keep', scope: 'company', entity_name: 'GetixHealth', reason: 'Recorded billing activity.', unsupported_assumptions: [] },
      ],
    },
  })
  const res = await handler(post('review-existing-matches', { token, body }))
  await Promise.all(background)
  return { res, db, ...net, json: await res.json() }
}

describe('review-existing-matches', () => {
  it('needs the service key', async () => {
    const { res, model } = await call({}, { firmId: FIRM_ID }, 'user-jwt')
    expect(res.status).toBe(401)
    expect(model).toEqual([])
  })

  it('reviews current matches by category, records each against its match, and changes no match', async () => {
    const { db, model, json } = await call({}, { firmId: FIRM_ID })
    // One call for the two regulatory matches, and one for the geopolitical
    // one, whose stubbed answer reviews a match it was not sent: asked once
    // more, then left unrecorded for the next run.
    expect(model).toHaveLength(3)
    const regulatory = model.find(m => promptText(m).includes('Florida air permit'))!
    expect(promptText(regulatory)).toContain('Medicare rule')
    expect(promptText(regulatory)).not.toContain('Section 301')

    const rows = db.ran('verdict_reviews', 'insert').flatMap(q => q.payload as Record<string, unknown>[])
    expect(rows.find(r => r.relevance_id === 'rel-air')).toMatchObject({ mode: 'backfill', decision: 'reject', regulation_id: 'reg-air', function_name: 'review-existing-matches' })
    expect(db.ran('regulation_relevance', 'update')).toEqual([])
    expect(db.ran('regulation_relevance', 'upsert')).toEqual([])
    expect(json.reviews.find((r: { relevance_id: string }) => r.relevance_id === 'rel-air')).toMatchObject({ decision: 'reject', title: 'Florida air permit program approval' })
    expect(rows.map(r => r.relevance_id)).not.toContain('rel-301')
    expect(json).toMatchObject({ reviewed: 2, remaining: 1 })

    // Only live, AI-judged matches: not dismissed, not derived from holdings,
    // not company web-scan results, not "not relevant" markers.
    const [query] = db.ran('regulation_relevance', 'select')
    expect(hasFilter(query, 'is', 'dismissed_at', null)).toBe(true)
    expect(hasFilter(query, 'eq', 'via_holdings', false)).toBe(true)
    expect(hasFilter(query, 'neq', 'regulations.source', 'ai_search')).toBe(true)
    expect(hasFilter(query, 'not', 'relevance_reason', 'like', 'NOT_RELEVANT:%')).toBe(true)
  })

  it('skips matches a backfill already reviewed, so it can be run until nothing remains', async () => {
    const { model, json } = await call({ reviewed: ['rel-air', 'rel-medicare', 'rel-301'] }, { firmId: FIRM_ID })
    expect(model).toEqual([])
    expect(json).toMatchObject({ reviewed: 0, remaining: 0 })
  })

  it('applies only approved rejections and moves, and marks them applied', async () => {
    const stored = [
      { id: 'rev-1', relevance_id: 'rel-air', regulation_id: 'reg-air', decision: 'reject', scope: 'firm', entity_name: null, reason: 'A state program approval binds no one here.' },
      { id: 'rev-2', relevance_id: 'rel-era', regulation_id: 'reg-era', decision: 'move', scope: 'company', entity_name: 'Aero Logistics', reason: 'Aero Logistics operates in Italy.' },
    ]
    const { db, json, queued, model } = await call({ stored, targetRow: null }, { firmId: FIRM_ID, apply: ['rev-1', 'rev-2'] })
    expect(model).toEqual([])
    const [lookup] = db.ran('verdict_reviews', 'select')
    expect(hasFilter(lookup, 'in', 'id', ['rev-1', 'rev-2'])).toBe(true)
    expect(hasFilter(lookup, 'is', 'applied_at', null)).toBe(true)

    const updates = db.ran('regulation_relevance', 'update')
    expect(updates[0].payload).toEqual({ relevance_reason: 'NOT_RELEVANT: Reviewed: A state program approval binds no one here.' })
    expect(hasFilter(updates[0], 'eq', 'id', 'rel-air')).toBe(true)
    expect(updates[1].payload).toEqual({ fund_id: null, portfolio_company_id: 'co-aero', relevance_reason: 'Aero Logistics operates in Italy.' })
    expect(hasFilter(updates[1], 'eq', 'id', 'rel-era')).toBe(true)

    const [marked] = db.ran('verdict_reviews', 'update')
    expect(hasFilter(marked, 'in', 'id', ['rev-1', 'rev-2'])).toBe(true)
    // The moved match's analysis is rewritten for its new entity.
    expect(queued).toEqual([{ regulationId: 'reg-era', firmId: FIRM_ID, force: true }])
    expect(json).toMatchObject({ applied: 2, skipped: 0 })
  })

  it('a move onto an entity that already has a row puts the reason there and removes the moved row', async () => {
    const stored = [{ id: 'rev-2', relevance_id: 'rel-era', regulation_id: 'reg-era', decision: 'move', scope: 'company', entity_name: 'Aero Logistics', reason: 'Aero Logistics operates in Italy.' }]
    const { db } = await call({ stored, targetRow: { id: 'rel-era-aero' } }, { firmId: FIRM_ID, apply: ['rev-2'] })
    const [update] = db.ran('regulation_relevance', 'update')
    expect(hasFilter(update, 'eq', 'id', 'rel-era-aero')).toBe(true)
    expect(update.payload).toEqual({ relevance_reason: 'Aero Logistics operates in Italy.', dismissed_at: null })
    expect(hasFilter(db.ran('regulation_relevance', 'delete')[0], 'eq', 'id', 'rel-era')).toBe(true)
  })
})
