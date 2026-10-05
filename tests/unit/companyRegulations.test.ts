import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, promptText, stubModel } from './helpers/firm'
import { jsonResponse, loadHandler, post } from './helpers/handler'

const COMPANY = {
  id: 'co-getix',
  name: 'GetixHealth',
  sectors: ['Healthcare'],
  regions: ['United States'],
  hq_location: 'Houston, Texas',
  firm_id: FIRM_ID,
  website: 'https://getixhealth.test',
  offerings: 'Revenue cycle management',
  profile: { consumer_facing: 'yes', sensitive_data: ['Health records'], regulated: 'Yes', license_types: ['Collection agency'], outside_us: 'no', foreign_countries: ['India'] },
}

const found = (n: number, over: Record<string, unknown> = {}) => ({
  title: `Rule ${n}`,
  agency: 'CMS',
  jurisdiction: 'Federal (United States)',
  published_date: '2026-09-30',
  effective_date: '',
  summary: `Summary ${n}.`,
  why_it_applies: `GetixHealth bills Medicare (${n}).`,
  source_url: `https://www.cms.gov/rule-${n}`,
  ...over,
})

interface State {
  accessible?: boolean // RLS: is this the caller's own firm's company?
  allowed?: boolean
}

async function scan(state: State, items: unknown[], request = post('company-regulations', { token: 'user-jwt', body: { companyId: COMPANY.id } })) {
  let stored = 0
  const db = fakeClient((q: Query) => {
    if (q.table === 'portfolio_companies' && q.op === 'select') return state.accessible === false ? { data: null, error: { code: 'PGRST116' } } : { data: COMPANY }
    if (q.table === 'check_rate_limit') return { data: state.allowed ?? true }
    if (q.table === 'regulations' && q.op === 'upsert') return { data: { id: `reg-${++stored}` } }
  })
  setClient(db)
  const { handler, background } = await loadHandler('company-regulations')
  const net = stubModel({
    // Step 1: free-text findings from a web search.
    text: () => jsonResponse({ content: [{ type: 'text', text: 'Found: CMS outpatient payment rule, https://www.cms.gov/rule-1' }], usage: { input_tokens: 30000, output_tokens: 1500, server_tool_use: { web_search_requests: 5 } } }),
    // Step 2: the same findings as structured items.
    submit_regulations: { items },
  })
  const res = await handler(request)
  await Promise.all(background)
  return { res, db, ...net }
}

describe('company-regulations', () => {
  it('needs a company id and a session', async () => {
    expect((await scan({}, [], post('company-regulations', { token: 'user-jwt' }))).res.status).toBe(400)
    expect((await scan({}, [], post('company-regulations', { body: { companyId: COMPANY.id } }))).res.status).toBe(401)
  })

  it("refuses a company the caller can't see, before any AI call", async () => {
    const { res, model } = await scan({ accessible: false }, [])
    expect(res.status).toBe(404)
    expect(model).toEqual([])
  })

  it('stops at the rate limit before searching', async () => {
    const { res, model } = await scan({ allowed: false }, [])
    expect(res.status).toBe(429)
    expect(model).toEqual([])
  })

  it('searches with what the company actually does and where', async () => {
    const { model } = await scan({}, [])
    const [search, extract] = model
    expect(search.body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }])
    const text = promptText(search)
    expect(text).toContain('"Healthcare" sector headquartered in Houston, Texas')
    expect(text).toContain('what it does: Revenue cycle management')
    expect(text).toContain('sells directly to consumers')
    expect(text).toContain('handles: Health records')
    expect(text).toContain('licensed/regulated (Collection agency)')
    // Recorded as not operating abroad, so the listed country is left out.
    expect(text).not.toContain('operates abroad')
    // The second call turns the findings into fields, with no search of its own.
    expect(extract.tool).toBe('submit_regulations')
    expect(promptText(extract)).toContain('Found: CMS outpatient payment rule')
  })

  it('names the company in both steps, so a reason never calls it something else', async () => {
    const { model } = await scan({}, [])
    const [search, extract] = model
    // Without the name the model guessed one from the website ("iX Health").
    expect(promptText(search)).toContain('compliance obligations for GetixHealth, a company in')
    expect(promptText(extract)).toContain('Refer to the company only as "GetixHealth"')
  })

  it("stores each finding and links it to the company with the model's own reason", async () => {
    const { res, db } = await scan({}, [found(1), found(2)])
    expect(await res.json()).toEqual({ found: 2, stored: 2 })

    const regs = db.ran('regulations', 'upsert')
    expect(regs[0].payload).toMatchObject({ source: 'ai_search', external_id: 'co-getix:https://www.cms.gov/rule-1', title: 'Rule 1', published_date: '2026-09-30', effective_date: null, source_url: 'https://www.cms.gov/rule-1' })
    expect(regs[0].options).toEqual({ onConflict: 'source,external_id' })

    const links = db.ran('regulation_relevance', 'upsert').map(q => q.payload)
    expect(links).toEqual([
      { regulation_id: 'reg-1', firm_id: FIRM_ID, portfolio_company_id: 'co-getix', relevance_reason: 'GetixHealth bills Medicare (1).' },
      { regulation_id: 'reg-2', firm_id: FIRM_ID, portfolio_company_id: 'co-getix', relevance_reason: 'GetixHealth bills Medicare (2).' },
    ])
  })

  it('never stores a finding without a source, and says what the scan was when no reason is given', async () => {
    const { res, db } = await scan({}, [found(1, { source_url: '' }), found(2, { why_it_applies: '  ' })])
    expect(await res.json()).toEqual({ found: 2, stored: 1 })
    expect(db.ran('regulations', 'upsert')).toHaveLength(1)
    expect(db.ran('regulation_relevance', 'upsert')[0].payload).toMatchObject({ relevance_reason: 'AI web-search scan for GetixHealth (Healthcare, Houston, Texas)' })
  })

  it('queues an analysis for what it stored', async () => {
    const { queued } = await scan({}, [found(1), found(2)])
    expect(queued).toEqual([
      { regulationId: 'reg-1', firmId: FIRM_ID, force: false },
      { regulationId: 'reg-2', firmId: FIRM_ID, force: false },
    ])
  })

  it('queues at most 8 analyses however many it finds', async () => {
    const { queued } = await scan({}, Array.from({ length: 12 }, (_, i) => found(i + 1)))
    expect(queued).toHaveLength(8)
  })

  // Otherwise the app would scan the company again on every dashboard load.
  it('marks the company as scanned even when nothing was found', async () => {
    const { res, db, queued } = await scan({}, [])
    expect(await res.json()).toEqual({ found: 0, stored: 0 })
    const [stamp] = db.ran('portfolio_companies', 'update')
    expect((stamp.payload as { last_scanned_at: string }).last_scanned_at).toBeTruthy()
    expect(hasFilter(stamp, 'eq', 'id', 'co-getix')).toBe(true)
    expect(queued).toEqual([])
  })

  it('records the cost of both steps, including the web searches', async () => {
    const { db } = await scan({}, [found(1)])
    const usage = db.ran('usage_events', 'insert').map(q => q.payload as Record<string, unknown>)
    expect(usage.map(u => u.function_name)).toEqual(['company-regulations:search', 'company-regulations:extract'])
    expect(usage[0]).toMatchObject({ firm_id: FIRM_ID, input_tokens: 30000, web_search_requests: 5 })
  })

  it('reports an AI outage as an error and does not mark the company scanned', async () => {
    const db = fakeClient((q: Query) => (q.table === 'portfolio_companies' ? { data: COMPANY } : q.table === 'check_rate_limit' ? { data: true } : undefined))
    setClient(db)
    const { handler } = await loadHandler('company-regulations')
    stubModel({ text: () => new Response('{"error":"overloaded"}', { status: 529 }) })
    const res = await handler(post('company-regulations', { token: 'user-jwt', body: { companyId: COMPANY.id } }))
    expect(res.status).toBe(500)
    expect(db.ran('portfolio_companies', 'update')).toEqual([])
  })
})
