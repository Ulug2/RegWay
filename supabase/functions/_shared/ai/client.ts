// The one way RegWay calls the Anthropic Messages API. Every AI job goes
// through here, so each gets the same headers, timeout, retry and cost
// recording instead of its own copy of them.
//
// - A refused or overloaded request (429, 5xx, 529) is tried once more after
//   a short wait; any other error (a bad request, no credit) is not.
// - With `usage`, a successful call is recorded in `usage_events` under the
//   caller's function name (_shared/usage.ts), and what it was sent and
//   answered in `ai_traces` for 30 days (./trace.ts); a call that was sent
//   and failed is traced too.
// - `callClaude` returns the parsed response; `streamClaude` returns the
//   streaming Response for the caller to read (the chat), with the timeout
//   covering only the wait for it to start.
// - Before either sends anything, the spend caps are checked: a call made
//   once the firm, or all of RegWay, has reached its cap for the last 24
//   hours or for this month is refused with SpendCapError (migrations 0048,
//   0051). Background work stops earlier, keeping a share of each cap for
//   what people start by a click.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { mergeUsage, recordUsage, type UsageTotals } from '../usage.ts'

import { recordTrace } from './trace.ts'

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
  // Started by a person's click (a chat message, opening a development, a
  // re-check): may use the share of the caps background work leaves free.
  // When not given, decided by the function's name (INTERACTIVE_FUNCTIONS).
  interactive?: boolean
}

export interface CallOptions {
  // Records the call's cost, and checks the spend caps before it is sent.
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

// A call refused before it was sent: the estimated spend has reached a cap
// for this firm, or for all of RegWay ('total'), over the last 24 hours
// ('day') or this calendar month (UTC). `reserve`: background work refused
// because only the share kept for people's clicks is left.
export class SpendCapError extends Error {
  constructor(
    readonly scope: 'firm' | 'total',
    readonly period: 'day' | 'month' = 'day',
    readonly reserve = false,
  ) {
    super(`AI spend cap reached (${scope}, ${period}${reserve ? ', the rest is kept for people' : ''})`)
    this.name = 'SpendCapError'
  }
}

// Caps in USD, from function secrets; the defaults sit well above what
// RegWay has spent so far (November 2026: $0.84 a day on average, about $25
// a month; the most one firm spent in a day, onboarding, was $5.68).
export interface Caps {
  firmDay: number
  totalDay: number
  firmMonth: number
  totalMonth: number
  // Share of each cap background work leaves for click-started work.
  reserve: number
}

function envNumber(name: string, fallback: number, ok: (n: number) => boolean): number {
  const raw = Deno.env.get(name)
  const value = Number(raw)
  return raw !== undefined && raw !== '' && Number.isFinite(value) && ok(value) ? value : fallback
}

export function spendCaps(): Caps {
  const positive = (n: number) => n > 0
  return {
    firmDay: envNumber('AI_FIRM_DAILY_CAP_USD', 15, positive),
    totalDay: envNumber('AI_TOTAL_DAILY_CAP_USD', 40, positive),
    firmMonth: envNumber('AI_FIRM_MONTHLY_CAP_USD', 100, positive),
    totalMonth: envNumber('AI_TOTAL_MONTHLY_CAP_USD', 300, positive),
    reserve: envNumber('AI_INTERACTIVE_RESERVE', 0.2, n => n >= 0 && n < 1),
  }
}

// What ai_spend_totals (migration 0051) returns.
export interface Spend {
  firm_day: number
  total_day: number
  firm_month: number
  total_month: number
}

// Functions whose every AI call is started by a person.
const INTERACTIVE_FUNCTIONS = /^(regway-ai-chat|rematch-regulation|research-firm)([/:]|$)/

export const isInteractive = (target: Pick<UsageTarget, 'functionName' | 'interactive'>) => target.interactive ?? INTERACTIVE_FUNCTIONS.test(target.functionName)

// The cap a call would go past, or null. Everything-together caps first: a
// month before a day, so the reason given is the one that lasts longest.
export function overCap(spend: Spend, caps: Caps, interactive: boolean): SpendCapError | null {
  const share = interactive ? 1 : 1 - caps.reserve
  const checks: [number, number, 'firm' | 'total', 'day' | 'month'][] = [
    [spend.total_month, caps.totalMonth, 'total', 'month'],
    [spend.total_day, caps.totalDay, 'total', 'day'],
    [spend.firm_month, caps.firmMonth, 'firm', 'month'],
    [spend.firm_day, caps.firmDay, 'firm', 'day'],
  ]
  for (const [spent, cap, scope, period] of checks) {
    if (Number(spent) >= cap * share) return new SpendCapError(scope, period, Number(spent) < cap)
  }
  return null
}

// Throws SpendCapError when a cap is reached. A failed check lets the call
// through (and says so in the log): the caps guard against abuse, and an
// unreadable database should not also stop every AI call.
export async function checkSpend(target: UsageTarget): Promise<void> {
  const { data, error } = await target.admin.rpc('ai_spend_totals', { p_firm_id: target.firmId ?? null })
  const spend = (Array.isArray(data) ? data[0] : data) as Spend | null
  if (error || !spend) {
    console.error('spend cap check failed; the call goes ahead', target.functionName, error?.message ?? 'no totals')
    return
  }
  const refused = overCap(spend, spendCaps(), isInteractive(target))
  if (refused) {
    console.warn('AI spend cap reached', refused.scope, refused.period, refused.reserve ? 'reserve' : '', target.functionName, target.firmId ?? '')
    throw refused
  }
}

// Why a call failed, in the words the dashboard's AI status (migration 0038)
// and the chat's error use. Null when the caller stopped it on purpose.
export type AiFailure = 'credit' | 'auth' | 'rate_limited' | 'unavailable' | 'timeout' | 'spend_cap' | 'other'

export function aiFailure(err: unknown): AiFailure | null {
  if (err instanceof SpendCapError) return 'spend_cap'
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
  spend_cap: 'RegWay AI has reached its spending limit for now. Please try again later.',
  other: 'The AI service could not answer this request.',
}

// A failed call, recorded beside the ones that worked: what the dashboard's
// AI status reads. A firm reaching its own cap is not recorded: the status
// is the same for every firm, so one firm's refusals would tell all of them
// that the AI is down. Nor is background work stopped to keep the reserve:
// people can still use the AI. Reaching a cap for all of RegWay is, so the
// dashboard says so and the owner gets the outage email.
export async function recordFailure(target: UsageTarget, model: string, err: unknown): Promise<void> {
  const failure = aiFailure(err)
  if (!failure) return
  if (err instanceof SpendCapError && (err.scope === 'firm' || err.reserve)) return
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
  if (opts.usage) {
    try {
      await checkSpend(opts.usage)
    } catch (err) {
      await recordFailure(opts.usage, request.model, err)
      throw err
    }
  }
  try {
    res = await send(request, opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout)
  } catch (err) {
    if (opts.usage) {
      await recordFailure(opts.usage, request.model, err)
      await recordTrace(opts.usage.admin, { ...traceTarget(opts.usage), model: request.model, request, error: String((err as Error)?.message ?? err) })
    }
    throw err
  }
  const result = (await res.json()) as ClaudeResponse
  if (opts.usage) {
    await recordCall(opts.usage, request.model, result.usage)
    await recordTrace(opts.usage.admin, { ...traceTarget(opts.usage), model: request.model, request, response: result })
  }
  return result
}

// For a streamed reply: the timeout applies until the response starts, then
// the stream is the caller's to read (and to record usage from, since it
// arrives in the stream's events). `spend` is checked against the caps first.
export async function streamClaude(request: ClaudeRequest, opts: Omit<CallOptions, 'usage'> & { spend?: UsageTarget } = {}): Promise<Response> {
  if (opts.spend) await checkSpend(opts.spend)
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

const traceTarget = (t: UsageTarget) => ({ functionName: t.functionName, firmId: t.firmId })

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
