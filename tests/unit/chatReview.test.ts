import { afterEach, describe, expect, it } from 'vitest'
import { findApplicabilityClaims } from '../../supabase/functions/_shared/roles/claimGate.ts'
import { checkCitations, distinctSources } from '../../supabase/functions/_shared/roles/citationCheck.ts'
import { composeReview } from '../../supabase/functions/regway-ai-chat/review.ts'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { promptText, stubModel } from './helpers/firm'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { setEnv } from './helpers/setup'

afterEach(() => setEnv('CHAT_REVIEW', undefined))

const CLAIMS = [
  { claim: 'The CLIA proposed rule applies to GetixHealth because it runs a clinical laboratory.', kind: 'applies' as const, scope: 'company' as const, entity_name: 'GetixHealth' },
  { claim: 'Form PF amendments apply to H.I.G. Capital as an SEC-registered adviser.', kind: 'applies' as const, scope: 'firm' as const, entity_name: null },
]

describe('composing the note', () => {
  it('is "supported" when every check passes', () => {
    const review = composeReview(
      CLAIMS,
      CLAIMS.map((_, index) => ({ index, verdict: 'supported' as const, note: 'Recorded.', unrecorded_facts: [] })),
      CLAIMS.map((_, index) => ({ index, status: 'supported' as const, source: 1, note: 'The rule says so.' })),
    )
    expect(review).toEqual({ status: 'supported', checks: ['facts', 'sources'], claims: 2, notes: [] })
  })

  it('is "caution" with a note per doubtful claim, from either check', () => {
    const review = composeReview(
      CLAIMS,
      [
        { index: 0, verdict: 'unsupported', note: 'Running a clinical laboratory is not recorded for GetixHealth.', unrecorded_facts: ['runs a clinical laboratory'] },
        { index: 1, verdict: 'supported', note: 'Recorded.', unrecorded_facts: [] },
      ],
      [
        { index: 0, status: 'supported', source: 1, note: '' },
        { index: 1, status: 'contradicted', source: 2, note: 'the amendments are proposed, not final.' },
      ],
    )
    expect(review.status).toBe('caution')
    expect(review.notes).toEqual([
      { claim: CLAIMS[0].claim, note: 'Running a clinical laboratory is not recorded for GetixHealth.' },
      { claim: CLAIMS[1].claim, note: 'The cited source says otherwise: the amendments are proposed, not final.' },
    ])
  })

  it('says which checks ran when one did not finish', () => {
    expect(composeReview(CLAIMS, null, CLAIMS.map((_, index) => ({ index, status: 'not_in_sources' as const, source: 0, note: '' })))).toMatchObject({ status: 'supported', checks: ['sources'] })
  })
})

describe('the claim gate', () => {
  it('lists the firm\'s entities and treats a claim about an unknown entity as about the firm', async () => {
    const { model } = stubModel({
      submit_claims: {
        claims: [
          { claim: 'Applies to GetixHealth.', kind: 'applies', scope: 'company', entity_name: 'getixhealth' },
          { claim: 'Applies to Acme.', kind: 'applies', scope: 'company', entity_name: 'Acme' },
        ],
      },
    })
    const claims = await findApplicabilityClaims({ question: 'Does it affect us?', answer: 'Yes.', firmName: 'H.I.G. Capital', funds: ['Fund I'], companies: ['GetixHealth'] }, {})
    expect(model[0].body.model).toBe('claude-haiku-4-5')
    expect(promptText(model[0])).toContain('Portfolio companies: GetixHealth')
    expect(claims).toEqual([
      { claim: 'Applies to GetixHealth.', kind: 'applies', scope: 'company', entity_name: 'getixhealth' },
      { claim: 'Applies to Acme.', kind: 'applies', scope: 'firm', entity_name: null },
    ])
  })
})

describe('the citation check', () => {
  it('compares against every passage quoted from each source', async () => {
    const citations = [
      { url: 'https://cms.gov/clia', title: 'CLIA proposed rule', cited_text: 'Proposes changes to laboratory personnel rules.' },
      { url: 'https://cms.gov/clia', title: 'CLIA proposed rule', cited_text: 'Comments due December 1.' },
      { url: 'https://sec.gov/pf', title: 'Form PF', cited_text: 'Amendments adopted.' },
    ]
    expect(distinctSources(citations)).toHaveLength(2)
    const { model } = stubModel({ submit_citation_checks: { findings: [{ index: 0, status: 'supported', source: 1, note: '' }] } })
    await checkCitations({ claims: ['CLIA changes laboratory personnel rules.'], citations }, {})
    const text = promptText(model[0])
    expect(text).toContain('"Proposes changes to laboratory personnel rules."')
    expect(text).toContain('"Comments due December 1."')
  })

  it('makes no call when the answer cited nothing', async () => {
    const { model } = stubModel({})
    expect(await checkCitations({ claims: ['x'], citations: [] }, {})).toEqual([{ index: 0, status: 'not_in_sources', source: 0, note: 'The answer cited no source.' }])
    expect(model).toEqual([])
  })
})

// The chat function end to end, with the check switched on.

const sse = (events: unknown[]) => events.map(e => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('')
const ANSWER = sse([
  { type: 'message_start', message: { usage: { input_tokens: 300, output_tokens: 1 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Yes, the CLIA proposed rule applies to GetixHealth.' } },
  { type: 'content_block_delta', delta: { type: 'citations_delta', citation: { url: 'https://cms.gov/clia', title: 'CLIA', cited_text: 'Laboratory personnel rules change.' } } },
  { type: 'message_delta', usage: { output_tokens: 40 } },
])

function database(q: Query) {
  if (q.table === 'firm_members') return { data: { firm_id: 'firm-1', firms: { name: 'H.I.G. Capital', hq_location: 'Miami, Florida', jurisdictions: ['United States'], profile: {} } } }
  if (q.table === 'check_rate_limit') return { data: true }
  if (q.table === 'funds') return { data: [{ id: 'fund-1', name: 'Fund I', structure: 'Delaware LP', jurisdictions: [], profile: {} }] }
  if (q.table === 'portfolio_companies') return { data: [{ id: 'co-1', name: 'GetixHealth', hq_location: 'Houston, Texas', sectors: ['Healthcare'], regions: [], offerings: 'Revenue cycle management', profile: {} }] }
  if (q.table === 'fund_holdings') return { data: [] }
  if (q.table === 'regulation_relevance') return { data: [] }
  if (q.table === 'regway_ai_messages' && q.op === 'insert') return { data: [{ id: 'msg-user', role: 'user' }, { id: 'msg-answer', role: 'assistant' }] }
}

const regwayEvents = (text: string) =>
  text
    .split('\n')
    .filter(l => l.startsWith('data: '))
    .map(l => JSON.parse(l.slice(6)))
    .filter(e => String(e.type).startsWith('regway_'))

async function ask(replies: Record<string, unknown>, opts: { review?: boolean } = {}) {
  setEnv('CHAT_REVIEW', opts.review === false ? undefined : 'on')
  const db = fakeClient(database)
  setClient(db)
  const { handler } = await loadHandler('regway-ai-chat')
  const net = stubModel({ text: () => new Response(ANSWER), ...replies })
  const res = await handler(post('regway-ai-chat', { token: 'user-jwt', body: { message: 'Does the CLIA rule affect GetixHealth?' } }))
  const text = await res.text()
  return { res, text, db, ...net, events: regwayEvents(text) }
}

const gate = (claims: unknown[]) => ({ submit_claims: { claims } })
const FOUND = [{ claim: 'The CLIA proposed rule applies to GetixHealth.', kind: 'applies', scope: 'company', entity_name: 'GetixHealth' }]

describe('regway-ai-chat with the answer check on', () => {
  it('streams the answer first, then the check, and saves the note with the answer', async () => {
    const { text, events, db, model } = await ask({
      ...gate(FOUND),
      submit_claim_reviews: { reviews: [{ index: 0, verdict: 'unsupported', note: 'Running a laboratory is not recorded for GetixHealth.', unrecorded_facts: ['runs a laboratory'] }] },
      submit_citation_checks: { findings: [{ index: 0, status: 'supported', source: 1, note: '' }] },
    })
    // The answer's own events come before any of RegWay's.
    expect(text.indexOf('text_delta')).toBeLessThan(text.indexOf('regway_status'))
    expect(model.map(m => m.tool ?? 'answer')).toEqual(['answer', 'submit_claims', 'submit_claim_reviews', 'submit_citation_checks'])

    expect(events.filter(e => e.type === 'regway_status' && e.state === 'running').map(e => e.label)).toEqual(['Checking against your recorded facts…', 'Verifying sources…'])
    expect(events.filter(e => e.type === 'regway_status' && e.state === 'done').map(e => e.step).sort()).toEqual(['facts', 'sources'])
    const review = events.find(e => e.type === 'regway_review').review
    expect(review).toEqual({ status: 'caution', checks: ['facts', 'sources'], claims: 1, notes: [{ claim: FOUND[0].claim, note: 'Running a laboratory is not recorded for GetixHealth.' }] })

    const [update] = db.ran('regway_ai_messages', 'update')
    expect(update.payload).toEqual({ review })
    expect(hasFilter(update, 'eq', 'id', 'msg-answer')).toBe(true)
    // The reviewer saw what is recorded about GetixHealth.
    expect(promptText(model[2])).toContain('COMPANY — GetixHealth')
    // Calibrated against caution on every claim (2026-10-18): a missing
    // negative or an already-hedged claim is not flagged.
    expect(model[2].body.system[0].text).toContain('A missing negative')
    expect(model[2].body.system[0].text).toContain('a note on every claim teaches the user to ignore the notes')
  })

  it('shows nothing more for an answer that makes no claim about the firm', async () => {
    const { events, db, model } = await ask(gate([]))
    expect(events).toEqual([])
    expect(model.map(m => m.tool ?? 'answer')).toEqual(['answer', 'submit_claims'])
    expect(db.ran('regway_ai_messages', 'update')).toEqual([])
  })

  it('runs no check at all while CHAT_REVIEW is off', async () => {
    const { events, model, db } = await ask(gate(FOUND), { review: false })
    expect(events).toEqual([])
    expect(model).toHaveLength(1)
    // The exchange is still saved as before.
    expect(db.ran('regway_ai_messages', 'insert')).toHaveLength(1)
  })

  it('labels a check that failed as not done, and makes no note up for it', async () => {
    const { events } = await ask({
      ...gate(FOUND),
      submit_claim_reviews: () => jsonResponse({ error: 'bad' }, 400),
      submit_citation_checks: { findings: [{ index: 0, status: 'supported', source: 1, note: '' }] },
    })
    expect(events.find(e => e.step === 'facts' && e.state === 'failed')?.label).toBe("Couldn't check against your recorded facts")
    expect(events.find(e => e.type === 'regway_review').review).toMatchObject({ status: 'supported', checks: ['sources'] })
  })

  it('a failed claim gate shows nothing and keeps the answer', async () => {
    const { events, db } = await ask({ submit_claims: () => jsonResponse({ error: 'overloaded' }, 400) })
    expect(events).toEqual([])
    expect(db.ran('regway_ai_messages', 'insert')).toHaveLength(1)
  })
})

describe('stopping during the check', () => {
  it('stops the check, keeps the saved answer, and writes no note', async () => {
    setEnv('CHAT_REVIEW', 'on')
    const db = fakeClient(database)
    setClient(db)
    const { handler } = await loadHandler('regway-ai-chat')
    let aborted = 0
    // The two checks hang until they are cancelled.
    const hang = () => new Promise<Response>(() => {})
    stubFetch((url, init) => {
      if (url.hostname !== 'api.anthropic.com') return undefined
      const body = JSON.parse(init!.body as string)
      const tool = body.tool_choice?.name
      if (!tool) return new Response(ANSWER)
      if (tool === 'submit_claims') return jsonResponse({ content: [{ type: 'tool_use', name: 'submit_claims', input: { claims: FOUND } }] })
      init!.signal!.addEventListener('abort', () => aborted++)
      return hang()
    })
    const res = await handler(post('regway-ai-chat', { token: 'user-jwt', body: { message: 'Does it affect GetixHealth?' } }))
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let seen = ''
    while (!seen.includes('regway_status')) seen += decoder.decode((await reader.read()).value)
    await reader.cancel()

    expect(aborted).toBe(2)
    expect(db.ran('regway_ai_messages', 'insert')).toHaveLength(1)
    expect(db.ran('regway_ai_messages', 'update')).toEqual([])
  })
})

// The closed connection doesn't reach the function in production; the
// browser stamps the conversation and the function watches for it.
describe('stopping, as the server sees it', () => {
  const CONVERSATION = '6f1c2a9e-0000-4000-8000-000000000001'
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) await new Promise(r => setTimeout(r, 5))
  }
  const withConversation = (state: { stamped: boolean; started?: boolean }) => (q: Query) => {
    if (q.table === 'regway_ai_conversations' && q.op === 'select') {
      if (q.columns === 'stopped_at') return { data: state.started === false ? null : { stopped_at: state.stamped ? '2026-10-17T20:03:57Z' : null } }
      return { data: state.started === false ? null : { context: null, stopped_at: null } }
    }
    if (q.table === 'regway_ai_conversations') return {}
    return database(q)
  }

  afterEach(() => setEnv('CHAT_STOP_POLL_MS', undefined))

  it('a stop stamped during the check cancels both checks and writes no note', async () => {
    setEnv('CHAT_REVIEW', 'on')
    setEnv('CHAT_STOP_POLL_MS', '5')
    const state = { stamped: false }
    const db = fakeClient(withConversation(state))
    setClient(db)
    const { handler } = await loadHandler('regway-ai-chat')
    let aborted = 0
    stubFetch((url, init) => {
      if (url.hostname !== 'api.anthropic.com') return undefined
      const tool = JSON.parse(init!.body as string).tool_choice?.name
      if (!tool) return new Response(ANSWER)
      if (tool === 'submit_claims') return jsonResponse({ content: [{ type: 'tool_use', name: 'submit_claims', input: { claims: FOUND } }] })
      init!.signal!.addEventListener('abort', () => aborted++)
      return new Promise<Response>(() => {})
    })
    const res = await handler(post('regway-ai-chat', { token: 'user-jwt', body: { message: 'Does it affect GetixHealth?', conversationId: CONVERSATION } }))
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let seen = ''
    while (!seen.includes('regway_status')) seen += decoder.decode((await reader.read()).value)

    // The browser stopped reading, but nothing reached the function except the stamp.
    state.stamped = true
    await until(() => aborted === 2)
    expect(aborted).toBe(2)
    expect(db.ran('regway_ai_messages', 'insert')).toHaveLength(1)
    expect(db.ran('regway_ai_messages', 'update')).toEqual([])
  })

  it('a stop stamped during the answer ends it, saves nothing and drops the conversation it started', async () => {
    setEnv('CHAT_STOP_POLL_MS', '5')
    const state = { stamped: false, started: false }
    const db = fakeClient(q => {
      // Created by this message; afterwards the watch finds it, then the stamp.
      if (q.table === 'regway_ai_conversations' && q.op === 'insert') state.started = true
      return withConversation(state)(q)
    })
    setClient(db)
    const { handler } = await loadHandler('regway-ai-chat')
    let cancelled = false
    const encoder = new TextEncoder()
    stubFetch(url => {
      if (url.hostname !== 'api.anthropic.com') return undefined
      // The model writes a first sentence, then keeps going until cancelled.
      const body = new ReadableStream<Uint8Array>({
        start: c => c.enqueue(encoder.encode(sse([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Yes, ' } }]))),
        cancel: () => {
          cancelled = true
        },
      })
      return new Response(body)
    })
    const res = await handler(post('regway-ai-chat', { token: 'user-jwt', body: { message: 'Does it affect GetixHealth?', conversationId: CONVERSATION } }))
    const reader = res.body!.getReader()
    await reader.read()

    state.stamped = true
    await until(() => cancelled && db.ran('regway_ai_conversations', 'delete').length > 0)
    expect(cancelled).toBe(true)
    expect(db.ran('regway_ai_messages', 'insert')).toEqual([])
    expect(hasFilter(db.ran('regway_ai_conversations', 'delete')[0], 'eq', 'id', CONVERSATION)).toBe(true)
  })
})
