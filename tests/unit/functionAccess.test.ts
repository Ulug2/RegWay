import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, setClient, setSessionClients, type FakeClient, type Query, type Result } from './helpers/fakeSupabase'
import { answerFields, jsonResponse, loadHandler, post, stubFetch, toolAnswer } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// Every server function, called the way an attacker would (issue #13,
// roadmap 16g part 2). Two firms: Alpha (the target) and Bravo (the
// attacker, an ordinary signed-in member). The fake database plays the
// access rules: the server key sees every row, a user's own session sees
// only their firm's. Nothing real is called; the AI is a stub.

const ALPHA = { firm: 'firm-alpha', user: 'user-alpha', fund: 'fund-alpha', company: 'co-alpha', conversation: 'conv-alpha' }
const BRAVO = { firm: 'firm-bravo', user: 'user-bravo', fund: 'fund-bravo', company: 'co-bravo' }
const BRAVO_TOKEN = 'bravo-session-token'

// Words that appear only in Alpha's rows. If any reaches the AI, another
// outbound request, or a database write made for Bravo, Alpha's data
// crossed the line.
const ALPHA_SECRETS = ['firm-alpha', 'fund-alpha', 'co-alpha', 'conv-alpha', 'Alpha Secret']

const firms = [
  { id: ALPHA.firm, name: 'Alpha Secret Capital', hq_location: 'Boston, Massachusetts', jurisdictions: ['United States'], profile: {}, profile_meta: {}, created_at: '2026-01-01T00:00:00Z' },
  { id: BRAVO.firm, name: 'Bravo Partners', hq_location: 'Austin, Texas', jurisdictions: ['United States'], profile: {}, profile_meta: {}, created_at: '2026-01-01T00:00:00Z' },
]
const funds = [
  { id: ALPHA.fund, firm_id: ALPHA.firm, name: 'Alpha Secret Fund I', structure: 'Delaware LP', size: '$2B', jurisdictions: ['United States'], profile: {}, profile_meta: {} },
  { id: BRAVO.fund, firm_id: BRAVO.firm, name: 'Bravo Fund I', structure: 'Delaware LP', size: '$1B', jurisdictions: ['United States'], profile: {}, profile_meta: {} },
]
const companies = [
  { id: ALPHA.company, firm_id: ALPHA.firm, name: 'Alpha Secret Holdings', hq_location: 'Denver, Colorado', sectors: ['Healthcare'], regions: ['United States'], offerings: 'Clinics', website: null, profile: {}, profile_meta: {} },
  { id: BRAVO.company, firm_id: BRAVO.firm, name: 'Bravo Logistics', hq_location: 'Dallas, Texas', sectors: ['Logistics'], regions: ['United States'], offerings: 'Trucking', website: null, profile: {}, profile_meta: {} },
]
const relevance = [
  { regulation_id: 'reg-0', firm_id: ALPHA.firm, fund_id: null, portfolio_company_id: ALPHA.company, relevance_reason: 'Alpha Secret reason', dismissed_at: null },
  { regulation_id: 'reg-0', firm_id: BRAVO.firm, fund_id: null, portfolio_company_id: BRAVO.company, relevance_reason: 'Bravo reason', dismissed_at: null },
]
const regulation = {
  id: 'reg-1',
  title: 'A public rule',
  summary: 'Public text',
  category: 'regulatory',
  jurisdiction: 'United States',
  agency: 'SEC',
  source: 'federal_register',
  published_date: '2026-11-01',
  document_url: 'https://example.test/rule',
  full_text: null,
}

const TABLES: Record<string, Record<string, unknown>[]> = {
  firms,
  funds,
  portfolio_companies: companies,
  regulation_relevance: relevance,
  regway_ai_conversations: [{ id: ALPHA.conversation, firm_id: ALPHA.firm, user_id: ALPHA.user, context: null, stopped_at: null }],
}

const filterValue = (q: Query, column: string) => q.filters.find(f => f[0] === 'eq' && f[1] === column)?.[2]

// Answers a read the way the database would for a caller who sees `visible`
// firms (every firm for the server key).
function world(visible: string[] | 'all'): (q: Query) => Result | void {
  const sees = (row: Record<string, unknown>) => visible === 'all' || visible.includes((row.firm_id ?? row.id) as string)
  return q => {
    if (q.op === 'rpc') {
      if (q.table === 'check_rate_limit' || q.table === 'claim_impact_job') return { data: true }
      return { data: null }
    }
    if (q.table === 'firm_members') {
      const user = filterValue(q, 'user_id')
      const firm = user === ALPHA.user ? ALPHA.firm : user === BRAVO.user ? BRAVO.firm : null
      return { data: firm && (visible === 'all' || visible.includes(firm)) ? { firm_id: firm, firms: firms.find(f => f.id === firm) } : null }
    }
    // One public document, so the matchers have something to judge.
    if (q.table === 'regulations') {
      if (q.filters.some(f => f[0] === 'single' || f[0] === 'maybeSingle')) return { data: regulation }
      // In whatever category the matcher reads.
      const category = filterValue(q, 'category') ?? q.filters.find(f => f[0] === 'in' && f[1] === 'category')?.[2]?.[0]
      return { data: [{ ...regulation, category: category ?? regulation.category }] }
    }
    if (q.op !== 'select') {
      // A stranger's conversation id is already taken: the insert fails.
      if (q.table === 'regway_ai_conversations' && q.op === 'insert' && (q.payload as { id?: string })?.id === ALPHA.conversation) return { error: { message: 'duplicate key' } }
      // An insert that asks for its new row back gets one.
      return { data: q.filters.some(f => f[0] === 'single') ? { id: `new-${q.table}` } : null }
    }
    const rows = (TABLES[q.table] ?? []).filter(sees).filter(row =>
      q.filters.every(f => (f[0] === 'eq' && typeof f[1] === 'string' && f[1] in row ? row[f[1]] === f[2] : true)),
    )
    const single = q.filters.some(f => f[0] === 'single' || f[0] === 'maybeSingle')
    return { data: single ? (rows[0] ?? null) : rows }
  }
}

// Everything that left a function: AI prompts and any other request.
function stubOutbound() {
  return stubFetch((url, init) => {
    if (url.hostname === 'api.anthropic.com') {
      const body = JSON.parse((init?.body as string) ?? '{}')
      const tool = body.tool_choice?.name as string | undefined
      if (tool || body.output_config?.format) return toolAnswer(body, tool ?? '', {}, { input_tokens: 10, output_tokens: 10 })
      return jsonResponse({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 10 } })
    }
    return new Response('not found', { status: 404 })
  })
}

// Waits for the response body and any background work, but never forever.
async function settle(res: Response, background: Promise<unknown>[]) {
  const done = Promise.allSettled([res.text().catch(() => ''), ...background])
  await Promise.race([done, new Promise(r => setTimeout(r, 3000))])
}

const mentionsAlpha = (value: unknown) => {
  const text = JSON.stringify(value ?? '')
  return ALPHA_SECRETS.filter(s => text.includes(s))
}
const writes = (client: FakeClient) => client.queries.filter(q => q.op !== 'select' && q.op !== 'rpc')

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// The jobs only the timers (and the owner) run: the service key or nothing.

const SERVICE_ONLY = [
  'ai-outage-email',
  'apply-profile-changes',
  'group-duplicates',
  'review-existing-matches',
  'run-matching',
  'send-match-alerts',
  'sync-federal-register',
  'sync-finra-enforcement',
  'sync-regulator-feeds',
  'sync-sec-admin-proceedings',
  'sync-sec-enforcement',
  'sync-travel-advisories',
]

describe('service-key-only functions', () => {
  it.each(SERVICE_ONLY)('%s refuses no key, the public key and a user session, before touching anything', async name => {
    const admin = fakeClient(world('all'), { id: BRAVO.user })
    setClient(admin)
    const { handler } = await loadHandler(name)
    const calls = stubFetch(() => undefined)
    for (const token of [undefined, 'test-anon-key', BRAVO_TOKEN]) {
      const res = await handler(post(name, { token, body: { firmId: ALPHA.firm, force: true } }))
      expect(res.status, `${name} with ${token ?? 'no key'}`).toBe(401)
    }
    expect(admin.queries).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  // The check must not refuse everyone: the timers' own key gets past it.
  it.each(['ai-outage-email', 'apply-profile-changes', 'group-duplicates', 'review-existing-matches', 'run-matching', 'send-match-alerts'])(
    '%s lets the service key through',
    async name => {
      setClient(fakeClient(() => ({ data: null })))
      const { handler, background } = await loadHandler(name)
      stubOutbound()
      const res = await handler(post(name, { token: SERVICE_KEY }))
      await settle(res, background)
      expect(res.status).not.toBe(401)
    },
  )
})

// ---------------------------------------------------------------------------
// The functions a signed-in user calls from the app.

interface UserFunction {
  name: string
  // A valid request from Bravo's member, naming Alpha wherever it can.
  attack: Record<string, unknown>
  // What a caller who belongs to no firm gets.
  noFirm: number
}

const USER_FUNCTIONS: UserFunction[] = [
  { name: 'company-regulations', attack: { companyId: ALPHA.company, firmId: ALPHA.firm }, noFirm: 404 },
  { name: 'match-enforcement-relevance', attack: { firmId: ALPHA.firm }, noFirm: 404 },
  { name: 'match-geopolitical-relevance', attack: { firmId: ALPHA.firm }, noFirm: 404 },
  { name: 'match-relevance', attack: { firmId: ALPHA.firm }, noFirm: 404 },
  { name: 'refresh-entity-impacts', attack: { scope: 'company', entityId: ALPHA.company, firmId: ALPHA.firm }, noFirm: 404 },
  // reg-0 is matched to both firms: the analysis must be Bravo's own.
  { name: 'regulation-impact', attack: { regulationId: 'reg-0', firmId: ALPHA.firm, force: true }, noFirm: 404 },
  {
    name: 'regway-ai-chat',
    attack: { message: 'What does my portfolio face?', firmId: ALPHA.firm, context: { type: 'company', id: ALPHA.company, name: 'Bravo Logistics' } },
    noFirm: 404,
  },
  { name: 'rematch-regulation', attack: { regulationId: 'reg-1', firmId: ALPHA.firm }, noFirm: 404 },
  { name: 'research-firm', attack: { firmId: ALPHA.firm }, noFirm: 404 },
]

// The server key sees everything; Bravo's session sees Bravo's rows only.
function attackerWorld(user: { id: string } | null = { id: BRAVO.user }, visible: string[] = [BRAVO.firm]) {
  const admin = fakeClient(world('all'), user)
  const session = fakeClient(world(visible), user)
  setClient(admin)
  setSessionClients({ [`Bearer ${BRAVO_TOKEN}`]: session })
  return { admin, session }
}

describe('user-facing functions', () => {
  it.each(USER_FUNCTIONS)('$name refuses a request with no sign-in, before any AI call', async ({ name, attack }) => {
    const { admin } = attackerWorld()
    const { handler } = await loadHandler(name)
    const calls = stubOutbound()
    const res = await handler(post(name, { body: attack }))
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
    expect(writes(admin)).toHaveLength(0)
  })

  it.each(USER_FUNCTIONS)('$name refuses a token that is not a signed-in user', async ({ name, attack }) => {
    // The access rules give a stranger's session nothing; getUser finds no one.
    const { admin, session } = attackerWorld(null, [])
    const { handler } = await loadHandler(name)
    const calls = stubOutbound()
    const res = await handler(post(name, { token: BRAVO_TOKEN, body: attack }))
    expect([401, 404]).toContain(res.status)
    expect(calls).toHaveLength(0)
    expect([...writes(admin), ...writes(session)]).toHaveLength(0)
  })

  it.each(USER_FUNCTIONS.filter(f => f.name !== 'company-regulations'))('$name refuses a signed-in user who belongs to no firm', async ({ name, attack, noFirm }) => {
    const { admin, session } = attackerWorld({ id: 'user-without-firm' }, [])
    const { handler } = await loadHandler(name)
    const calls = stubOutbound()
    const res = await handler(post(name, { token: BRAVO_TOKEN, body: attack }))
    expect(res.status).toBe(noFirm)
    expect(calls).toHaveLength(0)
    expect([...writes(admin), ...writes(session)]).toHaveLength(0)
  })

  it.each(USER_FUNCTIONS)("$name never lets Bravo's member reach Alpha's data, whatever the request names", async ({ name, attack }) => {
    const { admin, session } = attackerWorld()
    const { handler, background } = await loadHandler(name)
    const calls = stubOutbound()
    const res = await handler(post(name, { token: BRAVO_TOKEN, body: attack }))
    await settle(res, background)

    // Nothing of Alpha's went to the AI or anywhere else...
    for (const call of calls) expect(mentionsAlpha([call.url.toString(), call.init?.body]), `${name} sent Alpha's data to ${call.url.host}`).toEqual([])
    // ...nothing was written for or about Alpha...
    for (const q of [...writes(admin), ...writes(session)]) expect(mentionsAlpha([q.payload, q.filters]), `${name} wrote to ${q.table}`).toEqual([])
    // ...and the server-key reads that scope by firm used Bravo's, from the session.
    for (const q of admin.queries) {
      const firm = filterValue(q, 'firm_id')
      if (firm !== undefined) expect(firm, `${name} read ${q.table} for another firm`).toBe(BRAVO.firm)
    }
  })

  it("company-regulations will not scan another firm's company", async () => {
    const { admin } = attackerWorld()
    const { handler } = await loadHandler('company-regulations')
    const calls = stubOutbound()
    const res = await handler(post('company-regulations', { token: BRAVO_TOKEN, body: { companyId: ALPHA.company } }))
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
    expect(admin.queries).toHaveLength(0)
  })

  it("regway-ai-chat will not open or write to another user's conversation", async () => {
    const { admin, session } = attackerWorld()
    const { handler } = await loadHandler('regway-ai-chat')
    const calls = stubOutbound()
    const res = await handler(post('regway-ai-chat', { token: BRAVO_TOKEN, body: { message: 'Hello', conversationId: ALPHA.conversation } }))
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
    const touched = [...writes(admin), ...writes(session)].filter(q => q.table !== 'regway_ai_conversations' || q.op !== 'insert')
    expect(touched).toHaveLength(0)
  })

  it("regway-ai-chat will not refocus a conversation onto another firm's company", async () => {
    const { session } = attackerWorld()
    const { handler, background } = await loadHandler('regway-ai-chat')
    const calls = stubOutbound()
    const res = await handler(post('regway-ai-chat', { token: BRAVO_TOKEN, body: { message: 'Hello', refocus: { type: 'company', id: ALPHA.company } } }))
    await settle(res, background)
    const lookup = session.queries.find(q => q.table === 'portfolio_companies' && filterValue(q, 'id') === ALPHA.company)
    expect(lookup && filterValue(lookup, 'firm_id')).toBe(BRAVO.firm)
    for (const call of calls) expect(mentionsAlpha(call.init?.body)).toEqual([])
  })
})
