import { describe, expect, it } from 'vitest'
import { judgeRegulations } from '../../supabase/functions/_shared/regulatoryJudge.ts'
import { judgeGeopolitical } from '../../supabase/functions/_shared/geopoliticalJudge.ts'
import { companyFootprint, firmFootprint } from '../../supabase/functions/_shared/footprint.ts'
import { otherFacts } from '../../supabase/functions/_shared/entityFacts.ts'
import { fakeClient, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, companies, firm, firmQueries, funds, promptText, stubModel } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// The matchers read "Other facts" (owner, 2026-11-25): a member's own words
// about an entity, recorded in Profile or learned from a chat and
// confirmed, so a confirmed "does not import batteries" is weighed before
// a battery rule is matched, not only by the Skeptic afterwards. The
// regulatory and enforcement judges read them with every other fact
// (entityList); the geopolitical judge with each footprint.

const withNotes = {
  firm: { ...firm, profile: { ...firm.profile, notes: ['Has no UK employees'] } },
  funds: [{ ...funds[0], profile: { ...funds[0].profile, notes: ['Closed to new investors'] } }],
  companies: [{ ...companies[0], profile: { notes: ['Does not import batteries', 'Sells only to hospitals'] } }, companies[1]],
}

describe('other facts in the matchers', () => {
  it('are quoted, and give nothing when there are none', () => {
    expect(otherFacts({ notes: ['Does not import batteries', ' ', 'Sells only to hospitals'] })).toBe('other facts: "Does not import batteries"; "Sells only to hospitals"')
    expect(otherFacts({ notes: [] })).toBe('')
    expect(otherFacts(null)).toBe('')
  })

  it('reach the regulatory judge for the firm, a fund and a company', async () => {
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await judgeRegulations(fakeClient() as never, {
      firmId: FIRM_ID,
      entities: withNotes as never,
      candidates: [{ id: 'r0', title: 'Battery import rule', agency: 'Trade Representative', jurisdiction: 'Federal', summary: 'Tariffs on batteries.' }],
      functionName: 'match-relevance',
    })
    const text = promptText(model[0])
    expect(text).toMatch(/Firm: H\.I\.G\. Capital: [^\n]*notes: "Has no UK employees"/)
    expect(text).toMatch(/- Fund I: [^\n]*notes: "Closed to new investors"/)
    expect(text).toMatch(/- GetixHealth: [^\n]*notes: "Does not import batteries", "Sells only to hospitals"/)
  })

  it('reach the geopolitical judge with each footprint', async () => {
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await judgeGeopolitical(fakeClient() as never, {
      firmId: FIRM_ID,
      firmName: firm.name,
      companies: withNotes.companies as never,
      footprints: [firmFootprint(withNotes.firm as never), ...withNotes.companies.map(c => companyFootprint(c as never))],
      candidates: [{ id: 'g0', title: 'Tariff on batteries from China', agency: 'Trade Representative', summary: 'A tariff.', countries: ['China'], published_date: '2026-11-01' }],
      functionName: 'match-geopolitical-relevance',
    })
    const text = promptText(model[0])
    expect(text).toMatch(/- H\.I\.G\. Capital \(firm\):.*other facts: "Has no UK employees"/)
    expect(text).toMatch(/- GetixHealth \(company\):.*other facts: "Does not import batteries"; "Sells only to hospitals"/)
  })

  it('reach the enforcement judge', async () => {
    const db = fakeClient((q: Query) => {
      if (q.table === 'firms') return { data: withNotes.firm }
      if (q.table === 'funds') return { data: withNotes.funds }
      if (q.table === 'portfolio_companies' && q.op === 'select') return { data: withNotes.companies }
      const shared = firmQueries(q)
      if (shared) return shared
      if (q.table === 'unjudged_regulations') return { data: [] }
      if (q.table === 'regulations') return { data: [{ id: 'e0', title: 'SEC Charges Battery Importer', agency: 'Securities and Exchange Commission', jurisdiction: 'Federal', summary: 'Customs fraud.', raw: null }] }
      if (q.table === 'regulation_relevance' && q.op === 'select') return { data: [] }
    })
    setClient(db)
    const { handler, background } = await loadHandler('match-enforcement-relevance')
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await handler(post('match-enforcement-relevance', { token: SERVICE_KEY, body: { firmId: FIRM_ID } }))
    await Promise.all(background)
    const text = promptText(model[0])
    expect(text).toContain('notes: "Has no UK employees"')
    expect(text).toContain('notes: "Closed to new investors"')
    expect(text).toContain('notes: "Does not import batteries", "Sells only to hospitals"')
  })
})
