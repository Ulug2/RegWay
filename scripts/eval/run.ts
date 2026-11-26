// Runs RegWay's own judges (and, if asked, the Skeptic) over a hand-marked
// set, exactly as the matchers call them, and scores the result (system
// guide §17.1). Calls the real AI: only `scripts/eval-matching.ts` runs it
// that way, after printing the estimated cost; unit tests stub the AI.
//
// Not covered yet: the enforcement judge (it lives inside its function,
// match-enforcement-relevance, and is not exported).

import { judgeRegulations } from '../../supabase/functions/_shared/regulatoryJudge.ts'
import { judgeGeopolitical, type Candidate } from '../../supabase/functions/_shared/geopoliticalJudge.ts'
import { companyFootprint, firmFootprint } from '../../supabase/functions/_shared/footprint.ts'
import { applySkeptic } from '../../supabase/functions/_shared/verdictReview.ts'
import { firmRecord } from '../../supabase/functions/_shared/roles/entityContext.ts'
import type { Verdict } from '../../supabase/functions/_shared/relevance.ts'
import { score, type DocumentResult, type EntityRef, type Score } from './score.ts'
import type { MatchingSet, SetDocument } from './matchingSet.ts'

const BATCH = 40

// Stands in for the database the judges write their side records to
// (usage, Skeptic reviews). Nothing is stored; the cost of each AI call is
// added up from the usage rows the AI client writes.
function noDatabase() {
  let costUsd = 0
  // Any query: every chained call returns the query; awaiting it gives `data`.
  const query = (data: unknown, onInsert?: (rows: unknown) => void): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === 'then') return (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok, fail)
          return (...args: unknown[]) => {
            if (key === 'insert') onInsert?.(args[0])
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const client = {
    from: (table: string) =>
      query(null, rows => {
        if (table === 'usage_events') for (const row of [rows].flat() as { estimated_cost_usd?: number }[]) costUsd += Number(row.estimated_cost_usd ?? 0)
      }),
    // Under every spend cap: an evaluation is the owner's own spending.
    rpc: (name: string) => query(name === 'ai_spend_totals' ? [{ firm_day: 0, total_day: 0, firm_month: 0, total_month: 0 }] : null),
  }
  return { client, cost: () => costUsd }
}

const relevantTo = (verdicts: Verdict[], index: number): EntityRef[] =>
  verdicts.filter(v => v.relevant && v.index === index).map(v => ({ scope: v.scope, name: v.scope === 'firm' ? null : v.entity_name }))

export interface EvalResult {
  label: string
  results: DocumentResult[]
  score: Score
  costUsd: number
}

export async function runEval(set: MatchingSet, opts: { skeptic: boolean; firmId?: string }): Promise<EvalResult> {
  const firmId = opts.firmId ?? 'eval-firm'
  const db = noDatabase()
  const admin = db.client as never
  const idOf = (kind: string, name: string) => `${kind}:${name}`
  const funds = set.funds.map(f => ({ ...f, id: idOf('fund', f.name) }))
  const companies = set.companies.map(c => ({ ...c, id: idOf('company', c.name) }))
  const entities = { firm: set.firm, funds, companies } as never
  const record = firmRecord(entities, (set.holdings ?? []).map(h => ({ fund_id: idOf('fund', h.fund), portfolio_company_id: idOf('company', h.company) })))
  const results: DocumentResult[] = []
  const skeptic = (category: 'regulatory' | 'geopolitical', candidates: SetDocument[], verdicts: Verdict[], functionName: string) =>
    opts.skeptic ? applySkeptic(admin, { firmId, category, entities, candidates: candidates as never, verdicts, functionName, mode: 'on', record }) : Promise.resolve(verdicts)

  const regulatory = set.documents.filter(d => d.category === 'regulatory')
  for (let start = 0; start < regulatory.length; start += BATCH) {
    const batch = regulatory.slice(start, start + BATCH)
    const candidates = batch.map(d => ({ id: d.id, title: d.title, agency: d.agency, jurisdiction: d.jurisdiction ?? null, summary: d.summary }))
    const judged = await judgeRegulations(admin, { firmId, entities, candidates, functionName: 'eval/match-relevance' })
    const verdicts = await skeptic('regulatory', batch, judged, 'eval/match-relevance')
    batch.forEach((d, i) => results.push({ id: d.id, expected: d.expected ?? [], predicted: relevantTo(verdicts, i) }))
  }

  const geopolitical = set.documents.filter(d => d.category === 'geopolitical')
  const footprints = [firmFootprint(set.firm as never), ...companies.map(c => companyFootprint(c as never))]
  for (let start = 0; start < geopolitical.length; start += BATCH) {
    const batch = geopolitical.slice(start, start + BATCH)
    const candidates: Candidate[] = batch.map(d => ({ id: d.id, title: d.title, agency: d.agency, summary: d.summary, countries: d.countries ?? [], published_date: d.published_date ?? null }))
    const judged = await judgeGeopolitical(admin, { firmId, firmName: set.firm.name, companies: companies as never, footprints, candidates, functionName: 'eval/match-geopolitical-relevance' })
    const verdicts = await skeptic('geopolitical', batch, judged, 'eval/match-geopolitical-relevance')
    batch.forEach((d, i) => results.push({ id: d.id, expected: d.expected ?? [], predicted: relevantTo(verdicts, i) }))
  }

  return { label: opts.skeptic ? 'judges + Skeptic' : 'judges alone', results, score: score(results), costUsd: db.cost() }
}
