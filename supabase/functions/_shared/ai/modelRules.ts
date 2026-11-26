// What the Claude 5 models (Sonnet 5.5, Haiku 5.5 and later) accept, applied
// to every request in one place, so no AI job carries its own copy. RegWay's
// jobs were written for Sonnet 4.5 and Haiku 4.5; Sonnet 4.5 retires on
// 2026-11-30.
//
// - Sampling settings (`temperature: 0` on every verdict) are refused: they
//   are dropped. The answer's shape is fixed by the schema instead.
// - A forced tool call (`tool_choice: { type: 'tool' }`), which every
//   structured answer used, is refused by Sonnet 5.5. The tool's schema
//   becomes the answer's format (`output_config.format`), and the JSON that
//   comes back is turned back into that tool's call (adaptResponse), so
//   toolInput() reads it as before. The other tools go too: under a forced
//   call none of them was ever used (company-regulations' web search).
// - The models think before answering, and that counts toward max_tokens:
//   THINKING_ROOM is added, so an answer sized for the old model still
//   fits. Only tokens used are paid for.
// - How hard they think is `effort`. A caller can set it in `output_config`;
//   otherwise the AI_EFFORT secret, else 'low' (what Anthropic suggests for
//   classification, extraction and chat).
//
// Older models get the request exactly as written.

import type { ClaudeRequest, ClaudeResponse, ContentBlock } from './client.ts'

export const newGeneration = (model: string) => /^claude-(sonnet|haiku|opus|fable|mythos)-5/.test(model)

export const THINKING_ROOM = 16_000
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

export function defaultEffort(): string {
  const set = Deno.env.get('AI_EFFORT')
  return set && EFFORTS.has(set) ? set : 'low'
}

// Structured outputs accept a subset of JSON Schema: every object closed
// (additionalProperties: false), and no number or length limits.
const UNSUPPORTED = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems'])

export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED.has(key)) continue
    out[key] = key === 'properties' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strictSchema(v)]))
      : strictSchema(value)
  }
  if (out.type === 'object') out.additionalProperties = false
  return out
}

interface ToolDef {
  name?: string
  input_schema?: unknown
}

// The request as the model accepts it, and the tool whose call the answer
// stands for (when a forced call became the answer's format).
export function adaptRequest(request: ClaudeRequest): { request: ClaudeRequest; answerTool?: string } {
  if (!newGeneration(request.model)) return { request }
  const { temperature: _t, top_p: _p, top_k: _k, tool_choice, tools, output_config, ...rest } = request as ClaudeRequest & Record<string, unknown>
  const config = { ...(output_config as Record<string, unknown> | undefined) }
  config.effort ??= defaultEffort()
  const adapted: ClaudeRequest = { ...rest, model: request.model, max_tokens: request.max_tokens + THINKING_ROOM, output_config: config }
  const forced = tool_choice as { type?: string; name?: string } | undefined
  if (forced?.type === 'tool' && forced.name) {
    const tool = (tools as ToolDef[] | undefined)?.find(t => t.name === forced.name)
    if (tool?.input_schema) {
      config.format = { type: 'json_schema', schema: strictSchema(tool.input_schema) }
      return { request: adapted, answerTool: forced.name }
    }
  }
  if (tools) adapted.tools = tools
  if (tool_choice && forced?.type !== 'tool' && forced?.type !== 'any') adapted.tool_choice = tool_choice
  return { request: adapted }
}

// The answer's JSON, as the forced tool's call: what every caller reads with
// toolInput(). A refusal, or text that isn't JSON, gives no call, as a
// model that never called the tool did.
export function adaptResponse(response: ClaudeResponse, answerTool?: string): ClaudeResponse {
  if (!answerTool || response.stop_reason === 'refusal') return response
  const text = (response.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('')
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return response
  }
  const call: ContentBlock = { type: 'tool_use', id: 'structured_answer', name: answerTool, input }
  return { ...response, content: [...(response.content ?? []).filter(b => b.type !== 'text'), call] }
}
