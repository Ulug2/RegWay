import { describe, expect, it } from 'vitest'
import { estimateCostUsd, mergeUsage, recordUsage, type UsageTotals } from '../../supabase/functions/_shared/usage.ts'
import { fakeClient } from './helpers/fakeSupabase'

describe('mergeUsage', () => {
  it('combines the usage reported at the start and end of a streamed reply', () => {
    const usage: UsageTotals = {}
    mergeUsage(usage, { input_tokens: 337, cache_creation_input_tokens: 18502, cache_read_input_tokens: 2212, output_tokens: 1 })
    mergeUsage(usage, { output_tokens: 648, server_tool_use: { web_search_requests: 3 } })
    expect(usage).toEqual({ inputTokens: 337, cacheCreationInputTokens: 18502, cacheReadInputTokens: 2212, outputTokens: 648, webSearchRequests: 3 })
  })

  it('ignores a missing usage object', () => {
    const usage: UsageTotals = { inputTokens: 5 }
    mergeUsage(usage, null)
    mergeUsage(usage, undefined)
    expect(usage).toEqual({ inputTokens: 5 })
  })
})

describe('recordUsage', () => {
  it('stores the token counts with a cost estimate at list prices', async () => {
    const db = fakeClient()
    await recordUsage(db as never, {
      functionName: 'regway-ai-chat',
      firmId: 'firm-1',
      model: 'claude-sonnet-4-5',
      inputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      webSearchRequests: 5,
    })
    const [insert] = db.ran('usage_events', 'insert')
    expect(insert.payload).toMatchObject({ function_name: 'regway-ai-chat', firm_id: 'firm-1', ok: true, web_search_requests: 5 })
    // $3 input + $3.75 cache write + $0.30 cache read + $15 output + 5 × $0.01
    expect((insert.payload as { estimated_cost_usd: number }).estimated_cost_usd).toBeCloseTo(22.1, 6)
  })

  it('prices by model: Haiku 4.5 at a third of Sonnet 4.5, unknown models as Sonnet', () => {
    const tokens = { inputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000, outputTokens: 1_000_000 }
    // $1 input + $1.25 cache write + $0.10 cache read + $5 output
    expect(estimateCostUsd('claude-haiku-4-5', tokens)).toBeCloseTo(7.35, 6)
    expect(estimateCostUsd('claude-sonnet-4-5', tokens)).toBeCloseTo(22.05, 6)
    expect(estimateCostUsd('some-new-model', tokens)).toBeCloseTo(22.05, 6)
  })

  it('defaults missing counts to zero', async () => {
    const db = fakeClient()
    await recordUsage(db as never, { functionName: 'x', model: 'm' })
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ firm_id: null, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 })
  })

  it('never throws: a logging failure must not break the call it logs', async () => {
    const broken = { from: () => { throw new Error('db down') } }
    await expect(recordUsage(broken as never, { functionName: 'x', model: 'm' })).resolves.toBeUndefined()
  })
})
