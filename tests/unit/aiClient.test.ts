import { afterEach, describe, expect, it } from 'vitest'
import { aiFailure, AnthropicError, callClaude, SpendCapError, streamClaude, textOf, toolInput } from '../../supabase/functions/_shared/ai/client.ts'
import { AiOutputError, runTool, type ToolSpec } from '../../supabase/functions/_shared/ai/structured.ts'
import { fakeClient } from './helpers/fakeSupabase'
import { jsonResponse, stubFetch } from './helpers/handler'
import { setEnv } from './helpers/setup'

const REQUEST = { model: 'claude-haiku-4-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }
const OK = { content: [{ type: 'text', text: 'Hello' }], usage: { input_tokens: 10, output_tokens: 5 } }
const overloaded = () => jsonResponse({ error: { type: 'overloaded_error' } }, 529)

// Answers each AI request with the next response in the list.
function answers(...responses: (() => Response)[]) {
  let next = 0
  return stubFetch(url => (url.hostname === 'api.anthropic.com' ? responses[Math.min(next++, responses.length - 1)]() : undefined))
}

describe('callClaude', () => {
  it('sends the request with the API headers and records what it cost under the caller', async () => {
    const calls = answers(() => jsonResponse(OK))
    const db = fakeClient()

    const result = await callClaude(REQUEST, { usage: { admin: db as never, functionName: 'match-relevance/skeptic', firmId: 'firm-1' } })

    expect(result.content?.[0].text).toBe('Hello')
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('test-anthropic-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual(REQUEST)
    const [usage] = db.ran('usage_events', 'insert')
    expect(usage.payload).toMatchObject({ function_name: 'match-relevance/skeptic', firm_id: 'firm-1', model: 'claude-haiku-4-5', input_tokens: 10, output_tokens: 5, ok: true })
  })

  it('records nothing when no usage target is given', async () => {
    answers(() => jsonResponse(OK))
    await expect(callClaude(REQUEST)).resolves.toMatchObject({ content: OK.content })
  })

  it('tries an overloaded or rate-limited request once more', async () => {
    const calls = answers(overloaded, () => jsonResponse(OK))
    await expect(callClaude(REQUEST)).resolves.toMatchObject({ content: OK.content })
    expect(calls).toHaveLength(2)

    const limited = answers(() => jsonResponse({}, 429), () => jsonResponse(OK))
    await callClaude(REQUEST)
    expect(limited).toHaveLength(2)
  })

  it('gives up after the second failure', async () => {
    const calls = answers(overloaded, overloaded)
    await expect(callClaude(REQUEST)).rejects.toThrow(AnthropicError)
    expect(calls).toHaveLength(2)
  })

  it('does not retry a request the API refused for a reason a retry cannot fix', async () => {
    const calls = answers(() => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 }))
    const err = await callClaude(REQUEST).catch(e => e)
    expect(err).toBeInstanceOf(AnthropicError)
    expect(err).toMatchObject({ status: 400, message: expect.stringContaining('Anthropic API error: 400') })
    expect(calls).toHaveLength(1)
  })

  it('records a failed call under the caller, with why it failed, for the AI status', async () => {
    answers(() => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 }))
    const db = fakeClient()
    await callClaude(REQUEST, { usage: { admin: db as never, functionName: 'match-relevance', firmId: 'firm-1' } }).catch(() => {})
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'match-relevance', ok: false, error: expect.stringMatching(/^credit: Anthropic API error: 400/) })
  })

  it('names why a call failed, and nothing for a call the caller stopped', () => {
    expect(aiFailure(new AnthropicError(400, '{"error":{"message":"Your credit balance is too low"}}'))).toBe('credit')
    expect(aiFailure(new AnthropicError(401, 'invalid x-api-key'))).toBe('auth')
    expect(aiFailure(new AnthropicError(429, ''))).toBe('rate_limited')
    expect(aiFailure(new AnthropicError(529, 'overloaded'))).toBe('unavailable')
    expect(aiFailure(new AnthropicError(400, 'prompt is too long'))).toBe('other')
    expect(aiFailure(new DOMException('timed out', 'TimeoutError'))).toBe('timeout')
    expect(aiFailure(new TypeError('fetch failed'))).toBe('unavailable')
    expect(aiFailure(new DOMException('stopped', 'AbortError'))).toBeNull()
  })

  it('fails a request that takes longer than its timeout instead of hanging', async () => {
    stubFetch(
      (url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        }),
    )
    await expect(callClaude(REQUEST, { timeoutMs: 20 })).rejects.toThrow()
  })
})

describe('streamClaude', () => {
  it('asks for a stream, and the timeout stops once the stream has started', async () => {
    const calls = stubFetch(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode('data: {}\n\n'))
                controller.close()
              }, 60)
            },
          }),
        ),
    )
    const res = await streamClaude(REQUEST, { timeoutMs: 20 })
    expect(JSON.parse(calls[0].init?.body as string).stream).toBe(true)
    // Read after the timeout would have fired: still readable.
    await expect(res.text()).resolves.toBe('data: {}\n\n')
  })

  it('reports a refused request as an error before any stream is returned', async () => {
    answers(() => new Response('bad', { status: 400 }))
    await expect(streamClaude(REQUEST)).rejects.toThrow('Anthropic API error: 400 bad')
  })
})

describe('spend caps', () => {
  afterEach(() => {
    setEnv('AI_FIRM_DAILY_CAP_USD', undefined)
    setEnv('AI_TOTAL_DAILY_CAP_USD', undefined)
  })

  // A database whose cap check answers `verdict` ('firm', 'total' or null).
  const capped = (verdict: string | null) => fakeClient(q => (q.op === 'rpc' && q.table === 'ai_spend_check' ? { data: verdict } : undefined))
  const usageFor = (db: ReturnType<typeof fakeClient>) => ({ admin: db as never, functionName: 'match-relevance', firmId: 'firm-1' })

  it('asks for the firm and both caps before sending, and sends when under them', async () => {
    const calls = answers(() => jsonResponse(OK))
    const db = capped(null)
    await callClaude(REQUEST, { usage: usageFor(db) })
    expect(db.ran('ai_spend_check', 'rpc')[0].payload).toEqual({ p_firm_id: 'firm-1', p_firm_cap: 15, p_total_cap: 40 })
    expect(calls).toHaveLength(1)
  })

  it('takes the caps from the function secrets', async () => {
    answers(() => jsonResponse(OK))
    setEnv('AI_FIRM_DAILY_CAP_USD', '2.5')
    setEnv('AI_TOTAL_DAILY_CAP_USD', 'not a number')
    const db = capped(null)
    await callClaude(REQUEST, { usage: usageFor(db) })
    expect(db.ran('ai_spend_check', 'rpc')[0].payload).toMatchObject({ p_firm_cap: 2.5, p_total_cap: 40 })
  })

  it("refuses a call over the firm's cap without sending it or telling every firm the AI is down", async () => {
    const calls = answers(() => jsonResponse(OK))
    const db = capped('firm')
    const err = await callClaude(REQUEST, { usage: usageFor(db) }).catch(e => e)
    expect(err).toBeInstanceOf(SpendCapError)
    expect(aiFailure(err)).toBe('spend_cap')
    expect(calls).toHaveLength(0)
    expect(db.ran('usage_events', 'insert')).toHaveLength(0)
  })

  it('refuses a call over the cap for all of RegWay and records it, so the AI status and the owner hear of it', async () => {
    const calls = answers(() => jsonResponse(OK))
    const db = capped('total')
    await expect(callClaude(REQUEST, { usage: usageFor(db) })).rejects.toBeInstanceOf(SpendCapError)
    expect(calls).toHaveLength(0)
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ ok: false, error: expect.stringMatching(/^spend_cap: /) })
  })

  it('lets the call through when the check itself fails', async () => {
    const calls = answers(() => jsonResponse(OK))
    const db = fakeClient(q => (q.op === 'rpc' ? { error: { message: 'connection reset' } } : undefined))
    await expect(callClaude(REQUEST, { usage: usageFor(db) })).resolves.toMatchObject({ content: OK.content })
    expect(calls).toHaveLength(1)
  })

  it('checks a streamed call too, before it starts', async () => {
    const calls = answers(() => jsonResponse(OK))
    const db = capped('firm')
    await expect(streamClaude(REQUEST, { spend: usageFor(db) })).rejects.toBeInstanceOf(SpendCapError)
    expect(calls).toHaveLength(0)
  })
})

describe('reading a response', () => {
  const response = {
    content: [
      { type: 'text', text: 'First.' },
      { type: 'server_tool_use', name: 'web_search' },
      { type: 'text', text: 'Second.' },
      { type: 'tool_use', name: 'submit_verdicts', input: { verdicts: [] } },
    ],
  }

  it('joins the text blocks', () => {
    expect(textOf(response)).toBe('First.\nSecond.')
  })

  it("finds a tool call's input, by name when given", () => {
    expect(toolInput(response, 'submit_verdicts')).toEqual({ verdicts: [] })
    expect(toolInput(response, 'something_else')).toBeUndefined()
    expect(toolInput({ content: [] })).toBeUndefined()
  })
})

describe('runTool', () => {
  const TOOL: ToolSpec = {
    name: 'submit_review',
    description: 'Submit the review.',
    input_schema: { type: 'object', properties: { decision: { type: 'string' }, reason: { type: 'string' } }, required: ['decision', 'reason'] },
  }
  const toolAnswer = (input: unknown) => () => jsonResponse({ content: [{ type: 'tool_use', name: 'submit_review', input }], usage: {} })

  it('forces the one tool and returns its input', async () => {
    const calls = answers(toolAnswer({ decision: 'keep', reason: 'Recorded fact supports it.' }))
    const answer = await runTool<{ decision: string; reason: string }>({ model: 'm', max_tokens: 100, messages: [], tool: TOOL, cacheTool: true })
    expect(answer).toEqual({ decision: 'keep', reason: 'Recorded fact supports it.' })
    const sent = JSON.parse(calls[0].init?.body as string)
    expect(sent.tool_choice).toEqual({ type: 'tool', name: 'submit_review' })
    expect(sent.tools).toEqual([{ ...TOOL, cache_control: { type: 'ephemeral' } }])
  })

  it('asks once more when a required field is missing', async () => {
    const calls = answers(toolAnswer({ decision: 'keep' }), toolAnswer({ decision: 'keep', reason: 'ok' }))
    await expect(runTool({ model: 'm', max_tokens: 100, messages: [], tool: TOOL })).resolves.toEqual({ decision: 'keep', reason: 'ok' })
    expect(calls).toHaveLength(2)
  })

  it("applies the caller's own check", async () => {
    answers(toolAnswer({ decision: 'maybe', reason: 'x' }), toolAnswer({ decision: 'reject', reason: 'x' }))
    const answer = await runTool<{ decision: string }>({
      model: 'm',
      max_tokens: 100,
      messages: [],
      tool: TOOL,
      check: a => (['keep', 'reject'].includes(a.decision) ? null : `unknown decision ${a.decision}`),
    })
    expect(answer.decision).toBe('reject')
  })

  it('throws a typed error after two unusable answers, never a half-filled object', async () => {
    answers(() => jsonResponse({ content: [{ type: 'text', text: 'I think so.' }] }))
    const err = await runTool({ model: 'm', max_tokens: 100, messages: [], tool: TOOL }).catch(e => e)
    expect(err).toBeInstanceOf(AiOutputError)
    expect(err.message).toContain('no tool call')
  })
})
