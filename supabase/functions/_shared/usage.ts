// Records one Anthropic API call's token/cost usage into `usage_events`.
// Never throws — a failure to log usage must never break the call it's
// logging. Requires a service-role client: `usage_events` has RLS enabled
// with no policies, since it's internal cost telemetry, not firm-scoped
// user data.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

// Anthropic list pricing per million tokens (USD), by model, and per web
// search. A single source of truth for the cost ESTIMATE stored alongside
// each row — real enough to spot trends and spikes, not a billing
// reconciliation (Anthropic's own invoice is authoritative). A model not
// listed is priced at the highest known price for each kind of token, so a
// model nobody priced yet can't spend around the caps (Sidekick §17.3).
interface Prices {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
}
const SONNET_4_5: Prices = { input: 3.0, cacheWrite: 3.75, cacheRead: 0.3, output: 15.0 }
const PRICES: Record<string, Prices> = {
  'claude-sonnet-4-5': SONNET_4_5,
  'claude-haiku-4-5': { input: 1.0, cacheWrite: 1.25, cacheRead: 0.1, output: 5.0 },
}
const PRICE_PER_WEB_SEARCH = 0.01
const highest = (key: keyof Prices) => Math.max(...Object.values(PRICES).map(p => p[key]))
export const UNKNOWN_MODEL_PRICES: Prices = { input: highest('input'), cacheWrite: highest('cacheWrite'), cacheRead: highest('cacheRead'), output: highest('output') }

export interface UsageTotals {
  inputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  outputTokens?: number
  webSearchRequests?: number
}

export function estimateCostUsd(model: string, u: UsageTotals): number {
  const p = PRICES[model] ?? UNKNOWN_MODEL_PRICES
  return (
    ((u.inputTokens ?? 0) / 1_000_000) * p.input +
    ((u.cacheCreationInputTokens ?? 0) / 1_000_000) * p.cacheWrite +
    ((u.cacheReadInputTokens ?? 0) / 1_000_000) * p.cacheRead +
    ((u.outputTokens ?? 0) / 1_000_000) * p.output +
    (u.webSearchRequests ?? 0) * PRICE_PER_WEB_SEARCH
  )
}

// Reads the handful of shapes Anthropic's `usage` object can take (plain
// non-streaming response, or a streaming message_start/message_delta event)
// and merges in whichever fields are present — later calls overwrite
// earlier ones, since message_delta's final usage is the most complete.
export function mergeUsage(into: UsageTotals, raw: Record<string, unknown> | null | undefined): void {
  if (!raw) return
  if (typeof raw.input_tokens === 'number') into.inputTokens = raw.input_tokens
  if (typeof raw.cache_creation_input_tokens === 'number') into.cacheCreationInputTokens = raw.cache_creation_input_tokens
  if (typeof raw.cache_read_input_tokens === 'number') into.cacheReadInputTokens = raw.cache_read_input_tokens
  if (typeof raw.output_tokens === 'number') into.outputTokens = raw.output_tokens
  const serverToolUse = raw.server_tool_use as Record<string, unknown> | undefined
  if (serverToolUse && typeof serverToolUse.web_search_requests === 'number') {
    into.webSearchRequests = serverToolUse.web_search_requests
  }
}

export async function recordUsage(
  admin: SupabaseClient,
  params: { functionName: string; firmId?: string | null; model: string; ok?: boolean; error?: string } & UsageTotals,
): Promise<void> {
  try {
    await admin.from('usage_events').insert({
      function_name: params.functionName,
      firm_id: params.firmId ?? null,
      model: params.model,
      input_tokens: params.inputTokens ?? 0,
      cache_creation_input_tokens: params.cacheCreationInputTokens ?? 0,
      cache_read_input_tokens: params.cacheReadInputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      web_search_requests: params.webSearchRequests ?? 0,
      estimated_cost_usd: estimateCostUsd(params.model, params),
      ok: params.ok ?? true,
      ...(params.error ? { error: params.error } : {}),
    })
  } catch (err) {
    console.error('failed to record usage event', params.functionName, (err as Error).message)
  }
}
