// Scoring the matcher against hand-marked answers (system guide §17.1).
// Pure: no AI, no database, so the arithmetic is unit-tested.
//
// A match is a pair (document, entity). The entity is "firm", or
// "fund:<name>" / "company:<name>" (names compared case-insensitively).
// Precision: of what RegWay would show, how much is right. Recall: of what
// is right, how much RegWay would show.

export type Scope = 'firm' | 'fund' | 'company'

export interface EntityRef {
  scope: Scope
  name?: string | null
}

export const entityKey = (e: EntityRef): string => (e.scope === 'firm' ? 'firm' : `${e.scope}:${(e.name ?? '').trim().toLowerCase()}`)

export interface DocumentResult {
  id: string
  expected: EntityRef[]
  predicted: EntityRef[]
  // Shown as possible matches, each behind one yes/no question
  // (_shared/possibleMatch.ts); not counted in precision or recall.
  possible?: EntityRef[]
}

export interface Score {
  documents: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  // null when nothing was predicted (precision) or expected (recall).
  precision: number | null
  recall: number | null
  // Documents RegWay got exactly right (the same set of entities).
  exact: number
  // Possible matches: a missed match a question would bring back, and a
  // question about something that doesn't apply.
  possibleRight: number
  possibleWrong: number
  // Per document, what went wrong, for reading.
  mistakes: { id: string; extra: string[]; missed: string[]; possible: string[] }[]
}

export function score(results: DocumentResult[]): Score {
  let tp = 0
  let fp = 0
  let fn = 0
  let exact = 0
  let possibleRight = 0
  let possibleWrong = 0
  const mistakes: Score['mistakes'] = []
  for (const r of results) {
    const expected = new Set(r.expected.map(entityKey))
    const predicted = new Set(r.predicted.map(entityKey))
    const extra = [...predicted].filter(k => !expected.has(k))
    const missed = [...expected].filter(k => !predicted.has(k))
    const possible = [...new Set((r.possible ?? []).map(entityKey))].filter(k => !predicted.has(k))
    possibleRight += possible.filter(k => expected.has(k)).length
    possibleWrong += possible.filter(k => !expected.has(k)).length
    tp += predicted.size - extra.length
    fp += extra.length
    fn += missed.length
    if (extra.length === 0 && missed.length === 0) exact += 1
    if (extra.length || missed.length || possible.length) mistakes.push({ id: r.id, extra, missed, possible })
  }
  return {
    documents: results.length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    exact,
    possibleRight,
    possibleWrong,
    mistakes,
  }
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`)

export function formatScore(label: string, s: Score, costUsd: number): string {
  return `${label}: precision ${pct(s.precision)}, recall ${pct(s.recall)} (${s.truePositives} right, ${s.falsePositives} shown wrongly, ${s.falseNegatives} missed), ${s.exact} of ${s.documents} documents exactly right, $${costUsd.toFixed(3)}${s.possibleRight || s.possibleWrong ? `; possible matches: ${s.possibleRight} of the missed found by one question, ${s.possibleWrong} questions about something that doesn't apply` : ''}`
}
