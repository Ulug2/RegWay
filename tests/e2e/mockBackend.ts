import { test as base, expect, type Page, type Route } from '@playwright/test'
import { FAKE_SUPABASE_URL } from '../../playwright.config'

// A mock Supabase for the browser: in-memory tables behind the REST API the
// app calls, canned edge functions, and a signed-in session. Each test gets
// its own, seeded with one firm (see `seed`).

type Row = Record<string, any>

export const USER = { id: 'user-1', email: 'dana@harbor.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' }
export const FIRM_ID = 'firm-1'
const STORAGE_KEY = 'sb-localhost-auth-token'

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
export const ACCESS_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, exp: 4102444800, iat: 1700000000, role: 'authenticated' })}.signature`

const session = () => ({
  access_token: ACCESS_TOKEN,
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: USER,
})

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export const regulation = (id: string, over: Row): Row => ({
  id,
  source: 'federal_register',
  category: 'regulatory',
  countries: [],
  title: id,
  agency: 'Securities and Exchange Commission',
  jurisdiction: 'Securities and Exchange Commission · Federal',
  summary: null,
  published_date: daysAgo(3),
  effective_date: null,
  source_url: `https://www.federalregister.gov/d/${id}`,
  on_public_inspection: false,
  ...over,
})

export const REGS = {
  formPf: regulation('reg-form-pf', { title: 'Form PF; Reporting Requirements for Private Fund Advisers', summary: 'Amends Form PF reporting.', published_date: daysAgo(-1), on_public_inspection: true }),
  adviserCase: regulation('reg-case', { source: 'sec_enforcement', category: 'enforcement', title: 'SEC Charges Private Fund Adviser Over Fee Disclosures', jurisdiction: 'Federal', published_date: daysAgo(10) }),
  tariff: regulation('reg-tariff', { category: 'geopolitical', title: 'Section 232 Tariff on Aircraft Parts From Italy', agency: 'Trade Representative', jurisdiction: 'Trade Representative · Federal', countries: ['Italy'], published_date: daysAgo(200) }),
  medicare: regulation('reg-medicare', { title: 'Medicare Program; Hospital Outpatient Payment Update', agency: 'Centers for Medicare & Medicaid Services', jurisdiction: 'Centers for Medicare & Medicaid Services · Federal', summary: 'Updates payment rates.', published_date: daysAgo(5) }),
}

// Matched early today (local time), so pages, which open on today's
// findings, list them. Tests about other days set their own.
export const todayAt = (hours: number, minutes = 0) => {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

export const daysAgoAt = (days: number, hours = 12) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hours, 0, 0, 0)
  return d.toISOString()
}

export const relevance = (id: string, reg: Row, over: Row): Row => ({
  id,
  firm_id: FIRM_ID,
  regulation_id: reg.id,
  fund_id: null,
  portfolio_company_id: null,
  relevance_reason: 'Relevant.',
  via_holdings: false,
  dismissed_at: null,
  created_at: todayAt(0, 0),
  regulations: reg,
  funds: null,
  portfolio_companies: null,
  ...over,
})

const recently = () => new Date(Date.now() - 3_600_000).toISOString()

function seed(): Record<string, Row[]> {
  return {
    firm_members: [{ user_id: USER.id, firm_id: FIRM_ID }],
    firms: [{ id: FIRM_ID, name: 'Harbor Capital', hq_location: 'Miami, Florida', lead_gp_name: 'Dana Reyes', jurisdictions: ['United States'], website: null, profile: {}, profile_updated_at: null, created_at: daysAgoAt(20) }],
    funds: [
      { id: 'fund-1', firm_id: FIRM_ID, name: 'Harbor Fund I', size: '$1B', structure: 'Delaware LP', jurisdictions: ['United States'], profile: {}, profile_updated_at: null },
      { id: 'fund-2', firm_id: FIRM_ID, name: 'Harbor Fund II', size: '$2B', structure: 'Cayman LP', jurisdictions: ['Cayman Islands'], profile: {}, profile_updated_at: null },
    ],
    portfolio_companies: [
      { id: 'co-aero', firm_id: FIRM_ID, name: 'Aero Logistics', sectors: ['Aerospace'], regions: ['Italy'], hq_location: 'Naples, Italy', aum: null, offerings: 'Aircraft parts logistics', website: null, profile: {}, last_scanned_at: recently(), profile_updated_at: null, logo_url: null },
      { id: 'co-getix', firm_id: FIRM_ID, name: 'GetixHealth', sectors: ['Healthcare'], regions: ['United States'], hq_location: 'Houston, Texas', aum: null, offerings: 'Revenue cycle management', website: null, profile: {}, last_scanned_at: recently(), profile_updated_at: null, logo_url: null },
    ],
    fund_holdings: [],
    regulation_relevance: [
      relevance('rel-1', REGS.formPf, { relevance_reason: 'The firm is a registered adviser that files Form PF.' }),
      relevance('rel-2', REGS.adviserCase, { relevance_reason: 'The firm charges similar monitoring fees.' }),
      relevance('rel-3', REGS.tariff, { relevance_reason: 'Firm-level view of the Italy tariff.' }),
      relevance('rel-4', regulation('reg-rejected', { title: 'A rule judged not relevant' }), { relevance_reason: 'NOT_RELEVANT: different sector.' }),
      relevance('rel-5', REGS.medicare, { portfolio_company_id: 'co-getix', portfolio_companies: { name: 'GetixHealth' }, relevance_reason: 'GetixHealth bills Medicare for hospital clients.' }),
      relevance('rel-6', REGS.tariff, { portfolio_company_id: 'co-aero', portfolio_companies: { name: 'Aero Logistics' }, relevance_reason: 'Direct: Aero Logistics is headquartered in Italy.' }),
      relevance('rel-7', REGS.tariff, { fund_id: 'fund-1', funds: { name: 'Harbor Fund I' }, via_holdings: true, relevance_reason: 'Indirect: Harbor Fund I holds Aero Logistics, which has a direct connection: Aero Logistics is headquartered in Italy.' }),
    ],
    // Developments no one is matched to; matched ones are read from
    // regulation_relevance (see `select`).
    regulations: [],
    // AI work a profile edit asked for, waiting for the edits to stop.
    profile_changes: [],
    regulation_impacts: [],
    regulation_flags: [],
    regulation_notes: [],
    sync_runs: [{ source: 'federal_register', ok: true, ran_at: recently() }],
    regway_ai_conversations: [],
    regway_ai_messages: [],
    // Web research on the firm (item 18): runs and what they proposed.
    firm_research_runs: [],
    firm_findings: [],
  }
}

export interface Call {
  method: string
  path: string // "rest/v1/funds" or "functions/v1/regway-ai-chat"
  query: URLSearchParams
  body: any
}

// `delay` (ms) holds the reply back, e.g. so a test can stop an answer before it arrives.
type FunctionReply = { status?: number; json?: unknown; sse?: string; delay?: number }
type FunctionHandler = (body: any) => FunctionReply

// PostgREST's filter syntax, as far as the app uses it.
function matches(row: Row, column: string, expr: string): boolean {
  if (column.includes('.')) return true // a filter on an embedded table
  const value = row[column]
  const [op, ...rest] = expr.split('.')
  const arg = rest.join('.')
  if (op === 'eq') return String(value) === arg
  if (op === 'is') return arg === 'null' ? value == null : String(value) === arg
  if (op === 'in') return arg.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(value))
  if (op === 'gt') return String(value) > arg
  if (op === 'not') return !matches(row, column, arg)
  if (op === 'like') return new RegExp(`^${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%|\\\*/g, '.*')}$`).test(String(value ?? ''))
  throw new Error(`mockBackend: unsupported filter ${column}=${expr}`)
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }

export class MockBackend {
  tables = seed()
  calls: Call[] = []
  password = 'correct-password'
  // Set to make Supabase refuse a new password, as its Auth settings would:
  // e.g. ['pwned'] for one found in a breach.
  weakPasswordReasons: string[] | null = null
  // What a database function answers, by name; true for any not listed.
  rpc: Record<string, unknown> = {
    ai_status: [{ failing: false, reason: null, since: null }],
  }
  // A database function that should fail, by name, with this status.
  rpcStatus: Record<string, number> = {}

  functions: Record<string, FunctionHandler> = {
    'match-geopolitical-relevance': () => ({ json: { evaluated: 0, relevant: 0, candidates: 0, fundRowsChanged: 0 } }),
    'refresh-entity-impacts': () => ({ json: {} }),
    'research-firm': () => ({ status: 202, json: { runId: 'run-new', status: 'running' } }),
  }

  // Calls to one endpoint, e.g. called('POST', 'functions/v1/regway-ai-chat').
  called(method: string, path: string): Call[] {
    return this.calls.filter(c => c.method === method && c.path === path)
  }

  // Every development once: the ones matched to someone and the rest.
  private regulations(): Row[] {
    const all = [...this.tables.regulation_relevance.map(r => r.regulations as Row), ...this.tables.regulations]
    return [...new Map(all.map(r => [r.id, r])).values()]
  }

  private select(table: string, query: URLSearchParams): Row[] {
    const rows = table === 'regulations' ? this.regulations() : this.tables[table]
    if (!rows) throw new Error(`mockBackend: no table "${table}"; add it to seed()`)
    let out = rows.filter(row => [...query].every(([k, v]) => RESERVED.has(k) || matches(row, k, v)))
    const order = query.get('order')
    if (order) {
      const [column, direction] = order.split('.')
      out = [...out].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (direction === 'desc' ? -1 : 1))
    }
    const limit = query.get('limit')
    return limit ? out.slice(0, Number(limit)) : out
  }

  private rest(method: string, table: string, query: URLSearchParams, body: any, accept: string): FunctionReply {
    if (method === 'GET' || method === 'HEAD') {
      const rows = this.select(table, query)
      if (!accept.includes('vnd.pgrst.object')) return { json: rows }
      return rows.length === 1 ? { json: rows[0] } : { status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` } }
    }
    if (method === 'POST') {
      for (const row of Array.isArray(body) ? body : [body]) this.tables[table].push({ ...row })
      return { status: 201, json: null }
    }
    const targets = new Set(this.select(table, query))
    if (method === 'PATCH') for (const row of targets) Object.assign(row, body)
    if (method === 'DELETE') this.tables[table] = this.tables[table].filter(row => !targets.has(row))
    return { status: 204 }
  }

  private auth(method: string, path: string, query: URLSearchParams, body: any): FunctionReply {
    if (path === 'auth/v1/user' && method === 'PUT') {
      if (body?.password && this.weakPasswordReasons) {
        return { status: 422, json: { code: 422, error_code: 'weak_password', msg: 'Password is too weak', weak_password: { reasons: this.weakPasswordReasons } } }
      }
      if (body?.password) this.password = body.password
      return { json: USER }
    }
    if (path === 'auth/v1/user') return { json: USER }
    if (path === 'auth/v1/token' && query.get('grant_type') === 'password') {
      return body?.password === this.password ? { json: session() } : { status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }
    }
    if (path === 'auth/v1/token') return { json: session() }
    if (path === 'auth/v1/logout') return { status: 204 }
    if (path === 'auth/v1/recover') return { json: {} }
    throw new Error(`mockBackend: unhandled auth call ${method} ${path}`)
  }

  private handle(method: string, path: string, query: URLSearchParams, body: any, accept: string): FunctionReply {
    if (path.startsWith('auth/v1/')) return this.auth(method, path, query, body)
    if (path.startsWith('rest/v1/rpc/')) {
      const name = path.slice('rest/v1/rpc/'.length)
      if (this.rpcStatus[name]) return { status: this.rpcStatus[name], json: { code: 'P0002', message: 'failed' } }
      return { json: this.rpc[name] ?? true }
    }
    if (path.startsWith('rest/v1/')) return this.rest(method, path.slice('rest/v1/'.length), query, body, accept)
    if (path.startsWith('functions/v1/')) {
      const name = path.slice('functions/v1/'.length)
      const handler = this.functions[name]
      // An unexpected function call is a test failure, not a silent no-op:
      // in production it could be one that costs money.
      if (!handler) return { status: 500, json: { error: `mockBackend: unexpected call to ${name}` } }
      return handler(body)
    }
    throw new Error(`mockBackend: unhandled ${method} ${path}`)
  }

  async route(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const path = url.pathname.slice(1)
    let body: any = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    this.calls.push({ method, path, query: url.searchParams, body })
    const reply = this.handle(method, path, url.searchParams, body, request.headers().accept ?? '')
    if (reply.delay) await new Promise(resolve => setTimeout(resolve, reply.delay))
    if (reply.sse !== undefined) return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream' }, body: reply.sse })
    const status = reply.status ?? 200
    return route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: status === 204 ? undefined : JSON.stringify(reply.json ?? null) })
  }
}

// An Anthropic event stream, as regway-ai-chat forwards it to the browser.
export function aiReply(text: string, citations: { url: string; title: string }[] = []): string {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    ...citations.map(citation => ({ type: 'content_block_delta', delta: { type: 'citations_delta', citation } })),
    { type: 'message_delta', usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  ]
  return events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
}

// The link in a password-reset email, as Supabase redirects it back to the app.
export const RECOVERY_LINK = `/#access_token=${ACCESS_TOKEN}&expires_in=3600&refresh_token=recovery-refresh&token_type=bearer&type=recovery`

export async function signIn(page: Page) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(session())] as const)
}

export const test = base.extend<{ backend: MockBackend }>({
  // Auto: every test gets the mock, whether or not it asks for `backend`.
  // Without it the app's requests would simply fail.
  backend: [
    async ({ page }, use) => {
      const backend = new MockBackend()
      await page.route(`${FAKE_SUPABASE_URL}/**`, route => backend.route(route))
      // Realtime: accept the socket and stay silent.
      await page.routeWebSocket(/\/realtime\/v1\//, () => {})
      await use(backend)
    },
    { auto: true },
  ],
})

export { expect }
