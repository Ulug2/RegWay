import { describe, expect, it } from 'vitest'
import { AnthropicError, callClaude, streamClaude, textOf, toolInput } from '../../supabase/functions/_shared/ai/client.ts'
import { AiOutputError, runTool, type ToolSpec } from '../../supabase/functions/_shared/ai/structured.ts'
import { fakeClient } from './helpers/fakeSupabase'
import { jsonResponse, stubFetch } from './helpers/handler'

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
