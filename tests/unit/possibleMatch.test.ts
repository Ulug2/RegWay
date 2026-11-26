import { describe, expect, it } from 'vitest'
import { buildRelevanceRows, upsertRelevanceRows } from '../../supabase/functions/_shared/relevance'
import { POSSIBLE_PREFIX, POSSIBLE_RULE } from '../../supabase/functions/_shared/possibleMatch'
import { judgeRegulations } from '../../supabase/functions/_shared/regulatoryJudge'
import { judgeGeopolitical } from '../../supabase/functions/_shared/geopoliticalJudge'
import { companyFootprint, firmFootprint } from '../../supabase/functions/_shared/footprint'
import { score } from '../../scripts/eval/score'
import { fakeClient } from './helpers/fakeSupabase'
import { answerSchema } from './helpers/handler'
import { FIRM_ID, companies, firm, funds, promptText, stubModel } from './helpers/firm'

// A document that applies only if one unrecorded fact is true is saved as a
// possible match, with that fact as a question (_shared/possibleMatch.ts):
// before, it was a plain rejection nobody saw.

const candidates = [{ id: 'reg-itar' }]
const all = [{ id: 'co-aero', name: 'Aero Logistics' }]

describe('saving a possible match', () => {
  it('puts the question in front of what would apply, as not relevant', () => {
    const [row] = buildRelevanceRows([{ index: 0, relevant: false, reason: 'It would need export licences.', scope: 'company', entity_name: 'Aero Logistics', depends_on: ' Does Aero Logistics ship defense articles? ' }], candidates, FIRM_ID, [], all)
    expect(row).toMatchObject({ portfolio_company_id: 'co-aero', relevance_reason: `${POSSIBLE_PREFIX}Does Aero Logistics ship defense articles?\nIt would need export licences.` })
    expect(row.relevance_reason.startsWith('NOT_RELEVANT:')).toBe(true)
  })

  it('ignores a question on a match, and on an entity the firm does not have', () => {
    const rows = buildRelevanceRows(
      [
        { index: 0, relevant: true, reason: 'Ships defense articles.', scope: 'company', entity_name: 'Aero Logistics', depends_on: 'Does it?' },
        { index: 0, relevant: false, reason: 'Unknown.', scope: 'company', entity_name: 'Nobody Inc', depends_on: 'Does Nobody ship?' },
        { index: 0, relevant: false, reason: 'No link.', scope: 'firm', entity_name: null, depends_on: '' },
      ],
      candidates, FIRM_ID, [], all,
    )
    expect(rows.map(r => r.relevance_reason)).toEqual(['Ships defense articles.', 'NOT_RELEVANT: Unknown.', 'NOT_RELEVANT: No link.'])
  })

  it('keeps a match over a possible match, and a possible match over a rejection, for the same row', async () => {
    const db = fakeClient()
    const row = (relevance_reason: string) => ({ regulation_id: 'reg-itar', firm_id: FIRM_ID, fund_id: null, portfolio_company_id: 'co-aero', relevance_reason })
    await upsertRelevanceRows(db as never, [row('NOT_RELEVANT: No.'), row(`${POSSIBLE_PREFIX}Q?\nR.`), row('NOT_RELEVANT: No again.')])
    await upsertRelevanceRows(db as never, [row(`${POSSIBLE_PREFIX}Q?\nR.`), row('Applies.')])
    const [first, second] = db.ran('regulation_relevance', 'upsert').map(u => (u.payload as { relevance_reason: string }[]).map(r => r.relevance_reason))
    expect(first).toEqual([`${POSSIBLE_PREFIX}Q?\nR.`])
    expect(second).toEqual(['Applies.'])
  })
})

describe('the judges', () => {
  it('are told when to ask, and given a field for the question', async () => {
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await judgeRegulations(fakeClient() as never, { firmId: FIRM_ID, entities: { firm, funds, companies } as never, candidates: [{ id: 'r0', title: 'ITAR amendments', agency: 'State Department', jurisdiction: 'Federal', summary: null }], functionName: 'match-relevance' })
    await judgeGeopolitical(fakeClient() as never, { firmId: FIRM_ID, firmName: firm.name, companies: companies as never, footprints: [firmFootprint(firm as never), ...companies.map(c => companyFootprint(c as never))], candidates: [{ id: 'g0', title: 'Tariff', agency: 'USTR', summary: null, countries: ['Italy'], published_date: null }], functionName: 'match-geopolitical-relevance' })
    for (const call of model) {
      expect(promptText(call)).toContain(POSSIBLE_RULE)
      expect(answerSchema(call.body).properties.verdicts.items.properties).toHaveProperty('depends_on')
    }
  })
})

describe('scoring possible matches', () => {
  it('counts a missed match a question would find, and a question about nothing, apart from precision and recall', () => {
    const s = score([
      { id: 'd1', expected: [{ scope: 'company', name: 'Aero' }], predicted: [], possible: [{ scope: 'company', name: 'aero' }] },
      { id: 'd2', expected: [], predicted: [], possible: [{ scope: 'firm' }] },
      { id: 'd3', expected: [{ scope: 'firm' }], predicted: [{ scope: 'firm' }], possible: [{ scope: 'firm' }] },
    ])
    expect(s).toMatchObject({ truePositives: 1, falseNegatives: 1, falsePositives: 0, possibleRight: 1, possibleWrong: 1, exact: 2 })
    expect(s.mistakes.map(m => m.id)).toEqual(['d1', 'd2'])
  })
})
