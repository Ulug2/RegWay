// A Claude call that must answer with structured data: the model is forced
// to call one tool, and the tool's input is the answer. The same pattern
// the matchers and the impact analysis already use, in one place, with the
// check those calls lacked: an answer missing a required field is asked for
// once more, and a second bad answer is an error the caller can handle
// (treat the evidence as missing), never a half-filled object.

import { callClaude, toolInput, type CallOptions, type ClaudeRequest } from './client.ts'

export interface ToolSpec {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface ToolCall<T> extends Omit<ClaudeRequest, 'tools' | 'tool_choice'> {
  tool: ToolSpec
  // Mark the tool definition for prompt caching (it repeats across calls).
  cacheTool?: boolean
  // Further checks beyond the schema's required fields; return a problem
  // description, or null when the answer is usable.
  check?: (answer: T) => string | null
}

export class AiOutputError extends Error {
  constructor(
    readonly tool: string,
    readonly problem: string,
  ) {
    super(`The model's ${tool} answer was unusable: ${problem}`)
    this.name = 'AiOutputError'
  }
}

function problemWith<T>(answer: T | undefined, call: ToolCall<T>): string | null {
  if (!answer || typeof answer !== 'object') return 'no tool call in the response'
  const missing = (call.tool.input_schema.required ?? []).filter(field => (answer as Record<string, unknown>)[field] === undefined)
  if (missing.length) return `missing ${missing.join(', ')}`
  return call.check?.(answer) ?? null
}

export async function runTool<T>(call: ToolCall<T>, opts: CallOptions = {}): Promise<T> {
  const { tool, cacheTool, check: _check, ...rest } = call
  const request: ClaudeRequest = {
    ...rest,
    tool_choice: { type: 'tool', name: tool.name },
    tools: [cacheTool ? { ...tool, cache_control: { type: 'ephemeral' } } : tool],
  }

  let problem = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = toolInput<T>(await callClaude(request, opts), tool.name)
    const found = problemWith(answer, call)
    if (!found) return answer as T
    problem = found
  }
  throw new AiOutputError(tool.name, problem)
}
