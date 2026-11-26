import { afterEach, describe, expect, it } from 'vitest'
import { adaptRequest, adaptResponse, strictSchema, THINKING_ROOM } from '../../supabase/functions/_shared/ai/modelRules'
import { toolInput } from '../../supabase/functions/_shared/ai/client'
import { setEnv } from './helpers/setup'

// Sonnet 4.5 retires on 2026-11-30. The Claude 5 models refuse a sampling
// setting and (Sonnet 5.5) a forced tool call, and think before answering:
// every request is reshaped in one place (_shared/ai/modelRules.ts).

afterEach(() => setEnv('AI_EFFORT', undefined))

const tool = {
  name: 'submit_verdicts',
  description: 'Submit a verdict for every item.',
  input_schema: {
    type: 'object',
    properties: { verdicts: { type: 'array', minItems: 1, items: { type: 'object', properties: { index: { type: 'integer', minimum: 0 }, reason: { type: 'string', maxLength: 300 } }, required: ['index'] } } },
    required: ['verdicts'],
  },
  cache_control: { type: 'ephemeral' },
}
const written = { model: 'claude-sonnet-5-5', max_tokens: 4096, temperature: 0, tool_choice: { type: 'tool', name: 'submit_verdicts' }, tools: [{ type: 'web_search_20250305', name: 'web_search' }, tool], messages: [{ role: 'user', content: 'Judge these.' }] }

describe('a request to a Claude 5 model', () => {
  it('asks for the forced tool\'s answer as a JSON format, without sampling settings, with room to think', () => {
    const { request, answerTool } = adaptRequest(written)
    expect(answerTool).toBe('submit_verdicts')
    expect(request).not.toHaveProperty('temperature')
    expect(request).not.toHaveProperty('tool_choice')
    // Under a forced call no other tool was ever used.
    expect(request).not.toHaveProperty('tools')
    expect(request.max_tokens).toBe(4096 + THINKING_ROOM)
    expect(request.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: strictSchema(tool.input_schema) } })
    expect(request.messages).toEqual(written.messages)
  })

  it('closes every object and drops the limits a JSON format does not take', () => {
    expect(strictSchema(tool.input_schema)).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['verdicts'],
      properties: { verdicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index'], properties: { index: { type: 'integer' }, reason: { type: 'string' } } } } },
    })
  })

  it('thinks as hard as the caller or the AI_EFFORT secret says, else low', () => {
    expect(adaptRequest({ ...written, output_config: { effort: 'high' } }).request.output_config).toMatchObject({ effort: 'high' })
    setEnv('AI_EFFORT', 'medium')
    expect(adaptRequest(written).request.output_config).toMatchObject({ effort: 'medium' })
    setEnv('AI_EFFORT', 'loud')
    expect(adaptRequest(written).request.output_config).toMatchObject({ effort: 'low' })
  })

  it('keeps the tools of a request that forces none (the chat\'s web search)', () => {
    const chat = { model: 'claude-sonnet-5-5', max_tokens: 4096, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [] }
    const { request, answerTool } = adaptRequest(chat)
    expect(answerTool).toBeUndefined()
    expect(request.tools).toEqual(chat.tools)
    expect(request).not.toHaveProperty('tool_choice')
  })

  it('leaves a request to an older model exactly as written', () => {
    const haiku = { ...written, model: 'claude-haiku-4-5' }
    expect(adaptRequest(haiku)).toEqual({ request: haiku })
  })
})

describe('its answer', () => {
  const thinking = { type: 'thinking', thinking: '', signature: 'x' }

  it('is read as the forced tool\'s call', () => {
    const response = adaptResponse({ content: [thinking, { type: 'text', text: '{"verdicts":[{"index":0}]}' }], stop_reason: 'end_turn' }, 'submit_verdicts')
    expect(toolInput(response, 'submit_verdicts')).toEqual({ verdicts: [{ index: 0 }] })
  })

  it('gives no call when the model declined or wrote something else', () => {
    expect(toolInput(adaptResponse({ content: [{ type: 'text', text: '{"verdicts":[]}' }], stop_reason: 'refusal' }, 'submit_verdicts'))).toBeUndefined()
    expect(toolInput(adaptResponse({ content: [{ type: 'text', text: 'Sorry.' }], stop_reason: 'end_turn' }, 'submit_verdicts'))).toBeUndefined()
  })
})
