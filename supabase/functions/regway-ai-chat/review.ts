// The check run after an answer that claims something applies (or doesn't)
// to the firm, a fund or a company (roadmap item 17). The answer has already
// streamed as usual; this adds, on the same stream:
//
//   1. the claim gate (roles/claimGate.ts): no applicability claim → done,
//      nothing shown;
//   2. two checks side by side, each announced with a step label while it
//      runs: the Skeptic against the recorded facts and RegWay's matches
//      (roles/skeptic.ts reviewAnswer), and the claims against the passages
//      the answer cited (roles/citationCheck.ts);
//   3. a short note: "supported", or "caution" with what each doubtful claim
//      rests on.
//
// A step that fails is labelled as not checked; nothing is made up in its
// place. Switched on by the CHAT_REVIEW secret ("on"); off by default.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { findApplicabilityClaims, type ApplicabilityClaim } from '../_shared/roles/claimGate.ts'
import { checkCitations, distinctSources, type CitationFinding, type CitedSource } from '../_shared/roles/citationCheck.ts'
import type { FirmRecord } from '../_shared/roles/entityContext.ts'
import { reviewAnswer, type ClaimReview } from '../_shared/roles/skeptic.ts'

export const chatReviewEnabled = () => Deno.env.get('CHAT_REVIEW') === 'on'

const GATE_TIMEOUT_MS = 10_000
const CHECK_TIMEOUT_MS = 45_000

export type ReviewStep = 'facts' | 'sources'
type StepState = 'running' | 'done' | 'failed'

const LABELS: Record<ReviewStep, Record<StepState, string>> = {
  facts: { running: 'Checking against your recorded facts…', done: 'Checked against your recorded facts', failed: "Couldn't check against your recorded facts" },
  sources: { running: 'Verifying sources…', done: 'Verified sources', failed: "Couldn't verify sources" },
}

export interface StatusEvent {
  type: 'regway_status'
  step: ReviewStep
  state: StepState
  label: string
}

export interface AnswerReview {
  status: 'supported' | 'caution'
  // Which checks ran to the end.
  checks: ReviewStep[]
  claims: number
  notes: { claim: string; note: string }[]
}

export interface ReviewEvent {
  type: 'regway_review'
  review: AnswerReview
}

// The note from whatever checks finished. Exported for its tests.
export function composeReview(claims: ApplicabilityClaim[], facts: ClaimReview[] | null, sources: CitationFinding[] | null): AnswerReview {
  const notes: { claim: string; note: string }[] = []
  claims.forEach((c, i) => {
    const problems: string[] = []
    const fact = facts?.find(r => r.index === i)
    if (fact && fact.verdict !== 'supported') problems.push(fact.note)
    const source = sources?.find(f => f.index === i)
    if (source?.status === 'contradicted') problems.push(`The cited source says otherwise: ${source.note}`)
    if (problems.length) notes.push({ claim: c.claim, note: problems.join(' ') })
  })
  return {
    status: notes.length ? 'caution' : 'supported',
    checks: [...(facts ? ['facts' as const] : []), ...(sources ? ['sources' as const] : [])],
    claims: claims.length,
    notes,
  }
}

export async function checkAnswer(opts: {
  admin: SupabaseClient
  firmId: string
  record: FirmRecord
  matched: string
  question: string
  answer: string
  citations: CitedSource[]
  signal: AbortSignal
  emit: (event: StatusEvent | ReviewEvent) => void
}): Promise<AnswerReview | null> {
  const { admin, firmId, record, signal, emit } = opts
  const usage = (role: string) => ({ admin, functionName: `regway-ai-chat/${role}`, firmId })

  let claims: ApplicabilityClaim[]
  try {
    claims = await findApplicabilityClaims(
      {
        question: opts.question,
        answer: opts.answer,
        firmName: record.firmName,
        funds: record.entities.filter(e => e.scope === 'fund').map(e => e.name),
        companies: record.entities.filter(e => e.scope === 'company').map(e => e.name),
      },
      { usage: usage('gate'), signal, timeoutMs: GATE_TIMEOUT_MS },
    )
  } catch (err) {
    console.error('chat claim gate failed', (err as Error).message)
    return null
  }
  if (claims.length === 0 || signal.aborted) return null

  // Each step reports when it starts and when it ends, independently.
  const step = <T>(name: ReviewStep, work: Promise<T>): Promise<T | null> => {
    emit({ type: 'regway_status', step: name, state: 'running', label: LABELS[name].running })
    return work.then(
      result => {
        emit({ type: 'regway_status', step: name, state: 'done', label: LABELS[name].done })
        return result
      },
      err => {
        console.error(`chat ${name} check failed`, (err as Error).message)
        emit({ type: 'regway_status', step: name, state: 'failed', label: LABELS[name].failed })
        return null
      },
    )
  }

  // An answer that cited nothing (one drawn from RegWay's own matches) has
  // no sources to verify: that step is left out rather than shown as done.
  const cited = distinctSources(opts.citations).length > 0
  const [facts, sources] = await Promise.all([
    step('facts', reviewAnswer({ record, matched: opts.matched, claims }, { usage: usage('skeptic'), signal, timeoutMs: CHECK_TIMEOUT_MS })),
    cited ? step('sources', checkCitations({ claims: claims.map(c => c.claim), citations: opts.citations }, { usage: usage('citations'), signal, timeoutMs: CHECK_TIMEOUT_MS })) : null,
  ])
  if ((!facts && !sources) || signal.aborted) return null

  const review = composeReview(claims, facts, sources)
  emit({ type: 'regway_review', review })
  return review
}
