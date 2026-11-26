// Runs the Skeptic (roles/skeptic.ts) over a firm's matches that already
// exist, for measuring it before it is trusted and for cleaning up matches
// made before it existed (roadmap item 17, phase 3). Service key only: it
// spends AI credit and is run by the owner by hand.
//
// Review: each call reviews up to MAX_PER_CALL of the firm's current
// matches not yet reviewed this way, records each review in verdict_reviews
// (mode 'backfill') and changes nothing else. Call again until `remaining`
// is 0. A batch the AI could not review is left for the next call and
// counted in `failed`, with the reason in `errors` (status 502 when nothing
// at all could be reviewed). Matches from company web scans and enforcement cases are not
// reviewed (the Skeptic does not cover them yet).
//
//   POST /functions/v1/review-existing-matches   { "firmId": "<uuid>" }
//
// To review again after the Skeptic changed, pass the time the new round
// started: only reviews made since then count as done.
//
//   POST /functions/v1/review-existing-matches   { "firmId": "<uuid>", "since": "<ISO time>" }
//
// Apply: only the reviews the owner approved, by id. A rejection turns the
// match into a "not relevant" marker; a move puts it on the entity named; a
// keep that depends on facts not recorded adds them to the match's reason.
//
//   POST /functions/v1/review-existing-matches   { "firmId": "<uuid>", "apply": ["<review id>", ...] }
//
//   Authorization: Bearer <service key>

import { resolveEntity } from '../_shared/entityNames.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { handleOptions, json } from '../_shared/cors.ts'
import { syncHoldingsRollup } from '../_shared/holdings.ts'
import { generateImpacts } from '../_shared/impact.ts'
import { loadFirmEntities, type CompanyRow, type FundRow } from '../_shared/relevance.ts'
import { firmRecord, loadHoldings, type EntityScope, type FirmRecord } from '../_shared/roles/entityContext.ts'
import { reviewVerdicts, type ReviewCategory, type VerdictUnderReview } from '../_shared/roles/skeptic.ts'
import { asDocument, dependsOnNote, REVIEWED_PREFIX, reviewRow, type ReviewCandidate } from '../_shared/verdictReview.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const FUNCTION_NAME = 'review-existing-matches'
const BATCH_SIZE = 15
// Batches run side by side; three keep a call well inside the wall-clock limit.
const MAX_PER_CALL = BATCH_SIZE * 3
const CATEGORIES: ReviewCategory[] = ['regulatory', 'geopolitical']

interface MatchRow {
  id: string
  regulation_id: string
  fund_id: string | null
  portfolio_company_id: string | null
  relevance_reason: string
  funds: { name: string } | null
  portfolio_companies: { name: string } | null
  regulations: ReviewCandidate & { category: string; source: string }
}

async function loadUnreviewed(admin: SupabaseClient, firmId: string, since?: string): Promise<MatchRow[]> {
  let reviewedQuery = admin.from('verdict_reviews').select('relevance_id').eq('firm_id', firmId).eq('mode', 'backfill').not('relevance_id', 'is', null)
  if (since) reviewedQuery = reviewedQuery.gte('created_at', since)
  const [matches, reviewed] = await Promise.all([
    admin
      .from('regulation_relevance')
      .select(
        'id, regulation_id, fund_id, portfolio_company_id, relevance_reason, funds(name), portfolio_companies(name), regulations!inner(id, title, agency, jurisdiction, summary, published_date, effective_date, countries, category, source)',
      )
      .eq('firm_id', firmId)
      .eq('via_holdings', false)
      .is('dismissed_at', null)
      .not('relevance_reason', 'like', 'NOT_RELEVANT:%')
      .in('regulations.category', CATEGORIES)
      .neq('regulations.source', 'ai_search')
      .order('created_at', { ascending: false }),
    reviewedQuery,
  ])
  if (matches.error) throw matches.error
  if (reviewed.error) throw reviewed.error
  const done = new Set((reviewed.data ?? []).map(r => r.relevance_id))
  return ((matches.data ?? []) as unknown as MatchRow[]).filter(m => !done.has(m.id))
}

const scopeOf = (m: MatchRow): { scope: EntityScope; entity_name: string | null } =>
  m.fund_id ? { scope: 'fund', entity_name: m.funds?.name ?? null } : m.portfolio_company_id ? { scope: 'company', entity_name: m.portfolio_companies?.name ?? null } : { scope: 'firm', entity_name: null }

// A batch whose review failed is not recorded, so the next call tries those
// matches again; its error is reported rather than counted as "reviewed 0".
async function reviewBatch(admin: SupabaseClient, firmId: string, record: FirmRecord, category: ReviewCategory, batch: MatchRow[]) {
  const items: VerdictUnderReview[] = batch.map((m, index) => ({ index, document: asDocument(m.regulations), ...scopeOf(m), reason: m.relevance_reason }))
  const base = { firm_id: firmId, function_name: FUNCTION_NAME, mode: 'backfill' } as const
  let rows
  try {
    const reviews = await reviewVerdicts({ record, category, items }, { admin, functionName: `${FUNCTION_NAME}/skeptic`, firmId })
    const byIndex = new Map(reviews.map(r => [r.index, r]))
    rows = batch.map((m, i) => reviewRow(base, m.regulation_id, { ...scopeOf(m), reason: m.relevance_reason }, byIndex.get(i)!, m.id))
  } catch (err) {
    const error = (err as Error).message
    console.error('backfill review failed', error)
    return { reviews: [], failed: batch.length, error }
  }
  const { data, error } = await admin.from('verdict_reviews').insert(rows).select('id, relevance_id, decision, scope, entity_name, reason, unsupported_assumptions, original')
  if (error) throw error
  const titleOf = new Map(batch.map(m => [m.id, m.regulations.title]))
  return { reviews: (data ?? []).map(r => ({ ...r, title: titleOf.get(r.relevance_id as string) })), failed: 0, error: null }
}

async function review(admin: SupabaseClient, firmId: string, since?: string) {
  const entities = await loadFirmEntities(admin, firmId)
  if (!entities.firm) return json({ error: 'Firm not found' }, 404)
  const record = firmRecord({ ...entities, firm: entities.firm }, await loadHoldings(admin, firmId))

  const unreviewed = await loadUnreviewed(admin, firmId, since)
  const now = unreviewed.slice(0, MAX_PER_CALL)
  const batches = CATEGORIES.flatMap(category => {
    const ofCategory = now.filter(m => m.regulations.category === category)
    return Array.from({ length: Math.ceil(ofCategory.length / BATCH_SIZE) }, (_, i) => ({ category, rows: ofCategory.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE) }))
  })
  const results = await Promise.all(batches.map(b => reviewBatch(admin, firmId, record, b.category, b.rows)))
  const reviews = results.flatMap(r => r.reviews)
  const failed = results.reduce((n, r) => n + r.failed, 0)
  const errors = [...new Set(results.flatMap(r => (r.error ? [r.error] : [])))]
  const body = { reviewed: reviews.length, failed, remaining: unreviewed.length - reviews.length, ...(errors.length ? { errors } : {}), reviews }
  // Nothing reviewed because every batch failed (no AI credit, the API down):
  // an error, not an empty success.
  return json(body, failed > 0 && reviews.length === 0 ? 502 : 200)
}

interface StoredReview {
  id: string
  relevance_id: string
  regulation_id: string
  decision: 'keep' | 'move' | 'reject'
  scope: EntityScope
  entity_name: string | null
  reason: string
  unsupported_assumptions: string[]
  original: { reason?: string }
}

// The (fund_id, portfolio_company_id) pair a moved match is stored under.
function targetOf(review: StoredReview, funds: FundRow[], companies: CompanyRow[]): { fund_id: string | null; portfolio_company_id: string | null } | null {
  const named = (rows: { id: string; name: string }[]) => resolveEntity(rows, review.entity_name)?.id
  if (review.scope === 'firm') return { fund_id: null, portfolio_company_id: null }
  const id = named(review.scope === 'fund' ? funds : companies)
  if (!id) return null
  return review.scope === 'fund' ? { fund_id: id, portfolio_company_id: null } : { fund_id: null, portfolio_company_id: id }
}

async function applyOne(admin: SupabaseClient, firmId: string, review: StoredReview, funds: FundRow[], companies: CompanyRow[]): Promise<boolean> {
  if (review.decision === 'reject') {
    const { error } = await admin.from('regulation_relevance').update({ relevance_reason: `NOT_RELEVANT: ${REVIEWED_PREFIX}${review.reason}` }).eq('id', review.relevance_id).eq('firm_id', firmId)
    if (error) throw error
    return true
  }
  if (review.decision === 'keep') {
    const note = dependsOnNote(review.unsupported_assumptions ?? [])
    if (!note || !review.original?.reason) return false
    const { error } = await admin.from('regulation_relevance').update({ relevance_reason: `${review.original.reason} ${note}` }).eq('id', review.relevance_id).eq('firm_id', firmId)
    if (error) throw error
    return true
  }

  const target = targetOf(review, funds, companies)
  if (!target) return false
  // A row may already stand on the target entity (a match, or a "not
  // relevant" marker): the review's reason goes there and the moved row goes.
  let existing = admin.from('regulation_relevance').select('id').eq('firm_id', firmId).eq('regulation_id', review.regulation_id)
  existing = target.fund_id ? existing.eq('fund_id', target.fund_id) : existing.is('fund_id', null)
  existing = target.portfolio_company_id ? existing.eq('portfolio_company_id', target.portfolio_company_id) : existing.is('portfolio_company_id', null)
  const { data: there, error: lookupError } = await existing.maybeSingle()
  if (lookupError) throw lookupError

  if (there && there.id !== review.relevance_id) {
    const { error: updateError } = await admin.from('regulation_relevance').update({ relevance_reason: review.reason, dismissed_at: null }).eq('id', there.id)
    if (updateError) throw updateError
    const { error: deleteError } = await admin.from('regulation_relevance').delete().eq('id', review.relevance_id)
    if (deleteError) throw deleteError
  } else {
    const { error } = await admin.from('regulation_relevance').update({ ...target, relevance_reason: review.reason }).eq('id', review.relevance_id)
    if (error) throw error
  }
  return true
}

async function apply(admin: SupabaseClient, firmId: string, ids: string[]) {
  const { data, error } = await admin
    .from('verdict_reviews')
    .select('id, relevance_id, regulation_id, decision, scope, entity_name, reason, unsupported_assumptions, original')
    .eq('firm_id', firmId)
    .eq('mode', 'backfill')
    .in('id', ids)
    .in('decision', ['keep', 'move', 'reject'])
    .is('applied_at', null)
    .not('relevance_id', 'is', null)
  if (error) throw error
  const reviews = (data ?? []) as StoredReview[]

  const { funds, companies } = await loadFirmEntities(admin, firmId)
  const applied: string[] = []
  const moved = new Set<string>()
  for (const r of reviews) {
    if (!(await applyOne(admin, firmId, r, funds, companies))) continue
    applied.push(r.id)
    if (r.decision === 'move') moved.add(r.regulation_id)
  }
  if (applied.length) {
    const { error: markError } = await admin.from('verdict_reviews').update({ applied_at: new Date().toISOString() }).in('id', applied)
    if (markError) throw markError
    // Fund rows follow company matches for geopolitical items.
    await syncHoldingsRollup(admin, firmId, 'geopolitical', { funds, companies })
  }
  // A moved match's analysis was written for the old entity.
  if (moved.size) EdgeRuntime.waitUntil(generateImpacts([...moved], firmId, moved.size, { force: true }))

  return json({ applied: applied.length, skipped: ids.length - applied.length, appliedIds: applied })
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== key) return json({ error: 'Service key required' }, 401)

  try {
    const body = await req.json().catch(() => ({}))
    const firmId = body?.firmId as string | undefined
    if (!firmId) return json({ error: 'firmId is required' }, 400)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key)

    if (Array.isArray(body.apply)) return await apply(admin, firmId, body.apply.filter((id: unknown): id is string => typeof id === 'string'))
    const since = typeof body.since === 'string' && !Number.isNaN(Date.parse(body.since)) ? body.since : undefined
    return await review(admin, firmId, since)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
