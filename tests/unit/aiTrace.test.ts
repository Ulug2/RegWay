import { afterEach, describe, expect, it } from 'vitest'
import { callClaude } from '../../supabase/functions/_shared/ai/client.ts'
import { MAX_STRING, shorten } from '../../supabase/functions/_shared/ai/trace.ts'
import { fakeClient } from './helpers/fakeSupabase'
import { jsonResponse, stubFetch } from './helpers/handler'
import { setEnv } from './helpers/setup'

// Traces of AI calls (migration 0052, system guide §17.9).

afterEach(() => setEnv('AI_TRACES', undefined))

const REQUEST = { model: 'claude-haiku-4-5', max_tokens: 100, system: 'Judge these.', messages: [{ role: 'user', content: 'Document 0.' }] }
const ANSWER = { content: [{ type: 'tool_use', name: 'submit_verdicts', input: { verdicts: [] } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 2 } }
const usageFor = (db: ReturnType<typeof fakeClient>) => ({ admin: db as never, functionName: 'match-relevance', firmId: 'firm-1' })
const traces = (db: ReturnType<typeof fakeClient>) => db.ran('ai_traces', 'insert').map(q => q.payload as Record<string, unknown>)

describe('keeping what an AI call was sent and answered', () => {
  it('keeps the request and the answer, under the function and the firm', async () => {
    stubFetch(() => jsonResponse(ANSWER))
    const db = fakeClient()
    await callClaude(REQUEST, { usage: usageFor(db) })
    expect(traces(db)).toEqual([
      { function_name: 'match-relevance', firm_id: 'firm-1', model: 'claude-haiku-4-5', request: REQUEST, response: { content: ANSWER.content, stop_reason: 'tool_use' }, ok: true },
    ])
  })

  it('keeps a call that was sent and failed, with why', async () => {
    stubFetch(() => new Response('{"error":"overloaded"}', { status: 400 }))
    const db = fakeClient()
    await expect(callClaude(REQUEST, { usage: usageFor(db) })).rejects.toThrow()
    expect(traces(db)).toEqual([expect.objectContaining({ ok: false, response: null, error: expect.stringMatching(/^Anthropic API error: 400/) })])
  })

  it('keeps nothing for a call refused before it was sent (a spend cap)', async () => {
    const calls = stubFetch(() => jsonResponse(ANSWER))
    const db = fakeClient(q => (q.op === 'rpc' && q.table === 'ai_spend_check' ? { data: 'total' } : q.op === 'rpc' && q.table === 'ai_spend_totals' ? { data: [{ firm_day: 0, total_day: 1e6, firm_month: 0, total_month: 0 }] } : undefined))
    await expect(callClaude(REQUEST, { usage: usageFor(db) })).rejects.toThrow(/spend cap/)
    expect(calls).toHaveLength(0)
    expect(traces(db)).toEqual([])
  })

  it('keeps nothing when switched off, or for a call with no usage target', async () => {
    stubFetch(() => jsonResponse(ANSWER))
    setEnv('AI_TRACES', 'off')
    const off = fakeClient()
    await callClaude(REQUEST, { usage: usageFor(off) })
    expect(traces(off)).toEqual([])
    setEnv('AI_TRACES', undefined)
    await expect(callClaude(REQUEST)).resolves.toMatchObject({ stop_reason: 'tool_use' })
  })

  it('never breaks the call when the trace cannot be kept', async () => {
    stubFetch(() => jsonResponse(ANSWER))
    const db = fakeClient(q => (q.table === 'ai_traces' ? { error: { message: 'relation "ai_traces" does not exist' } } : undefined))
    await expect(callClaude(REQUEST, { usage: usageFor(db) })).resolves.toMatchObject({ stop_reason: 'tool_use' })
  })
})

describe('shortening what is kept', () => {
  it('cuts a very long string and says how much was left out', () => {
    const long = 'x'.repeat(MAX_STRING + 5)
    expect(shorten({ text: long })).toEqual({ text: `${'x'.repeat(MAX_STRING)}… [5 more characters not kept]` })
  })

  it("replaces an attached PDF's data with its size, keeping the rest of the block", () => {
    const block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD'.repeat(10) } }
    expect(shorten([block])).toEqual([{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: '[base64, 40 characters not kept]' } }])
  })

  it('leaves everything else as it was', () => {
    const value = { a: 1, b: [true, null, 'short'], c: { d: 'e' } }
    expect(shorten(value)).toEqual(value)
  })
})
