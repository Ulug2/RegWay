// Records one Anthropic API call's token/cost usage into `usage_events`.
// Never throws — a failure to log usage must never break the call it's
// logging. Requires a service-role client: `usage_events` has RLS enabled
// with no policies, since it's internal cost telemetry, not firm-scoped
// user data.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// Anthropic list pricing, Claude Sonnet 4.5, per million tokens (USD) /
// per search (USD). A single source of truth for the cost ESTIMATE stored
// alongside each row — real enough to spot trends and spikes, not a
// billing reconciliation (Anthropic's own invoice is authoritative).
const PRICE_PER_MILLION_INPUT = 3.0
const PRICE_PER_MILLION_CACHE_WRITE = 3.75
const PRICE_PER_MILLION_CACHE_READ = 0.3
const PRICE_PER_MILLION_OUTPUT = 15.0
const PRICE_PER_WEB_SEARCH = 0.01

export interface UsageTotals {
  inputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  outputTokens?: number
  webSearchRequests?: number
}

function estimateCostUsd(u: UsageTotals): number {
  return (
    ((u.inputTokens ?? 0) / 1_000_000) * PRICE_PER_MILLION_INPUT +
    ((u.cacheCreationInputTokens ?? 0) / 1_000_000) * PRICE_PER_MILLION_CACHE_WRITE +
    ((u.cacheReadInputTokens ?? 0) / 1_000_000) * PRICE_PER_MILLION_CACHE_READ +
    ((u.outputTokens ?? 0) / 1_000_000) * PRICE_PER_MILLION_OUTPUT +
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
  params: { functionName: string; firmId?: string | null; model: string; ok?: boolean } & UsageTotals,
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
      estimated_cost_usd: estimateCostUsd(params),
      ok: params.ok ?? true,
    })
  } catch (err) {
    console.error('failed to record usage event', params.functionName, (err as Error).message)
  }
}
