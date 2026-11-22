// Keeps what an AI call was sent and what it answered, for 30 days
// (`ai_traces`, migration 0052; system guide §17.9), so a wrong match can be
// traced to what the judge was told. Never throws: a failure to keep a trace
// must never break the call it records.
//
// Off with the function secret AI_TRACES=off.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

// A string longer than this (an attached PDF's base64, a very long
// document) is cut, with how long it was.
export const MAX_STRING = 60_000

// The value with every long string shortened, and the data of any base64
// source (a PDF) replaced by its size.
export function shorten(value: unknown): unknown {
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [${value.length - MAX_STRING} more characters not kept]` : value
  if (Array.isArray(value)) return value.map(shorten)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const source = value as { type?: unknown; data?: unknown }
    return Object.fromEntries(
      entries.map(([k, v]) => [k, source.type === 'base64' && k === 'data' && typeof v === 'string' ? `[base64, ${v.length} characters not kept]` : shorten(v)]),
    )
  }
  return value
}

export const tracesOn = () => (Deno.env.get('AI_TRACES') ?? 'on').toLowerCase() !== 'off'

export async function recordTrace(
  admin: SupabaseClient,
  row: { functionName: string; firmId?: string | null; model: string; request: unknown; response?: { content?: unknown; stop_reason?: unknown } | null; error?: string },
): Promise<void> {
  if (!tracesOn()) return
  try {
    const { error } = await admin.from('ai_traces').insert({
      function_name: row.functionName,
      firm_id: row.firmId ?? null,
      model: row.model,
      request: shorten(row.request),
      response: row.response ? shorten({ content: row.response.content ?? null, stop_reason: row.response.stop_reason ?? null }) : null,
      ok: !row.error,
      ...(row.error ? { error: row.error.slice(0, 500) } : {}),
    })
    if (error) console.error('failed to keep AI trace', row.functionName, error.message)
  } catch (err) {
    console.error('failed to keep AI trace', row.functionName, (err as Error).message)
  }
}
