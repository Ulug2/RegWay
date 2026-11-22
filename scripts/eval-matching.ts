// pnpm eval:matching [set.json] [--skeptic] [--yes]
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
const path = args.find(a => !a.startsWith('--')) ?? 'tests/eval/matching-set.json'
const withSkeptic = args.includes('--skeptic')

const set = JSON.parse(await Deno.readTextFile(path)) as MatchingSet
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
  const result = await runEval(set, { skeptic })
  console.log(`\n${formatScore(result.label, result.score, result.costUsd)}`)
  const why = new Map(set.documents.map(d => [d.id, d]))
  for (const m of result.score.mistakes) {
    const doc = why.get(m.id)!
    console.log(`  ${m.id} ${doc.title.slice(0, 80)}`)
    if (m.extra.length) console.log(`    shown wrongly: ${m.extra.join(', ')}`)
    if (m.missed.length) console.log(`    missed: ${m.missed.join(', ')}${doc.why ? ` (marked because: ${doc.why})` : ''}`)
  }
}
