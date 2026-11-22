import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { score, entityKey, formatScore } from '../../scripts/eval/score'
import { estimateCostUsd, problemsWith, type MatchingSet } from '../../scripts/eval/matchingSet'
import { runEval } from '../../scripts/eval/run'
import { stubModel } from './helpers/firm'

// The matching test set's scoring (system guide §17.1). The AI is stubbed;
// only the owner runs the set against the real one (pnpm eval:matching).

const EXAMPLE = JSON.parse(readFileSync(path.resolve(__dirname, '../eval/matching-set.json'), 'utf8')) as MatchingSet

describe('scoring', () => {
  it('counts pairs of document and entity: right, shown wrongly, missed', () => {
    const s = score([
      { id: 'a', expected: [{ scope: 'firm' }], predicted: [{ scope: 'firm' }] },
      { id: 'b', expected: [{ scope: 'company', name: 'GetixHealth' }], predicted: [{ scope: 'company', name: 'getixhealth ' }, { scope: 'firm' }] },
      { id: 'c', expected: [{ scope: 'company', name: 'Aero' }], predicted: [] },
      { id: 'd', expected: [], predicted: [] },
    ])
    expect(s).toMatchObject({ documents: 4, truePositives: 2, falsePositives: 1, falseNegatives: 1, exact: 2 })
    expect(s.precision).toBeCloseTo(2 / 3)
    expect(s.recall).toBeCloseTo(2 / 3)
    expect(s.mistakes).toEqual([
      { id: 'b', extra: ['firm'], missed: [] },
      { id: 'c', extra: [], missed: ['company:aero'] },
    ])
  })

  it('says n/a rather than dividing by nothing', () => {
    const s = score([{ id: 'a', expected: [], predicted: [] }])
    expect(s.precision).toBeNull()
    expect(s.recall).toBeNull()
    expect(formatScore('judges alone', s, 0)).toBe('judges alone: precision n/a, recall n/a (0 right, 0 shown wrongly, 0 missed), 1 of 1 documents exactly right, $0.000')
  })

  it('treats a firm-level match the same whatever name comes with it', () => {
    expect(entityKey({ scope: 'firm', name: 'Harbor Capital' })).toBe('firm')
  })
})

describe('the set', () => {
  it('the example in the repository is well formed', () => {
    expect(problemsWith(EXAMPLE)).toEqual([])
  })

  it('names what would make a score meaningless', () => {
    const broken: MatchingSet = {
      ...EXAMPLE,
      documents: [
        { ...EXAMPLE.documents[0], id: 'x', expected: [{ scope: 'company', name: 'Nobody' }] },
        { ...EXAMPLE.documents[0], id: 'x', expected: [{ scope: 'fund', name: 'Harbor Fund I' }] },
        { ...EXAMPLE.documents[3], id: 'y', expected: [{ scope: 'fund', name: 'Harbor Fund I' }] },
        { ...EXAMPLE.documents[0], id: 'z', expected: undefined as never },
      ],
    }
    expect(problemsWith(broken)).toEqual([
      'x: no company named "Nobody"',
      'x: id used twice',
      'y: geopolitical matches stand on the firm or a company, never a fund',
      'z: no expected answer (use [] for "not relevant")',
    ])
  })

  it('estimates the cost before anything is sent', () => {
    // 3 regulatory documents (one batch on Haiku) and 1 geopolitical (one on Sonnet).
    expect(estimateCostUsd(EXAMPLE, false)).toBeCloseTo(0.2)
    expect(estimateCostUsd(EXAMPLE, true)).toBeCloseTo(0.21)
  })
})

describe('a run, with the AI stubbed', () => {
  it("sends the set through RegWay's own judges and scores what comes back, with its cost", async () => {
    // The regulatory judge: Form PF to the firm, the Medicare rule to the
    // firm (wrong), the truck rule to no one. The geopolitical judge: the
    // tariff to Aero Logistics.
    const replies = [
      { verdicts: [{ index: 0, relevant: true, reason: 'Adviser.', scope: 'firm' }, { index: 1, relevant: true, reason: 'Health.', scope: 'firm' }, { index: 2, relevant: false, reason: 'No trucks.', scope: 'firm' }] },
      { verdicts: [{ index: 0, relevant: true, reason: 'Makes parts in Italy.', scope: 'company', entity_name: 'Aero Logistics' }] },
    ]
    let call = 0
    const { model: calls } = stubModel({
      submit_verdicts: () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'submit_verdicts', input: replies[call++] }], usage: { input_tokens: 1_000_000, output_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    const result = await runEval(EXAMPLE, { skeptic: false })
    expect(calls.map(c => c.body.model)).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-5'])
    expect(result.score).toMatchObject({ truePositives: 2, falsePositives: 1, falseNegatives: 1, exact: 3 })
    expect(result.score.mistakes).toEqual([{ id: 'ex-medicare', extra: ['firm'], missed: ['company:getixhealth'] }])
    // A million input tokens on Haiku ($1) and on Sonnet ($3).
    expect(result.costUsd).toBeCloseTo(4)
  })
})
