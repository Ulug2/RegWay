// Puts the Skeptic (roles/skeptic.ts) between a matcher's verdicts and the
// dashboard. Every match a matcher marks relevant is reviewed; what happens
// next depends on SKEPTIC_MODE (an Edge Function secret):
//
//   off     (default) no review, verdicts stored as the matcher gave them
//   shadow  reviewed and recorded in verdict_reviews, verdicts unchanged:
//           for measuring the Skeptic on live matches before trusting it
//   on      a rejected match is stored as "not relevant" (so it is not
//           judged again), a moved one on the entity it really rests on
//
// A review that fails (timeout, unusable answer) never blocks matching: the
// verdicts pass through as the matcher gave them, and the failure is
// recorded.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { MODEL_FOR } from './ai/models.ts'
import type { FirmEntities, Verdict } from './relevance.ts'
import { firmRecord, loadHoldings, type FirmRecord } from './roles/entityContext.ts'
import { reviewVerdicts, type DocumentUnderReview, type ReviewCategory, type VerdictReview, type VerdictUnderReview } from './roles/skeptic.ts'

export type SkepticMode = 'off' | 'shadow' | 'on'

export function skepticMode(): SkepticMode {
  const mode = Deno.env.get('SKEPTIC_MODE')
  return mode === 'shadow' || mode === 'on' ? mode : 'off'
}

// The marker a rejected match is stored with, after "NOT_RELEVANT: ".
export const REVIEWED_PREFIX = 'Reviewed: '

export interface ReviewCandidate {
  id: string
  title: string
  agency: string | null
  jurisdiction?: string | null
  summary: string | null
  published_date?: string | null
  effective_date?: string | null
  countries?: string[] | null
}

export const asDocument = (c: ReviewCandidate): DocumentUnderReview => ({
  title: c.title,
  issuer: c.agency,
  jurisdiction: c.jurisdiction ?? null,
  published_date: c.published_date ?? null,
  effective_date: c.effective_date ?? null,
  summary: c.summary,
  countries: c.countries ?? undefined,
})

export interface ReviewRow {
  firm_id: string
  regulation_id: string
  relevance_id?: string | null
  function_name: string
  mode: 'shadow' | 'on' | 'backfill'
  original: { scope: string; entity_name: string | null; reason: string }
  decision: 'keep' | 'move' | 'reject' | 'failed'
  scope: string | null
  entity_name: string | null
  reason: string
  unsupported_assumptions: string[]
  model: string
}

export async function recordReviews(admin: SupabaseClient, rows: ReviewRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('verdict_reviews').insert(rows)
  // Losing the audit row must not lose the match: log and carry on.
  if (error) console.error('failed to record verdict reviews', error.message)
}

export const reviewRow = (
  base: Pick<ReviewRow, 'firm_id' | 'function_name' | 'mode'>,
  regulationId: string,
  original: { scope: string; entity_name: string | null; reason: string },
  review: VerdictReview | { error: string },
  relevanceId: string | null = null,
): ReviewRow => ({
  ...base,
  regulation_id: regulationId,
  relevance_id: relevanceId,
  original,
  model: MODEL_FOR.skeptic,
  ...('error' in review
    ? { decision: 'failed' as const, scope: null, entity_name: null, reason: review.error, unsupported_assumptions: [] }
    : { decision: review.decision, scope: review.scope, entity_name: review.entity_name, reason: review.reason, unsupported_assumptions: review.unsupported_assumptions }),
})

// The verdict a review leaves behind.
// A kept match that depends on facts not recorded says so in its reason,
// where the firm reads why it is shown.
export const dependsOnNote = (unrecorded: string[]): string => (unrecorded.length ? `Depends on facts not recorded: ${unrecorded.join('; ')}.` : '')

export function applyReview(verdict: Verdict, review: VerdictReview): Verdict {
  if (review.decision === 'reject') return { ...verdict, relevant: false, reason: `${REVIEWED_PREFIX}${review.reason}` }
  if (review.decision === 'move') return { ...verdict, scope: review.scope, entity_name: review.entity_name, reason: review.reason }
  const note = dependsOnNote(review.unsupported_assumptions)
  return note ? { ...verdict, reason: `${verdict.reason} ${note}` } : verdict
}

export async function applySkeptic(
  admin: SupabaseClient,
  opts: {
    firmId: string
    category: ReviewCategory
    entities: FirmEntities & { firm: NonNullable<FirmEntities['firm']> }
    candidates: ReviewCandidate[]
    verdicts: Verdict[]
    functionName: string
    mode?: SkepticMode
    // Already loaded by the caller; read here otherwise.
    record?: FirmRecord
  },
): Promise<Verdict[]> {
  const mode = opts.mode ?? skepticMode()
  const { firmId, candidates, verdicts, functionName } = opts
  if (mode === 'off') return verdicts

  // Positions in `verdicts` of the matches to review.
  const relevant = verdicts.map((v, i) => [v, i] as const).filter(([v]) => v.relevant && candidates[v.index])
  if (relevant.length === 0) return verdicts

  const items: VerdictUnderReview[] = relevant.map(([v, i]) => ({
    index: i,
    document: asDocument(candidates[v.index]),
    scope: v.scope,
    entity_name: v.scope === 'firm' ? null : v.entity_name,
    reason: v.reason,
  }))
  const base = { firm_id: firmId, function_name: functionName, mode } as const
  const original = (v: Verdict) => ({ scope: v.scope, entity_name: v.scope === 'firm' ? null : v.entity_name, reason: v.reason })

  let reviews: VerdictReview[]
  try {
    const record = opts.record ?? firmRecord(opts.entities, await loadHoldings(admin, firmId))
    reviews = await reviewVerdicts({ record, category: opts.category, items }, { admin, functionName: `${functionName}/skeptic`, firmId })
  } catch (err) {
    const message = (err as Error).message
    console.error('skeptic review failed; verdicts kept as given', functionName, message)
    await recordReviews(admin, relevant.map(([v]) => reviewRow(base, candidates[v.index].id, original(v), { error: message })))
    return verdicts
  }

  const byPosition = new Map(reviews.map(r => [r.index, r]))
  await recordReviews(
    admin,
    relevant.map(([v, i]) => reviewRow(base, candidates[v.index].id, original(v), byPosition.get(i)!)),
  )
  if (mode === 'shadow') return verdicts
  return verdicts.map((v, i) => (byPosition.has(i) ? applyReview(v, byPosition.get(i)!) : v))
}
