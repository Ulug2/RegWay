import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query, type Resolver } from './helpers/fakeSupabase'
import { loadHandler, post, stubFetch } from './helpers/handler'

const FIRM = 'firm-1'
const CONVERSATION = '11111111-1111-4111-8111-111111111111'

interface State {
  member?: boolean
  allowed?: boolean
  // The caller's own saved conversation, if it exists. RLS hides anyone else's.
  conversation?: { context: unknown } | null
  // Someone else already owns this id: the insert hits the primary key.
  idTaken?: boolean
  history?: { role: 'user' | 'assistant'; content: string }[] // oldest first
  matches?: unknown[]
  funds?: unknown[]
  companies?: unknown[]
  holdings?: unknown[]
  firmProfile?: Record<string, unknown>
  // What a refocus lookup finds among the caller's own funds / companies.
  refocusTarget?: { id: string; name: string } | null
  // Web research the firm has not confirmed (firm_findings, pending).
  findings?: unknown[]
}

function database(state: State): Resolver {
  return (q: Query) => {
    if (q.table === 'firm_members') return { data: state.member === false ? null : { firm_id: FIRM, firms: { name: 'H.I.G. Capital', hq_location: 'Miami, Florida', jurisdictions: ['United States'], profile: state.firmProfile ?? {} } } }
    if (q.table === 'check_rate_limit') return { data: state.allowed ?? true }
    if (q.table === 'regway_ai_conversations') {
      if (q.op === 'select') return { data: state.conversation ?? null }
      if (q.op === 'insert') return state.idTaken ? { error: { code: '23505' } } : {}
    }
    // The function reads newest first.
    if (q.table === 'regway_ai_messages' && q.op === 'select') return { data: [...(state.history ?? [])].reverse() }
    if ((q.table === 'funds' || q.table === 'portfolio_companies') && q.columns === 'id, name') return { data: state.refocusTarget ?? null }
    if (q.table === 'funds') return { data: state.funds ?? [{ id: 'fund-1', name: 'Fund I', size: '$1B', structure: 'Delaware LP', jurisdictions: ['United States'], profile: {} }] }
    if (q.table === 'portfolio_companies') return { data: state.companies ?? [{ id: 'co-1', name: 'GetixHealth', hq_location: 'Houston, Texas', sectors: ['Healthcare'], regions: ['United States'], offerings: null, profile: {} }] }
    if (q.table === 'fund_holdings') return { data: state.holdings ?? [] }
    if (q.table === 'firm_findings') return { data: state.findings ?? [] }
    if (q.table === 'regulation_relevance') return { data: state.matches ?? [] }
  }
}

const match = (id: string, title: string, published: string, reason: string, over: Record<string, unknown> = {}) => ({
  relevance_reason: reason,
  fund_id: null,
  portfolio_company_id: 'co-1',
  funds: null,
  portfolio_companies: { name: 'GetixHealth' },
  regulations: { id, title, category: 'regulatory', agency: 'CMS', jurisdiction: null, published_date: published, on_public_inspection: false },
  ...over,
})

const sse = (events: unknown[]) => events.map(e => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('')

const REPLY = sse([
  { type: 'message_start', message: { usage: { input_tokens: 300, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 1 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Two rules ' } },
  { type: 'content_block_delta', delta: { type: 'citations_delta', citation: { url: 'https://www.cms.gov/rule', title: 'CMS rule' } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'apply.' } },
  { type: 'message_delta', usage: { output_tokens: 42, server_tool_use: { web_search_requests: 2 } } },
])

// Splits the reply mid-line, as a network would.
function streamed(text: string) {
  const bytes = new TextEncoder().encode(text)
  const cut = Math.floor(bytes.length / 2) + 3
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut))
        controller.enqueue(bytes.slice(cut))
        controller.close()
      },
    }),
  )
}

async function chat(state: State, body: Record<string, unknown>, opts: { token?: string | null; anthropic?: () => Response } = {}) {
  const db = fakeClient(database(state))
  setClient(db)
  const { handler } = await loadHandler('regway-ai-chat')
  const calls = stubFetch(url => (url.hostname === 'api.anthropic.com' ? (opts.anthropic?.() ?? streamed(REPLY)) : undefined))
  const res = await handler(post('regway-ai-chat', { token: opts.token === null ? undefined : (opts.token ?? 'user-jwt'), body }))
  const text = await res.text() // drains the stream, which is what saves the exchange
  const request = calls[0] ? JSON.parse(calls[0].init!.body as string) : null
  return { res, text, db, calls, request, system: (request?.system?.[0]?.text ?? '') as string }
}

describe('regway-ai-chat', () => {
  it('requires a message, a session and a firm', async () => {
    expect((await chat({}, {})).res.status).toBe(400)
    expect((await chat({}, { message: 'hi' }, { token: null })).res.status).toBe(401)
    expect((await chat({ member: false }, { message: 'hi' })).res.status).toBe(404)
  })

  it('stops at the rate limit before calling the model or starting a conversation', async () => {
    const { res, calls, db } = await chat({ allowed: false }, { message: 'hi', conversationId: CONVERSATION })
    expect(res.status).toBe(429)
    expect(calls).toEqual([])
    expect(db.ran('regway_ai_conversations')).toEqual([])
  })

  it.each([
    ['a very long message', { message: 'x'.repeat(10_001) }, /Message is too long/],
    ['an oversized text attachment', { message: 'Summarise', attachment: { name: 'big.txt', mimeType: 'text/plain', content: 'x'.repeat(160_001) } }, /text file is too large/],
    ['an oversized PDF', { message: 'Summarise', attachment: { name: 'big.pdf', mimeType: 'application/pdf', base64Data: 'x'.repeat(7_000_001) } }, /PDF is too large/],
  ])('refuses %s before reading or spending anything', async (_, body, error) => {
    const { res, text, calls, db } = await chat({}, body)
    expect(res.status).toBe(413)
    expect(JSON.parse(text).error).toMatch(error)
    expect(calls).toEqual([])
    expect(db.queries).toEqual([])
  })

  it('accepts a message and attachment at the limits', async () => {
    const { res } = await chat({}, { message: 'x'.repeat(10_000), attachment: { name: 'ok.txt', mimeType: 'text/plain', content: 'x'.repeat(160_000) } })
    expect(res.status).toBe(200)
  })

  it('gives the model everything recorded about the firm, its funds and its companies', async () => {
    const { system } = await chat(
      {
        firmProfile: { firm_type: 'Private equity', adviser_registration: 'SEC-registered investment adviser', strategies: ['Buyout', 'Growth'] },
        funds: [
          { id: 'fund-1', name: 'Fund I', size: '$1B', structure: 'Delaware LP', jurisdictions: ['United States'], profile: { strategy: 'Buyout', status: 'Investing' } },
          { id: 'fund-2', name: 'Fund II', size: null, structure: 'Cayman LP', jurisdictions: [], profile: {} },
        ],
        companies: [
          { id: 'co-1', name: 'GetixHealth', hq_location: 'Houston, Texas', sectors: ['Healthcare'], regions: ['United States'], offerings: 'Revenue cycle management', profile: { sensitive_data: 'yes', license_types: ['Collection agency'] } },
          { id: 'co-2', name: 'Aero Logistics', hq_location: null, sectors: ['Aerospace'], regions: [], offerings: null, profile: { hq: { city: 'Naples', state: '', country: 'Italy' }, supplier_locations: ['Vietnam'] } },
        ],
        holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'co-1' }],
      },
      { message: 'What licences does GetixHealth hold?' },
    )
    expect(system).toContain('Firm profile: hq_location: Miami, Florida; jurisdictions: United States; firm_type: Private equity; adviser_registration: SEC-registered investment adviser; strategies: Buyout, Growth; not recorded: legal_domicile.')
    expect(system).toContain('- Fund I: structure: Delaware LP; size: $1B; jurisdictions: United States; status: Investing; strategy: Buyout; holds: GetixHealth')
    // A blank fact that would change a conclusion is named, not left out.
    expect(system).toContain('- Fund I: structure: Delaware LP; size: $1B; jurisdictions: United States; status: Investing; strategy: Buyout; holds: GetixHealth; not recorded: ownership')
    expect(system).toContain('- Fund II: structure: Cayman LP; not recorded: status, strategy, ownership')
    expect(system).not.toMatch(/- Fund II:.*holds/)
    expect(system).toContain('- GetixHealth: hq_location: Houston, Texas; sectors: Healthcare; regions: United States; offerings: Revenue cycle management; sensitive_data: yes; license_types: Collection agency; not recorded: supplier_locations, customers, consumer_facing, regulated, gov_contracts, trade, outside_us; held by: Fund I')
    expect(system).toContain('- Aero Logistics: sectors: Aerospace; supplier_locations: Vietnam; not recorded: regions, customers,')
    expect(system).not.toMatch(/- Aero Logistics:.*held by/)
    // Missing is not "no".
    expect(system).toContain('A fact that isn\'t listed is not recorded, which is different from "no"')
    expect(system).toContain('A fact listed under "not recorded" is unknown: never treat it as a "no" or as absent')
  })

  it("reads profiles through the user's own access, limited to their firm", async () => {
    const { db } = await chat({}, { message: 'hi' })
    for (const table of ['funds', 'portfolio_companies', 'fund_holdings']) {
      expect(hasFilter(db.ran(table)[0], 'eq', 'firm_id', FIRM)).toBe(true)
    }
  })

  it('caps one entity\'s line so a very long answer cannot crowd out the rest', async () => {
    const { system } = await chat({ companies: [{ id: 'co-1', name: 'Wordy', hq_location: null, sectors: [], regions: [], offerings: 'y'.repeat(5000), profile: {} }, { id: 'co-2', name: 'Next', hq_location: 'Ohio', sectors: [], regions: [], offerings: null, profile: {} }] }, { message: 'hi' })
    const wordy = system.split('\n').find(l => l.startsWith('- Wordy'))!
    expect(wordy.length).toBe(1200)
    expect(system).toContain('- Next: hq_location: Ohio')
  })

  it("answers from the firm's matched developments, newest first, with each entity's reason", async () => {
    const { system } = await chat(
      {
        matches: [
          match('r1', 'Older Medicare rule', '2026-09-01', 'GetixHealth bills Medicare.'),
          match('r2', 'Form PF amendments', '2026-10-05', 'The firm files Form PF.', { portfolio_company_id: null, portfolio_companies: null, regulations: { id: 'r2', title: 'Form PF amendments', category: 'regulatory', agency: 'SEC', jurisdiction: null, published_date: '2026-10-05', on_public_inspection: true } }),
          match('r1', 'Older Medicare rule', '2026-09-01', 'Indirect: Fund I holds GetixHealth.', { fund_id: 'fund-1', portfolio_company_id: null, funds: { name: 'Fund I' }, portfolio_companies: null }),
        ],
      },
      { message: "What's relevant to us right now?" },
    )
    expect(system).toContain('Developments RegWay has already matched to this firm, its funds and its portfolio companies')
    expect(system).toContain('- [regulatory] Form PF amendments (SEC, scheduled for publication 2026-10-05)\n   - Firm H.I.G. Capital: The firm files Form PF.')
    expect(system).toContain('- [regulatory] Older Medicare rule (CMS, published 2026-09-01)\n   - Company GetixHealth: GetixHealth bills Medicare.\n   - Fund Fund I: Indirect: Fund I holds GetixHealth.')
    expect(system.indexOf('Form PF amendments')).toBeLessThan(system.indexOf('Older Medicare rule'))
  })

  it('lists a development once when it was published twice, keeping every entity matched to either version', async () => {
    const first = { id: 'gc', title: 'GC26/6: Primary Market Bulletin No. 66', category: 'regulatory', agency: 'FCA', jurisdiction: null, published_date: '2026-09-30', on_public_inspection: false, source: 'fca_publications', duplicate_of: null }
    const second = { ...first, id: 'fg', title: 'FG26/8: Primary Market Bulletin No. 66', duplicate_of: 'gc' }
    const firmLevel = { portfolio_company_id: null, portfolio_companies: null }
    const { system } = await chat(
      {
        matches: [
          match('fg', second.title, '2026-09-30', 'The firm lists securities in London (second listing).', { ...firmLevel, regulations: second }),
          match('fg', second.title, '2026-09-30', 'GetixHealth has listed debt.', { regulations: second }),
          match('gc', first.title, '2026-09-30', 'The firm lists securities in London.', { ...firmLevel, regulations: first }),
        ],
      },
      { message: "What's relevant to us right now?" },
    )
    expect(system).toContain(
      '- [regulatory] GC26/6: Primary Market Bulletin No. 66 (FCA, published 2026-09-30)\n   - Firm H.I.G. Capital: The firm lists securities in London.\n   - Company GetixHealth: GetixHealth has listed debt.\n   - Also published as: FG26/8: Primary Market Bulletin No. 66',
    )
    expect(system).not.toContain('- [regulatory] FG26/8')
    expect(system).not.toContain('(second listing)')
  })

  it('names the official document, not the announcement of it, once the document is matched', async () => {
    const announcement = { id: 'news', title: 'SEC Proposes Crypto Custody Rules', category: 'regulatory', agency: 'SEC', jurisdiction: null, published_date: '2026-10-01', on_public_inspection: false, source: 'sec_news', duplicate_of: null }
    const document = { ...announcement, id: 'doc', title: 'Adviser and Regulated Fund Custody Rules', published_date: '2026-10-06', source: 'federal_register', duplicate_of: 'news' }
    const firmLevel = { portfolio_company_id: null, portfolio_companies: null }
    const { system } = await chat(
      {
        matches: [
          match('news', announcement.title, '2026-10-01', 'The firm is a registered adviser (announcement).', { ...firmLevel, regulations: announcement }),
          match('doc', document.title, '2026-10-06', 'The firm is a registered adviser with custody.', { ...firmLevel, regulations: document }),
        ],
      },
      { message: "What's relevant to us right now?" },
    )
    expect(system).toContain(
      '- [regulatory] Adviser and Regulated Fund Custody Rules (SEC, published 2026-10-06)\n   - Firm H.I.G. Capital: The firm is a registered adviser with custody.\n   - Also published as: SEC Proposes Crypto Custody Rules',
    )
    expect(system).not.toContain('- [regulatory] SEC Proposes Crypto Custody Rules')
    expect(system).not.toContain('(announcement)')
  })

  it('says so when nothing has been matched, without claiming nothing applies', async () => {
    const { system } = await chat({}, { message: 'Anything new?' })
    expect(system).toContain('RegWay has not matched any developments')
    expect(system).toContain("That isn't proof nothing applies")
  })

  it('narrows the matches to the fund, company or regulation the chat was opened from', async () => {
    const forCompany = await chat({}, { message: 'What applies here?', context: { type: 'company', id: 'co-1', name: 'GetixHealth' } })
    const query = forCompany.db.ran('regulation_relevance')[0]
    expect(hasFilter(query, 'eq', 'firm_id', FIRM)).toBe(true)
    expect(hasFilter(query, 'eq', 'portfolio_company_id', 'co-1')).toBe(true)
    expect(hasFilter(query, 'is', 'dismissed_at', null)).toBe(true)
    expect(hasFilter(query, 'not', 'relevance_reason', 'like', 'NOT_RELEVANT:%')).toBe(true)
    expect(forCompany.system).toContain('This conversation is focused on the portfolio company "GetixHealth"')

    const forFund = await chat({}, { message: 'x', context: { type: 'fund', id: 'fund-1', name: 'Fund I' } })
    expect(hasFilter(forFund.db.ran('regulation_relevance')[0], 'eq', 'fund_id', 'fund-1')).toBe(true)
  })

  it('asks which entity is meant only when there are several and no page context', async () => {
    const several = { companies: [{ name: 'A', sectors: [], regions: [] }, { name: 'B', sectors: [], regions: [] }] }
    expect((await chat(several, { message: 'x' })).system).toContain('ask them which one they mean')
    expect((await chat({}, { message: 'x' })).system).not.toContain('ask them which one they mean')
    expect((await chat(several, { message: 'x', context: { type: 'company', id: 'co-1', name: 'A' } })).system).not.toContain('ask them which one they mean')
  })

  it('streams the reply through unchanged and saves the exchange once it ends', async () => {
    const { res, text, db } = await chat({}, { message: 'What applies?' })
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(text).toBe(REPLY)

    const [asked, answered] = db.ran('regway_ai_messages', 'insert')[0].payload as { created_at: string }[]
    expect([asked, answered]).toEqual([
      { firm_id: FIRM, user_id: 'user-1', conversation_id: null, role: 'user', content: 'What applies?', created_at: expect.any(String) },
      { firm_id: FIRM, user_id: 'user-1', conversation_id: null, role: 'assistant', content: 'Two rules apply.', citations: [{ url: 'https://www.cms.gov/rule', title: 'CMS rule' }], created_at: expect.any(String) },
    ])
    // Saved in one insert, so without its own timestamps the answer could
    // sort before its question when the conversation is read back.
    expect(Date.parse(answered.created_at)).toBeGreaterThan(Date.parse(asked.created_at))
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'regway-ai-chat', input_tokens: 300, cache_creation_input_tokens: 2000, output_tokens: 42, web_search_requests: 2 })
  })

  it('starts a conversation on its first message, titled from it, keeping the page it was opened from', async () => {
    const context = { type: 'company', id: 'co-1', name: 'GetixHealth' }
    const { db, request } = await chat({}, { message: '  What does the\n new Medicare rule   mean for us?  ', conversationId: CONVERSATION, context })
    expect(db.ran('regway_ai_conversations', 'insert')[0].payload).toEqual({ id: CONVERSATION, firm_id: FIRM, user_id: 'user-1', title: 'What does the new Medicare rule mean for us?', context })
    expect(request.messages).toHaveLength(1)
    expect((db.ran('regway_ai_messages', 'insert')[0].payload as { conversation_id: string }[]).every(m => m.conversation_id === CONVERSATION)).toBe(true)
    expect(db.ran('regway_ai_conversations', 'update')).toHaveLength(1)
  })

  it('sends earlier turns so a follow-up has the thread', async () => {
    const history = [
      { role: 'user' as const, content: 'My favourite colour is teal.' },
      { role: 'assistant' as const, content: 'Noted.' },
    ]
    const { request, db } = await chat({ conversation: { context: null }, history }, { message: 'What is my favourite colour?', conversationId: CONVERSATION })
    expect(request.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(request.messages[0].content).toBe('My favourite colour is teal.')
    // The last earlier turn carries the cache breakpoint.
    expect(request.messages[1].content).toEqual([{ type: 'text', text: 'Noted.', cache_control: { type: 'ephemeral' } }])
    expect(request.messages[2].content).toEqual([{ type: 'text', text: 'What is my favourite colour?' }])
    expect(db.ran('regway_ai_conversations', 'insert')).toEqual([])
  })

  it('leaves out an empty saved reply and never starts the history with an assistant turn', async () => {
    const history = [
      { role: 'assistant' as const, content: 'Orphaned reply.' },
      { role: 'user' as const, content: 'First question' },
      { role: 'assistant' as const, content: '  ' }, // a stopped reply, saved empty
      { role: 'user' as const, content: 'Second question' },
      { role: 'assistant' as const, content: 'Answer.' },
    ]
    const { request } = await chat({ conversation: { context: null }, history }, { message: 'Third', conversationId: CONVERSATION })
    expect(request.messages.slice(0, -1).map((m: { content: unknown }) => (typeof m.content === 'string' ? m.content : (m.content as { text: string }[])[0].text))).toEqual(['First question', 'Second question', 'Answer.'])
  })

  it('drops the oldest turns of a long conversation', async () => {
    const big = 'x'.repeat(10_000)
    const history = [
      { role: 'user' as const, content: `oldest ${big}` },
      { role: 'assistant' as const, content: `second ${big}` },
      { role: 'user' as const, content: `third ${big}` },
      { role: 'assistant' as const, content: 'latest' },
    ]
    const { request } = await chat({ conversation: { context: null }, history }, { message: 'next', conversationId: CONVERSATION })
    const sent = request.messages.slice(0, -1).map((m: { content: unknown }) => (typeof m.content === 'string' ? m.content : (m.content as { text: string }[])[0].text).slice(0, 6))
    expect(sent).toEqual(['third ', 'latest'])
  })

  it("keeps a resumed conversation on its original scope, whatever page it's reopened from", async () => {
    const saved = { type: 'fund', id: 'fund-1', name: 'Fund I' }
    const { db, system } = await chat({ conversation: { context: saved } }, { message: 'And now?', conversationId: CONVERSATION, context: { type: 'company', id: 'co-9', name: 'Other' } })
    expect(hasFilter(db.ran('regulation_relevance')[0], 'eq', 'fund_id', 'fund-1')).toBe(true)
    expect(system).toContain('focused on the fund "Fund I"')
    expect(system).not.toContain('Other')
  })

  it("refuses another user's conversation id before any AI call", async () => {
    const { res, calls, db } = await chat({ conversation: null, idTaken: true }, { message: 'Show me their chat', conversationId: CONVERSATION })
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
    expect(db.ran('regway_ai_messages')).toEqual([])
  })

  it('inlines a text attachment and sends a PDF as a document, for this turn only', async () => {
    const text = await chat({}, { message: 'Summarise', attachment: { name: 'memo.txt', mimeType: 'text/plain', content: 'Memo body.' } })
    expect(text.request.messages[0].content).toEqual([{ type: 'text', text: 'Summarise\n\n--- Attached file: memo.txt ---\nMemo body.' }])
    // What's saved is the message, not the file.
    expect((text.db.ran('regway_ai_messages', 'insert')[0].payload as { content: string }[])[0].content).toBe('Summarise')

    const pdf = await chat({}, { message: 'Summarise', attachment: { name: 'rule.pdf', mimeType: 'application/pdf', base64Data: 'JVBERi0=' } })
    expect(pdf.request.messages[0].content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } })
  })

  const outage = { anthropic: () => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 }) }

  it('gives the model what web research found but no one confirmed, marked as such', async () => {
    const findings = [
      { scope: 'firm', entity_id: null, field: 'aum', value: '$25B+', source_url: 'https://adviserinfo.sec.gov/firm/1' },
      { scope: 'company', entity_id: 'co-1', field: 'supplier_locations', value: ['Mexico'], source_url: 'https://getixhealth.com/about' },
      { scope: 'company', entity_id: null, field: 'new_entity', value: { name: 'Acme Clinics', description: 'Runs clinics.' }, source_url: 'https://example.com' },
    ]
    const { system, db } = await chat({ findings }, { message: 'hi' })
    expect(system).toContain('FOUND ON THE WEB, NOT CONFIRMED BY THE FIRM')
    expect(system).toContain('- the firm, aum: $25B+ (https://adviserinfo.sec.gov/firm/1)')
    expect(system).toContain('- GetixHealth, supplier_locations: Mexico (https://getixhealth.com/about)')
    expect(system).toContain('- A company the firm has not entered: Acme Clinics: Runs clinics. (https://example.com)')
    expect(hasFilter(db.ran('firm_findings', 'select')[0], 'eq', 'status', 'pending')).toBe(true)

    expect((await chat({}, { message: 'hi' })).system).not.toContain('FOUND ON THE WEB')
  })

  it('reports an API failure plainly, records it, and saves nothing', async () => {
    const { res, text, db } = await chat({}, { message: 'hi' }, outage)
    expect(res.status).toBe(502)
    expect(JSON.parse(text).error).toContain('run out of credit')
    expect(db.ran('regway_ai_messages', 'insert')).toEqual([])
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'regway-ai-chat', ok: false, error: expect.stringMatching(/^credit: Anthropic API error: 400/) })
  })

  it('removes a conversation that an unanswered first message would have started', async () => {
    const { db } = await chat({}, { message: 'hi', conversationId: CONVERSATION }, outage)
    expect(db.ran('regway_ai_conversations', 'insert')).toHaveLength(1)
    const [removed] = db.ran('regway_ai_conversations', 'delete')
    expect(hasFilter(removed, 'eq', 'id', CONVERSATION)).toBe(true)
  })

  // The reader goes away mid-answer: the stop button, or a closed tab.
  async function stopped(state: State, body: Record<string, unknown>) {
    const db = fakeClient(database(state))
    setClient(db)
    const { handler } = await loadHandler('regway-ai-chat')
    const half = new TextEncoder().encode(REPLY.slice(0, 40))
    stubFetch(url => (url.hostname === 'api.anthropic.com' ? new Response(new ReadableStream({ start: c => c.enqueue(half) })) : undefined))
    const res = await handler(post('regway-ai-chat', { token: 'user-jwt', body }))
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    return db
  }

  it('removes a conversation whose first answer was stopped, and saves nothing', async () => {
    const db = await stopped({}, { message: 'hi', conversationId: CONVERSATION })
    expect(db.ran('regway_ai_messages', 'insert')).toEqual([])
    const [removed] = db.ran('regway_ai_conversations', 'delete')
    expect(hasFilter(removed, 'eq', 'id', CONVERSATION)).toBe(true)
  })

  it('keeps an existing conversation when a later answer is stopped', async () => {
    const db = await stopped({ conversation: { context: null } }, { message: 'again', conversationId: CONVERSATION })
    expect(db.ran('regway_ai_conversations', 'delete')).toEqual([])
  })

  it('keeps an existing conversation when a later message fails', async () => {
    const { db } = await chat({ conversation: { context: null } }, { message: 'again', conversationId: CONVERSATION }, outage)
    expect(db.ran('regway_ai_conversations', 'delete')).toEqual([])
  })
})

describe('switching the focus mid-conversation', () => {
  const earlier = [
    { role: 'user' as const, content: 'What applies to the firm?' },
    { role: 'assistant' as const, content: 'Form PF.' },
  ]

  it('saves the new focus on the conversation, scopes the prompt to it and tells the model on that turn', async () => {
    const { db, request, system } = await chat(
      { conversation: { context: null }, history: earlier, refocusTarget: { id: 'co-1', name: 'GetixHealth' } },
      { message: 'And for this company?', conversationId: CONVERSATION, refocus: { type: 'company', id: 'co-1' } },
    )
    const update = db.ran('regway_ai_conversations', 'update').find(u => (u.payload as { context?: unknown }).context !== undefined)
    expect(update!.payload).toEqual({ context: { type: 'company', id: 'co-1', name: 'GetixHealth' } })
    expect(system).toContain('This conversation is focused on the portfolio company "GetixHealth"')
    expect(hasFilter(db.ran('regulation_relevance', 'select')[0], 'eq', 'portfolio_company_id', 'co-1')).toBe(true)
    const turn = request.messages[request.messages.length - 1].content.find((b: { type: string }) => b.type === 'text').text
    expect(turn).toMatch(/^\[The user has switched this conversation's focus to the portfolio company "GetixHealth"/)
    expect(turn).toContain('And for this company?')
  })

  it('back to the whole firm clears the stored focus', async () => {
    const { db, system } = await chat(
      { conversation: { context: { type: 'company', id: 'co-1', name: 'GetixHealth' } }, history: earlier },
      { message: 'Now the whole firm', conversationId: CONVERSATION, refocus: { type: 'firm' } },
    )
    const update = db.ran('regway_ai_conversations', 'update').find(u => (u.payload as { context?: unknown }).context !== undefined)
    expect(update!.payload).toEqual({ context: null })
    expect(system).not.toContain('This conversation is focused on')
  })

  it("refuses a fund or company that isn't the caller's, before any AI call", async () => {
    const { res, calls } = await chat({ conversation: { context: null }, refocusTarget: null }, { message: 'x', conversationId: CONVERSATION, refocus: { type: 'fund', id: 'someone-elses' } })
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
  })
})

