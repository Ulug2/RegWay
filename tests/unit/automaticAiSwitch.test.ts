import { afterEach, describe, expect, it } from 'vitest'
import { fakeClient, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, stubModel } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { SERVICE_KEY, setEnv } from './helpers/setup'

// AUTOMATIC_AI=off (_shared/ai/switch.ts): AI work nobody clicked for makes
// no AI call. Opening the dashboard after a top-up once spent $4.80 on it.

const rule = (id: string) => ({ id, title: `Rule ${id}`, agency: 'SEC', jurisdiction: 'Federal', summary: 'Summary.', raw: null, countries: [], published_date: '2026-11-13' })

function database(q: Query) {
  return firmQueries(q) ?? (q.table === 'regulations' ? { data: [rule('a'), rule('b')] } : q.table === 'regulation_relevance' && q.op === 'select' ? { data: [] } : q.table === 'portfolio_companies' ? { data: { id: 'co-1', name: 'Acme', sectors: [], regions: [], firm_id: FIRM_ID, profile: {} } } : undefined)
}

async function call(name: string, body: unknown = { firmId: FIRM_ID }) {
  setClient(fakeClient(database))
  const { handler, background } = await loadHandler(name)
  const net = stubModel({ submit_verdicts: { verdicts: [] } }, () => new Response('<rss></rss>'))
  const res = await handler(post(name, { token: SERVICE_KEY, body }))
  await Promise.all(background)
  return { res, body: await res.json().catch(() => ({})), model: net.model }
}

describe('AUTOMATIC_AI=off', () => {
  afterEach(() => setEnv('AUTOMATIC_AI', undefined))

  it.each(['match-relevance', 'match-enforcement-relevance', 'match-geopolitical-relevance'])('%s judges nothing', async name => {
    setEnv('AUTOMATIC_AI', 'off')
    const { model } = await call(name)
    expect(model).toHaveLength(0)
  })

  it.each(['run-matching', 'apply-profile-changes', 'sync-sec-admin-proceedings'])('%s does nothing and says so', async name => {
    setEnv('AUTOMATIC_AI', 'off')
    const { body, model } = await call(name, {})
    expect(body).toEqual({ paused: true })
    expect(model).toHaveLength(0)
  })

  it('company scans are refused with a plain message', async () => {
    setEnv('AUTOMATIC_AI', 'off')
    const { res, body, model } = await call('company-regulations', { companyId: 'co-1' })
    expect(res.status).toBe(503)
    expect(body).toMatchObject({ paused: true, error: 'Automatic scans are paused for now.' })
    expect(model).toHaveLength(0)
  })

  it('anything else leaves the matchers working', async () => {
    setEnv('AUTOMATIC_AI', 'on')
    const { model } = await call('match-relevance')
    expect(model).toHaveLength(1)
  })
})
