import { describe, expect, it } from 'vitest'
import { buildRelevanceRows, describe as describeProfile, replaceRegulationVerdicts, resolveFirmContext, upsertRelevanceRows, type Verdict } from '../../supabase/functions/_shared/relevance.ts'
import { fakeClient, hasFilter, setClient } from './helpers/fakeSupabase'
import { SERVICE_KEY } from './helpers/setup'

const FIRM = 'firm-1'
const funds = [{ id: 'fund-1', name: 'Fund I' }]
const companies = [{ id: 'co-1', name: 'GetixHealth' }]
const candidates = [{ id: 'reg-0' }, { id: 'reg-1' }]

const verdict = (over: Partial<Verdict>): Verdict => ({ index: 0, relevant: true, reason: 'Applies.', scope: 'firm', entity_name: null, ...over })

describe('buildRelevanceRows', () => {
  it('attaches a verdict to the named fund or company, case-insensitively', () => {
    const rows = buildRelevanceRows(
      [verdict({ scope: 'company', entity_name: 'getixhealth' }), verdict({ index: 1, scope: 'fund', entity_name: 'FUND I' }), verdict({ index: 1 })],
      candidates,
      FIRM,
      funds,
      companies,
    )
    expect(rows).toEqual([
      { regulation_id: 'reg-0', firm_id: FIRM, fund_id: null, portfolio_company_id: 'co-1', relevance_reason: 'Applies.' },
      { regulation_id: 'reg-1', firm_id: FIRM, fund_id: 'fund-1', portfolio_company_id: null, relevance_reason: 'Applies.' },
      { regulation_id: 'reg-1', firm_id: FIRM, fund_id: null, portfolio_company_id: null, relevance_reason: 'Applies.' },
    ])
  })

  it('keeps a "not relevant" verdict as a marker so the item is not evaluated again', () => {
    const [row] = buildRelevanceRows([verdict({ relevant: false, reason: 'Different sector.' })], candidates, FIRM, funds, companies)
    expect(row.relevance_reason).toBe('NOT_RELEVANT: Different sector.')
  })

  it('drops a verdict whose index matches no candidate', () => {
    expect(buildRelevanceRows([verdict({ index: 7 })], candidates, FIRM, funds, companies)).toEqual([])
  })
})

describe('upsertRelevanceRows', () => {
  it('writes one row per entity, preferring a relevant verdict over a not-relevant one', async () => {
    const db = fakeClient()
    const row = (reason: string, companyId: string | null = null) => ({ regulation_id: 'reg-0', firm_id: FIRM, fund_id: null, portfolio_company_id: companyId, relevance_reason: reason })
    await upsertRelevanceRows(db as never, [row('NOT_RELEVANT: no'), row('Yes, applies.'), row('NOT_RELEVANT: later duplicate'), row('Company reason', 'co-1')])

    const [upsert] = db.ran('regulation_relevance', 'upsert')
    expect(upsert.payload).toEqual([row('Yes, applies.'), row('Company reason', 'co-1')])
    expect(upsert.options).toEqual({ onConflict: 'regulation_id,firm_id,portfolio_company_id,fund_id' })
  })

  it('makes no call for an empty set', async () => {
    const db = fakeClient()
    await upsertRelevanceRows(db as never, [])
    expect(db.queries).toEqual([])
  })

  it('throws when the write fails', async () => {
    const db = fakeClient(q => (q.op === 'upsert' ? { error: new Error('constraint') } : undefined))
    await expect(upsertRelevanceRows(db as never, [{ regulation_id: 'r', firm_id: FIRM, fund_id: null, portfolio_company_id: null, relevance_reason: 'x' }])).rejects.toThrow('constraint')
  })
})

describe('replaceRegulationVerdicts', () => {
  // The bug this fixed: a re-check wrote a new firm-level "not relevant"
  // row but left the old company match live beside it.
  it('deletes verdicts the re-check no longer produces', async () => {
    const db = fakeClient(q =>
      q.table === 'regulation_relevance' && q.op === 'select'
        ? { data: [{ id: 'old-company', fund_id: null, portfolio_company_id: 'co-1' }, { id: 'old-firm', fund_id: null, portfolio_company_id: null }] }
        : undefined,
    )
    await replaceRegulationVerdicts(db as never, FIRM, 'reg-0', [{ regulation_id: 'reg-0', firm_id: FIRM, fund_id: null, portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: software company' }])

    const [del] = db.ran('regulation_relevance', 'delete')
    expect(hasFilter(del, 'in', 'id', ['old-company'])).toBe(true)
    expect(db.ran('regulation_relevance', 'upsert')).toHaveLength(1)
  })

  it('never touches dismissals or holdings-derived fund rows', async () => {
    const db = fakeClient(q => (q.op === 'select' ? { data: [] } : undefined))
    await replaceRegulationVerdicts(db as never, FIRM, 'reg-0', [])
    const [select] = db.ran('regulation_relevance', 'select')
    expect(hasFilter(select, 'eq', 'firm_id', FIRM)).toBe(true)
    expect(hasFilter(select, 'eq', 'regulation_id', 'reg-0')).toBe(true)
    expect(hasFilter(select, 'eq', 'via_holdings', false)).toBe(true)
    expect(hasFilter(select, 'is', 'dismissed_at', null)).toBe(true)
    expect(db.ran('regulation_relevance', 'delete')).toEqual([])
  })
})

describe('resolveFirmContext', () => {
  const request = (token: string | null, body: unknown = {}) =>
    new Request('http://supabase.test/functions/v1/x', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) })

  it('refuses a request with no Authorization header', async () => {
    const res = (await resolveFirmContext(request(null), fakeClient() as never)) as Response
    expect(res.status).toBe(401)
  })

  it('lets the service key name a firm, and leaves the body readable for the caller', async () => {
    const req = request(SERVICE_KEY, { firmId: 'firm-9', regulationId: 'reg-0' })
    expect(await resolveFirmContext(req, fakeClient() as never)).toEqual({ firmId: 'firm-9', rateLimitClient: null })
    expect(await req.json()).toEqual({ firmId: 'firm-9', regulationId: 'reg-0' })
  })

  it('requires a firmId from the service key', async () => {
    const res = (await resolveFirmContext(request(SERVICE_KEY), fakeClient() as never)) as Response
    expect(res.status).toBe(400)
  })

  it("uses the signed-in user's own firm and ignores a firmId they send", async () => {
    const admin = fakeClient(q => (q.table === 'firm_members' ? { data: { firm_id: 'own-firm' } } : undefined))
    setClient(fakeClient(undefined, { id: 'user-1' }))
    const ctx = await resolveFirmContext(request('user-jwt', { firmId: 'someone-elses-firm' }), admin as never)
    expect(ctx).toMatchObject({ firmId: 'own-firm' })
    expect((ctx as { rateLimitClient: unknown }).rateLimitClient).not.toBeNull()
    expect(hasFilter(admin.ran('firm_members')[0], 'eq', 'user_id', 'user-1')).toBe(true)
  })

  it('refuses an invalid session and a user with no firm', async () => {
    setClient(fakeClient(undefined, null))
    expect(((await resolveFirmContext(request('bad-jwt'), fakeClient() as never)) as Response).status).toBe(401)
    setClient(fakeClient(undefined, { id: 'user-1' }))
    expect(((await resolveFirmContext(request('user-jwt'), fakeClient() as never)) as Response).status).toBe(404)
  })
})

describe('describe', () => {
  it('renders the selected profile answers and skips empty ones', () => {
    expect(describeProfile({ firm_type: 'Private equity', strategies: ['Buyout', 'Growth'], industries: [], other: 'x' }, [['firm_type', 'firm type'], ['strategies', 'strategies'], ['industries', 'industries'], ['missing', 'missing']])).toBe(
      'firm type: Private equity; strategies: Buyout/Growth',
    )
    expect(describeProfile(null, [['firm_type', 'firm type']])).toBe('')
  })
})
