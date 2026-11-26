// pnpm eval:mark <command> <set.json> [--effort high|xhigh|max] [--docs N] [--yes]
//
// Marks the right answers of a test set built by eval-build-set.ts with
// Claude Fable 5.2 (scripts/eval/markSet.ts; owner, 2026-11-25). CALLS THE
// REAL AI and spends money, on the key in supabase/functions/.env: the
// same credit as production. Commands:
//
//   estimate   counts the input tokens (free) and prints the likely cost
//   pilot      marks the first --docs N unmarked documents now (default 5)
//              and prints what they cost, and what the rest would
//   submit     sends every unmarked document to Anthropic's batch service
//              (half price; most batches finish within an hour, at most
//              24): asks first unless --yes
//   collect    once the batch has ended, writes its answers into the set
//   compare    free: the answers against what RegWay said in production
//
// Answers that fail the checks (an entity the firm doesn't have, a fund on
// a geopolitical item) stay unmarked; run pilot or submit again for them.

import { MARKER_MODEL, costUsd, groups, markRequest, vetMarks, type Effort, type Mark, type Usage } from './eval/markSet.ts'
import type { MatchingSet, SetDocument } from './eval/matchingSet.ts'
import { entityKey } from './eval/score.ts'

const API = 'https://api.anthropic.com/v1'
const [command, path] = Deno.args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a) && !['high', 'xhigh', 'max'].includes(a))
const flag = (name: string, fallback: string) => {
  const i = Deno.args.indexOf(`--${name}`)
  return i >= 0 ? Deno.args[i + 1] : fallback
}
const effort = flag('effort', 'xhigh') as Effort
const yes = Deno.args.includes('--yes')
if (!command || !path) {
  console.error('Usage: pnpm eval:mark <estimate|pilot|submit|collect|compare> <set.json> [--effort xhigh] [--docs 5] [--yes]')
  Deno.exit(1)
}

const set = JSON.parse(await Deno.readTextFile(path)) as MatchingSet & { marking?: { model: string; effort: string; cost_usd: number } }
const batchFile = path.replace(/\.json$/, '.batch.json')
const save = () => Deno.writeTextFile(path, JSON.stringify(set, null, 2) + '\n')

const key = Deno.env.get('ANTHROPIC_API_KEY')
const headers = () => {
  if (!key) {
    console.error('No ANTHROPIC_API_KEY: put it in supabase/functions/.env (never in a tracked file).')
    Deno.exit(1)
  }
  return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
}

async function api(method: string, url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text.slice(0, 800)}`)
  return JSON.parse(text)
}

function answerOf(message: Record<string, unknown>): unknown {
  if (message.stop_reason === 'refusal') throw new Error('the model declined')
  if (message.stop_reason === 'max_tokens') throw new Error('the answer was cut off (max_tokens)')
  const blocks = (message.content ?? []) as { type: string; text?: string }[]
  const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('')
  return JSON.parse(text)
}

function apply(marks: Mark[]) {
  const stamp = `${MARKER_MODEL} (${effort}), ${new Date().toISOString().slice(0, 10)}`
  for (const m of marks) {
    const d = set.documents.find(x => x.id === m.id)!
    d.expected = m.expected
    d.why = m.why
    d.confidence = m.confidence
    d.marked_by = stamp
  }
}

function addCost(dollars: number) {
  set.marking = { model: MARKER_MODEL, effort, cost_usd: Math.round(((set.marking?.cost_usd ?? 0) + dollars) * 1000) / 1000 }
}

const unmarked = () => set.documents.filter(d => !Array.isArray(d.expected)).length

if (command === 'estimate') {
  let input = 0
  let docs = 0
  const all = groups(set)
  for (const g of all) {
    const { model, system, messages } = markRequest(set, g, effort)
    const counted = await api('POST', '/messages/count_tokens', { model, system, messages })
    input += Number(counted.input_tokens)
    docs += g.length
  }
  // Thinking at extra-high effort is most of the cost and can't be counted
  // ahead: a range per document, to be replaced by a pilot's measurement.
  const perDoc: Record<Effort, [number, number]> = { high: [1000, 4000], xhigh: [2000, 7000], max: [4000, 14000] }
  const [low, high] = perDoc[effort].map(n => n * docs)
  const range = (batch: boolean) => `$${costUsd({ input_tokens: input, output_tokens: low }, batch).toFixed(2)}–$${costUsd({ input_tokens: input, output_tokens: high }, batch).toFixed(2)}`
  console.log(`${docs} unmarked documents in ${all.length} requests; ${input.toLocaleString()} input tokens (counted, free).`)
  console.log(`At ${effort} effort: batch ${range(true)}, direct ${range(false)}. A pilot measures the real figure.`)
} else if (command === 'pilot') {
  const n = Number(flag('docs', '5'))
  let picked: SetDocument[] = []
  for (const g of groups(set)) if (picked.length < n) picked = [...picked, ...g.slice(0, n - picked.length)]
  const pilotGroups = groups({ ...set, documents: picked } as MatchingSet)
  let spent = 0
  let marked = 0
  let output = 0
  for (const g of pilotGroups) {
    const started = Date.now()
    const message = await api('POST', '/messages', markRequest(set, g, effort))
    const usage = message.usage as Usage
    const dollars = costUsd(usage, false)
    spent += dollars
    output += usage.output_tokens ?? 0
    const { marks, problems } = vetMarks(set, g, answerOf(message) as never)
    apply(marks)
    marked += marks.length
    addCost(dollars)
    await save()
    console.log(`${g.length} documents in ${Math.round((Date.now() - started) / 1000)} s: $${dollars.toFixed(3)} (${usage.output_tokens} output tokens).${problems.length ? ` Problems: ${problems.join('; ')}` : ''}`)
  }
  const perDoc = spent / Math.max(1, picked.length)
  console.log(`Pilot: ${marked} of ${picked.length} marked for $${spent.toFixed(2)} ($${perDoc.toFixed(3)} a document, ${Math.round(output / picked.length)} output tokens each).`)
  console.log(`The other ${unmarked()}: about $${(perDoc * unmarked()).toFixed(2)} direct, $${((perDoc * unmarked()) / 2).toFixed(2)} by batch.`)
} else if (command === 'submit') {
  const all = groups(set)
  if (!all.length) {
    console.log('Every document is marked.')
    Deno.exit(0)
  }
  const docs = all.reduce((n, g) => n + g.length, 0)
  console.log(`${docs} documents in ${all.length} requests to ${MARKER_MODEL} at ${effort} effort, by batch (half price). Run "estimate" or "pilot" first for the cost.`)
  if (!yes && prompt('Send them? Type yes to go on:') !== 'yes') {
    console.log('Nothing sent.')
    Deno.exit(0)
  }
  const requests = all.map((g, i) => ({ custom_id: `g${i}`, params: markRequest(set, g, effort) }))
  const batch = await api('POST', '/messages/batches', { requests })
  await Deno.writeTextFile(batchFile, JSON.stringify({ batch_id: batch.id, effort, submitted_at: new Date().toISOString(), groups: Object.fromEntries(all.map((g, i) => [`g${i}`, g.map(d => d.id)])) }, null, 2) + '\n')
  console.log(`Sent: batch ${batch.id}. Run "collect" in a while (most finish within an hour).`)
} else if (command === 'collect') {
  const sent = JSON.parse(await Deno.readTextFile(batchFile)) as { batch_id: string; effort: Effort; groups: Record<string, string[]> }
  const batch = await api('GET', `/messages/batches/${sent.batch_id}`)
  if (batch.processing_status !== 'ended') {
    console.log(`Batch ${sent.batch_id}: ${batch.processing_status}, ${JSON.stringify(batch.request_counts)}. Try again later.`)
    Deno.exit(0)
  }
  const res = await fetch(String(batch.results_url), { headers: headers() })
  if (!res.ok) throw new Error(`results: ${res.status} ${await res.text()}`)
  let spent = 0
  let marked = 0
  const failed: string[] = []
  for (const line of (await res.text()).split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as { custom_id: string; result: { type: string; message?: Record<string, unknown>; error?: unknown } }
    const docs = sent.groups[r.custom_id].map(id => set.documents.find(d => d.id === id)!).filter(Boolean)
    if (r.result.type !== 'succeeded' || !r.result.message) {
      failed.push(`${r.custom_id}: ${r.result.type} ${JSON.stringify(r.result.error ?? '').slice(0, 200)}`)
      continue
    }
    spent += costUsd(r.result.message.usage as Usage, true)
    try {
      const { marks, problems } = vetMarks(set, docs, answerOf(r.result.message) as never)
      apply(marks)
      marked += marks.length
      if (problems.length) failed.push(...problems)
    } catch (err) {
      failed.push(`${r.custom_id}: ${(err as Error).message}`)
    }
  }
  addCost(spent)
  await save()
  console.log(`Marked ${marked} documents for $${spent.toFixed(2)}. ${unmarked()} still unmarked.`)
  for (const f of failed) console.log(`  - ${f}`)
} else if (command === 'compare') {
  // Free: how production's answers compare with the marks, by kind.
  const marked = set.documents.filter(d => Array.isArray(d.expected))
  const same = (d: SetDocument) => {
    const prod = d.regway?.verdict === 'matched' ? d.regway.entities.map(entityKey).sort() : []
    const right = (d.expected ?? []).map(entityKey).sort()
    return prod.join('|') === right.join('|')
  }
  console.log(`${marked.length} of ${set.documents.length} marked${set.marking ? ` (${set.marking.model}, ${set.marking.effort}, $${set.marking.cost_usd})` : ''}.`)
  for (const verdict of ['matched', 'skeptic_rejected', 'rejected', 'unjudged']) {
    const docs = marked.filter(d => d.regway?.verdict === verdict)
    if (!docs.length) continue
    console.log(`  ${verdict}: ${docs.filter(same).length} of ${docs.length} as production said`)
  }
  for (const d of marked.filter(d => !same(d))) {
    const prod = d.regway?.verdict === 'matched' ? d.regway.entities.map(entityKey).join(', ') : 'nothing'
    console.log(`\n- ${d.title?.slice(0, 110)}\n  production: ${prod} (${d.regway?.verdict}); marked: ${(d.expected ?? []).map(entityKey).join(', ') || 'nothing'} (${d.confidence})\n  ${d.why}`)
  }
} else {
  console.error(`Unknown command "${command}".`)
  Deno.exit(1)
}
