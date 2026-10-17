// The one way RegWay calls the Anthropic Messages API. Every AI job goes
// through here, so each gets the same headers, timeout, retry and cost
// recording instead of its own copy of them.
//
// - A refused or overloaded request (429, 5xx, 529) is tried once more after
//   a short wait; any other error (a bad request, no credit) is not.
// - With `usage`, a successful call is recorded in `usage_events` under the
//   caller's function name (_shared/usage.ts).
// - `callClaude` returns the parsed response; `streamClaude` returns the
//   streaming Response for the caller to read (the chat), with the timeout
//   covering only the wait for it to start.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { mergeUsage, recordUsage, type UsageTotals } from '../usage.ts'

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

// The request body, passed through as is: model, max_tokens, system, tools,
// messages and whatever else the Messages API takes.
export interface ClaudeRequest {
  model: string
  max_tokens: number
  [field: string]: unknown
}

export interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: unknown
  [field: string]: unknown
}

export interface ClaudeResponse {
  content?: ContentBlock[]
  stop_reason?: string
  usage?: Record<string, unknown>
}

export interface UsageTarget {
  admin: SupabaseClient
  functionName: string
  firmId?: string | null
}

export interface CallOptions {
  usage?: UsageTarget
  // Default: under the platform's ~150 s limit, so a stalled request fails
  // with an error instead of hanging the whole invocation.
  timeoutMs?: number
  // Cancels the call when the caller no longer wants the answer (a reader
  // who went away).
  signal?: AbortSignal
}

export class AnthropicError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Anthropic API error: ${status} ${body}`)
    this.name = 'AnthropicError'
  }
}

// Why a call failed, in the words the dashboard's AI status (migration 0038)
// and the chat's error use. Null when the caller stopped it on purpose.
export type AiFailure = 'credit' | 'auth' | 'rate_limited' | 'unavailable' | 'timeout' | 'other'

export function aiFailure(err: unknown): AiFailure | null {
  const name = (err as Error)?.name
  if (name === 'TimeoutError') return 'timeout'
  if (name === 'AbortError') return null
  if (err instanceof AnthropicError) {
    if (/credit balance/i.test(err.body)) return 'credit'
    if (err.status === 401 || err.status === 403) return 'auth'
    if (err.status === 429) return 'rate_limited'
    if (err.status >= 500) return 'unavailable'
    return 'other'
  }
  // The request never got an answer (network, DNS).
  return err instanceof TypeError ? 'unavailable' : 'other'
}

// What a person is told when the AI can't answer.
export const AI_FAILURE_MESSAGES: Record<AiFailure, string> = {
  credit: "RegWay AI is unavailable: the AI service account has run out of credit. It will work again once it's topped up.",
  auth: 'RegWay AI is unavailable: the AI service refused its key.',
  rate_limited: 'The AI service is busy right now. Please try again in a minute.',
  unavailable: 'The AI service is not responding right now. Please try again in a few minutes.',
  timeout: 'The AI service took too long to answer. Please try again.',
  other: 'The AI service could not answer this request.',
}

// A failed call, recorded beside the ones that worked: what the dashboard's
// AI status reads.
export async function recordFailure(target: UsageTarget, model: string, err: unknown): Promise<void> {
  const failure = aiFailure(err)
  if (!failure) return
  await recordUsage(target.admin, { functionName: target.functionName, firmId: target.firmId, model, ok: false, error: `${failure}: ${String((err as Error)?.message ?? err).slice(0, 300)}` })
}

const DEFAULT_TIMEOUT_MS = 120_000
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529])
const MAX_RETRY_WAIT_MS = 10_000

function retryWait(res: Response): number {
  const retryAfter = Number(res.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, MAX_RETRY_WAIT_MS)
  return Number(Deno.env.get('AI_RETRY_DELAY_MS') ?? 2000)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Sends the request, once more if the first answer is retryable. Resolves to
// an ok Response; throws AnthropicError otherwise. The caller's signal
// covers both attempts.
async function send(request: ClaudeRequest, signal: AbortSignal): Promise<Response> {
  const attempt = () =>
    fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })

  let res = await attempt()
  if (!res.ok && RETRYABLE.has(res.status)) {
    const wait = retryWait(res)
    await res.body?.cancel()
    await sleep(wait)
    res = await attempt()
  }
  if (!res.ok) throw new AnthropicError(res.status, await res.text())
  return res
}

export async function callClaude(request: ClaudeRequest, opts: CallOptions = {}): Promise<ClaudeResponse> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let res: Response
  try {
    res = await send(request, opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout)
  } catch (err) {
    if (opts.usage) await recordFailure(opts.usage, request.model, err)
    throw err
  }
  const result = (await res.json()) as ClaudeResponse
  if (opts.usage) await recordCall(opts.usage, request.model, result.usage)
  return result
}

// For a streamed reply: the timeout applies until the response starts, then
// the stream is the caller's to read (and to record usage from, since it
// arrives in the stream's events).
export async function streamClaude(request: ClaudeRequest, opts: Omit<CallOptions, 'usage'> = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('The request timed out', 'TimeoutError')), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await send({ ...request, stream: true }, controller.signal)
    if (!res.body) throw new AnthropicError(res.status, 'empty response body')
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function recordCall(target: UsageTarget, model: string, raw: Record<string, unknown> | undefined): Promise<void> {
  const totals: UsageTotals = {}
  mergeUsage(totals, raw)
  await recordUsage(target.admin, { functionName: target.functionName, firmId: target.firmId, model, ...totals })
}

// The input of the named tool call in a response (a forced tool_choice
// call's structured answer), or undefined if the model made none.
export function toolInput<T = Record<string, unknown>>(response: ClaudeResponse, name?: string): T | undefined {
  const block = (response.content ?? []).find(b => b.type === 'tool_use' && (!name || b.name === name))
  return block?.input as T | undefined
}

// The response's text blocks, joined.
export function textOf(response: ClaudeResponse, separator = '\n'): string {
  return (response.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join(separator)
}
