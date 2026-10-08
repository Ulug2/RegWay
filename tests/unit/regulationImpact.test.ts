import { describe, expect, it } from 'vitest'
import { fakeClient, setClient, type Query, type Resolver } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

const REG = 'reg-1'
const FIRM = 'firm-1'
const ANALYSIS = { overview: 'An overview.', scope: '', status: '', key_provisions: [], key_dates: [], impacts: [], considerations: [], limitations: '' }

const LONG_TEXT = 'The agency is amending its payment regulations. '.repeat(30)

interface State {
  member?: boolean
  linked?: boolean
  stored?: boolean // an analysis already exists
  allowed?: boolean // rate limit
  regulation?: Record<string, unknown>
}

function database(state: State): Resolver {
  let stored = !!state.stored
  return (q: Query) => {
    if (q.table === 'firm_members') return { data: state.member === false ? null : { firm_id: FIRM } }
    if (q.table === 'check_rate_limit') return { data: state.allowed ?? true }
    if (q.table === 'regulation_impacts') {
      if (q.op === 'upsert') {
        stored = true
        return
      }
      return { data: stored ? { id: 'impact-1', content: { ...ANALYSIS, text_truncated: false } } : null }
    }
    if (q.table === 'regulation_relevance') {
      // The handler's "is this linked to my firm" check asks for one row;
      // the generator asks for all of the firm's links.
      const single = q.filters.some(f => f[0] === 'maybeSingle')
      if (single) return { data: state.linked === false ? null : { id: 'link-1' } }
      return { data: [{ fund_id: null, portfolio_company_id: 'co-1', relevance_reason: 'GetixHealth bills Medicare.' }] }
    }
    if (q.table === 'regulations')
      return {
        data: { id: REG, source: 'federal_register', title: 'Medicare payment update', agency: 'CMS', jurisdiction: 'CMS · Federal', summary: 'Abstract.', published_date: '2026-10-02', effective_date: null, source_url: 'https://fr.test/d', raw: { document_number: '2026-19001', publication_date: '2026-10-02' }, category: 'regulatory', on_public_inspection: false, ...state.regulation },
      }
    if (q.table === 'firms') return { data: { name: 'H.I.G. Capital', hq_location: 'Miami, Florida', jurisdictions: ['United States'], profile: {} } }
    if (q.table === 'funds') return { data: [] }
    if (q.table === 'portfolio_companies') return { data: [{ id: 'co-1', name: 'GetixHealth', hq_location: 'Houston, Texas', sectors: ['Healthcare'], regions: [], offerings: 'Revenue cycle management', profile: {} }] }
    if (q.table === 'fund_holdings') return { data: [] }
  }
}

// Document text from GovInfo, the analysis from Anthropic.
function network(opts: { text?: string | null } = {}) {
  return stubFetch(url => {
    if (url.hostname === 'api.anthropic.com') return jsonResponse({ content: [{ type: 'tool_use', name: 'submit_impact_analysis', input: ANALYSIS }], usage: { input_tokens: 5000, output_tokens: 3000 } })
    if (url.hostname.endsWith('federalregister.gov') || url.hostname === 'www.govinfo.gov' || url.hostname === 'fr.test') {
      return opts.text === null ? new Response('', { status: 404 }) : new Response(opts.text ?? LONG_TEXT)
    }
  })
}

const anthropicCalls = (calls: ReturnType<typeof network>) => calls.filter(c => c.url.hostname === 'api.anthropic.com')

async function call(state: State, request: Request, net = network()) {
  const db = fakeClient(database(state))
  setClient(db)
  const { handler, background } = await loadHandler('regulation-impact')
  const res = await handler(request)
  return { res, db, background, net }
}

describe('regulation-impact, opened by a user', () => {
  const asUser = (body: unknown = { regulationId: REG }) => post('regulation-impact', { token: 'user-jwt', body })

  it('requires a regulation id and a signed-in member of a firm', async () => {
    expect((await call({}, asUser({}))).res.status).toBe(400)
    expect((await call({}, post('regulation-impact', { body: { regulationId: REG } }))).res.status).toBe(401)
    expect((await call({ member: false }, asUser())).res.status).toBe(404)
  })

  it("refuses a regulation that isn't matched to the caller's firm, before any AI call", async () => {
    const { res, net } = await call({ linked: false }, asUser())
    expect(res.status).toBe(404)
    expect(anthropicCalls(net)).toEqual([])
  })

  it('returns the stored analysis without generating or counting against the rate limit', async () => {
    const { res, db, net } = await call({ stored: true }, asUser())
    expect(await res.json()).toMatchObject({ status: 'exists', content: { overview: 'An overview.' } })
    expect(anthropicCalls(net)).toEqual([])
    expect(db.ran('check_rate_limit')).toEqual([])
  })

  it('writes the analysis on first open, from the document text and only the matched entities', async () => {
    const { res, db, net } = await call({}, asUser())
    expect(await res.json()).toMatchObject({ status: 'created', content: { overview: 'An overview.' } })

    const [request] = anthropicCalls(net)
    const body = JSON.parse(request.init!.body as string)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_impact_analysis' })
    expect(body.messages[0].content[0].text).toContain('The agency is amending its payment regulations.')
    const entities = body.messages[0].content[1].text as string
    expect(entities).toContain('Why it was matched to this firm: GetixHealth bills Medicare.')
    expect(entities).toContain('COMPANY — GetixHealth')
    // Blank facts that could decide applicability are named as unknown.
    expect(entities).toContain('not recorded: regions, supplier_locations, customers, consumer_facing, sensitive_data, regulated, gov_contracts, trade, outside_us')
    expect(entities).toContain('A fact listed under "not recorded" is unknown')
    expect(entities).toContain('FIRM — H.I.G. Capital')

    expect(db.ran('regulation_impacts', 'upsert')[0].payload).toMatchObject({ regulation_id: REG, firm_id: FIRM, content: { text_truncated: false } })
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'regulation-impact', firm_id: FIRM })
  })

  it('stops at the rate limit before spending anything', async () => {
    const { res, net } = await call({ allowed: false }, asUser())
    expect(res.status).toBe(429)
    expect(anthropicCalls(net)).toEqual([])
  })

  it('notes when only the first part of a long document was read', async () => {
    const { db } = await call({}, asUser(), network({ text: 'x'.repeat(70_000) }))
    expect(db.ran('regulation_impacts', 'upsert')[0].payload).toMatchObject({ content: { text_truncated: true } })
  })

  it('waits for publication when a scheduled document has no readable text yet', async () => {
    const { res, db, net } = await call({ regulation: { on_public_inspection: true } }, asUser(), network({ text: null }))
    expect(await res.json()).toEqual({ status: 'awaiting_publication', content: null })
    expect(anthropicCalls(net)).toEqual([])
    expect(db.ran('regulation_impacts', 'upsert')).toEqual([])
  })

  it('falls back to the abstract for a published document whose text cannot be fetched', async () => {
    const { res, net } = await call({}, asUser(), network({ text: null }))
    expect(await res.json()).toMatchObject({ status: 'created' })
    expect(JSON.parse(anthropicCalls(net)[0].init!.body as string).messages[0].content[0].text).toMatch(/TEXT:\nAbstract\.$/)
  })
})

describe('regulation-impact, queued by a matcher', () => {
  const asService = (body: unknown) => post('regulation-impact', { token: SERVICE_KEY, body })

  it('requires a firm id', async () => {
    expect((await call({}, asService({ regulationId: REG }))).res.status).toBe(400)
  })

  // Each analysis gets its own invocation: several inside one matcher run
  // were cut off at the platform's time limit.
  it('accepts the job at once and generates in the background', async () => {
    const { res, db, background } = await call({}, asService({ regulationId: REG, firmId: FIRM }))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ queued: true })
    expect(background).toHaveLength(1)
    await Promise.all(background)
    expect(db.ran('regulation_impacts', 'upsert')).toHaveLength(1)
  })

  it('does not regenerate an existing analysis unless forced', async () => {
    const first = await call({ stored: true }, asService({ regulationId: REG, firmId: FIRM }))
    await Promise.all(first.background)
    expect(anthropicCalls(first.net)).toEqual([])

    const forced = await call({ stored: true }, asService({ regulationId: REG, firmId: FIRM, force: true }))
    await Promise.all(forced.background)
    expect(anthropicCalls(forced.net)).toHaveLength(1)
  })

  it('a failed background generation does not crash the function', async () => {
    const net = stubFetch(url => (url.hostname === 'api.anthropic.com' ? jsonResponse({ error: 'overloaded' }, 529) : new Response(LONG_TEXT)))
    const { background } = await call({}, asService({ regulationId: REG, firmId: FIRM }), net)
    await expect(Promise.all(background)).resolves.toBeDefined()
  })
})
