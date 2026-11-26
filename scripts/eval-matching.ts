// pnpm eval:matching [set.json ...] [--skeptic] [--yes] [--regulatory-model=ID] [--geopolitical-model=ID]
//
// Several sets of the same firm are scored as one (their documents
// together). A model flag tries that model for the judge instead of its own; the
// AI_EFFORT variable sets how hard a Claude 5 model thinks (ai/modelRules.ts).
//
// Scores RegWay's matcher against a hand-marked test set (system guide
// §17.1): precision, recall and cost, with the judges alone and, with
// --skeptic, also with the Skeptic. CALLS THE REAL AI and spends money: it
// prints the estimated cost first and asks before sending anything (--yes
// skips the question). The owner runs it; the key comes from
// supabase/functions/.env.
//
// Record each run's result in plans/eval-history.md. No prompt or model
// change merges with a worse score than the last one recorded.

import { estimateCostUsd, problemsWith, type MatchingSet } from './eval/matchingSet.ts'
import { formatScore } from './eval/score.ts'
import { runEval } from './eval/run.ts'

const args = Deno.args
const paths = args.filter(a => !a.startsWith('--'))
if (!paths.length) paths.push('tests/eval/matching-set.json')
const path = paths.join(' + ')
const flag = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const models = { regulatory: flag('regulatory-model'), geopolitical: flag('geopolitical-model') }
const withSkeptic = args.includes('--skeptic')

const sets = await Promise.all(paths.map(async p => JSON.parse(await Deno.readTextFile(p)) as MatchingSet))
const sameFirm = (a: MatchingSet, b: MatchingSet) => JSON.stringify([a.firm, a.funds, a.companies, a.holdings]) === JSON.stringify([b.firm, b.funds, b.companies, b.holdings])
if (sets.some(s => !sameFirm(s, sets[0]))) {
  console.error('These sets record the firm differently; score them one at a time.')
  Deno.exit(1)
}
const set: MatchingSet = { ...sets[0], name: sets.map(s => s.name).join(' + '), documents: sets.flatMap(s => s.documents) }
const problems = problemsWith(set)
if (problems.length) {
  console.error(`The set in ${path} can't be scored:\n- ${problems.join('\n- ')}`)
  Deno.exit(1)
}
if (!Deno.env.get('ANTHROPIC_API_KEY')) {
  console.error('No ANTHROPIC_API_KEY: put it in supabase/functions/.env (never in a tracked file).')
  Deno.exit(1)
}

const runs = withSkeptic ? [false, true] : [false]
const estimate = runs.reduce((sum, skeptic) => sum + estimateCostUsd(set, skeptic), 0)
console.log(`Set "${set.name}": ${set.documents.length} documents. ${runs.length === 2 ? 'Two runs (judges alone, then with the Skeptic). ' : ''}Estimated cost: about $${estimate.toFixed(2)}.`)
if (!args.includes('--yes') && prompt('Spend it? Type yes to go on:') !== 'yes') {
  console.log('Nothing sent.')
  Deno.exit(0)
}

for (const skeptic of runs) {
  const result = await runEval(set, { skeptic, models })
  console.log(`\n${formatScore(result.label, result.score, result.costUsd)}`)
  const why = new Map(set.documents.map(d => [d.id, d]))
  for (const m of result.score.mistakes) {
    const doc = why.get(m.id)!
    console.log(`  ${m.id} ${doc.title.slice(0, 80)}`)
    if (m.extra.length) console.log(`    shown wrongly: ${m.extra.join(', ')}`)
    if (m.missed.length) console.log(`    missed: ${m.missed.join(', ')}${doc.why ? ` (marked because: ${doc.why})` : ''}`)
    if (m.possible.length) console.log(`    possible: ${m.possible.join(', ')}`)
  }
}
