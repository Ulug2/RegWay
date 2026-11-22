import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { judgeRegulations } from '../../supabase/functions/_shared/regulatoryJudge.ts'
import { judgeGeopolitical } from '../../supabase/functions/_shared/geopoliticalJudge.ts'
import { companyFootprint, firmFootprint } from '../../supabase/functions/_shared/footprint.ts'
import { reviewAnswer, reviewVerdicts } from '../../supabase/functions/_shared/roles/skeptic.ts'
import { firmRecord } from '../../supabase/functions/_shared/roles/entityContext.ts'
import { findApplicabilityClaims } from '../../supabase/functions/_shared/roles/claimGate.ts'
import { checkCitations } from '../../supabase/functions/_shared/roles/citationCheck.ts'
import { matchAnnouncement, type Version } from '../../supabase/functions/_shared/duplicates.ts'
import { generateImpact } from '../../supabase/functions/_shared/impact.ts'
import { research } from '../../supabase/functions/research-firm/research.ts'
import { systemPrompt } from '../../supabase/functions/regway-ai-chat/prompt.ts'
import { fakeClient, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, companies, firm, firmQueries, funds, stubModel, type ModelCall } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// Every prompt RegWay sends the AI, written out in tests/unit/prompts/ (one
// file per job) and compared on every run (Sidekick §17.1). A prompt that
// changes without its file changing fails here, so no wording, tool schema,
// model or temperature changes by accident. For an intended change, rerun
// with `pnpm vitest run tests/unit/promptSnapshots.test.ts -u` and commit
// the updated files with the change: the diff shows exactly what the AI is
// now told.
//
// Not covered: the SEC administrative-proceedings extraction (it reads a PDF;
// no test drives it yet).

const DIR = './prompts'

// The parts of a request that decide what the AI is asked.
function asked(call: ModelCall): string {
  const { model, temperature, max_tokens, system, tools, tool_choice, messages } = call.body
  return `${JSON.stringify({ model, temperature, max_tokens, tool_choice, system, tools, messages }, null, 2)}\n`
}

// Prompts carry today's date in places; fix it.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
})
afterAll(() => vi.useRealTimers())

const entities = { firm, funds, companies }
const usage = (functionName: string) => ({ admin: fakeClient() as never, functionName, firmId: FIRM_ID })

describe('prompts sent to the AI', () => {
  it('the regulatory judge', async () => {
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await judgeRegulations(fakeClient() as never, {
      firmId: FIRM_ID,
      entities,
      candidates: [{ id: 'r0', title: 'Form PF; Reporting Requirements for Private Fund Advisers', agency: 'Securities and Exchange Commission', jurisdiction: 'SEC · Federal', summary: 'Amends Form PF.' }],
      functionName: 'match-relevance',
    })
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/regulatory-judge.json`)
  })

  it('the regulatory judge on a re-check with a note', async () => {
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await judgeRegulations(fakeClient() as never, {
      firmId: FIRM_ID,
      entities,
      candidates: [{ id: 'r0', title: 'Battery import rule', agency: 'Trade Representative', jurisdiction: 'Federal', summary: 'Tariffs on batteries.' }],
      functionName: 'rematch-regulation',
      correction: 'We do not import batteries.',
    })
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/regulatory-judge-recheck.json`)
  })

  it('the geopolitical judge', async () => {
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await judgeGeopolitical(fakeClient() as never, {
      firmId: FIRM_ID,
      firmName: firm.name,
      companies: companies as never,
      footprints: [firmFootprint(firm as never), ...companies.map(c => companyFootprint(c as never))],
      candidates: [{ id: 'g0', title: 'Section 232 Tariff on Aircraft Parts From Italy', agency: 'Trade Representative', summary: 'A tariff.', countries: ['Italy'], published_date: '2026-11-01' }],
      functionName: 'match-geopolitical-relevance',
    })
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/geopolitical-judge.json`)
  })

  it('the enforcement judge', async () => {
    const db = fakeClient((q: Query) => {
      const shared = firmQueries(q)
      if (shared) return shared
      if (q.table === 'unjudged_regulations') return { data: [] }
      if (q.table === 'regulations') return { data: [{ id: 'e0', title: 'SEC Charges Private Fund Adviser Over Fee Disclosures', agency: 'Securities and Exchange Commission', jurisdiction: 'Federal', summary: 'Undisclosed monitoring fees.', raw: null }] }
      if (q.table === 'regulation_relevance' && q.op === 'select') return { data: [] }
    })
    setClient(db)
    const { handler, background } = await loadHandler('match-enforcement-relevance')
    const { model } = stubModel({ submit_verdicts: { verdicts: [] } })
    await handler(post('match-enforcement-relevance', { token: SERVICE_KEY, body: { firmId: FIRM_ID } }))
    await Promise.all(background)
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/enforcement-judge.json`)
  })

  it('the Skeptic reviewing matches', async () => {
    const { model } = stubModel({ submit_reviews: { reviews: [] } })
    await reviewVerdicts(
      {
        record: firmRecord(entities, [{ fund_id: 'fund-1', portfolio_company_id: 'co-getix' }]),
        category: 'regulatory',
        items: [{ index: 0, document: { title: 'Medicare revenue cycle rule', issuer: 'CMS', jurisdiction: 'Federal', summary: 'Billing changes.' }, scope: 'company', entity_name: 'GetixHealth', reason: 'GetixHealth does revenue cycle management.' }],
      },
      usage('match-relevance/skeptic'),
    ).catch(() => {}) // the stub's empty answer is refused; the request is what counts
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/skeptic-matches.json`)
  })

  it('the Skeptic reviewing a chat answer', async () => {
    const { model } = stubModel({ submit_claim_reviews: { reviews: [] }, submit_reviews: { reviews: [] } })
    await reviewAnswer(
      {
        record: firmRecord(entities),
        matched: '- Form PF amendments (matched to the firm)',
        claims: [{ claim: 'Form PF amendments apply to H.I.G. Capital.', kind: 'applies', scope: 'firm', entity_name: null }],
      },
      usage('regway-ai-chat/skeptic'),
    ).catch(() => {})
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/skeptic-answer.json`)
  })

  it('the claim gate', async () => {
    const { model } = stubModel({ submit_claims: { claims: [] } })
    await findApplicabilityClaims({ question: 'Does Form PF apply to us?', answer: 'Yes: Form PF applies to H.I.G. Capital as an SEC-registered adviser.', firmName: firm.name, funds: ['Fund I'], companies: ['GetixHealth'] }, usage('regway-ai-chat/claims'))
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/claim-gate.json`)
  })

  it('the citation check', async () => {
    const { model } = stubModel({ submit_citation_checks: { findings: [] } })
    await checkCitations(
      { claims: ['Form PF amendments are final.'], citations: [{ url: 'https://www.federalregister.gov/d/2026-1', title: 'Form PF', cited_text: 'The Commission is proposing amendments to Form PF.' }] },
      usage('regway-ai-chat/citations'),
    ).catch(() => {})
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/citation-check.json`)
  })

  it('matching an announcement to its document', async () => {
    const version = (id: string, over: Partial<Version>): Version => ({ id, source: 'federal_register', title: id, agency: 'Securities and Exchange Commission', summary: null, published_date: '2026-11-20', source_url: `https://example.test/${id}`, duplicate_of: null, created_at: '2026-11-20T12:00:00Z', ...over })
    const { model } = stubModel({ text: { content: [{ type: 'text', text: 'none' }], usage: {} }, submit_match: { index: null } })
    await matchAnnouncement(
      fakeClient() as never,
      version('doc', { title: 'Adviser Custody Rules', summary: 'Proposed custody rules.' }),
      [version('news', { source: 'sec_news', title: 'SEC Proposal Would Address How Advisers Can Custody Crypto Assets', published_date: '2026-11-15' })],
      new Map([['news', 'The SEC proposed custody rules for crypto assets.']]),
    )
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/announcement-match.json`)
  })

  it.each(['regulatory', 'enforcement', 'geopolitical'])('the %s analysis', async category => {
    const db = fakeClient((q: Query) => {
      const shared = firmQueries(q)
      if (shared) return shared
      if (q.table === 'regulation_impacts') return { data: null }
      if (q.table === 'regulations') return { data: { id: 'reg-1', source: 'sec_news', title: 'A development', agency: 'Securities and Exchange Commission', jurisdiction: 'Federal', summary: 'What it does.', published_date: '2026-11-20', effective_date: null, source_url: 'https://example.test/reg-1', raw: { narrative_text: 'The full text of the development.' }, category, on_public_inspection: false } }
      if (q.table === 'regulation_relevance') return { data: [{ fund_id: null, portfolio_company_id: 'co-getix', relevance_reason: 'GetixHealth bills Medicare.' }] }
      if (q.table === 'fund_holdings') return { data: [{ fund_id: 'fund-1', portfolio_company_id: 'co-getix' }] }
    })
    const { model } = stubModel({ submit_impact_analysis: { overview: '', scope: '', status: '', key_provisions: [], key_dates: [], impacts: [], considerations: [], limitations: '' } })
    await generateImpact(db as never, 'reg-1', FIRM_ID)
    await expect(asked(model[0])).toMatchFileSnapshot(`${DIR}/analysis-${category}.json`)
  })

  it('the company scan: search, then extraction', async () => {
    const company = { id: 'co-getix', name: 'GetixHealth', sectors: ['Healthcare'], regions: ['United States'], hq_location: 'Houston, Texas', firm_id: FIRM_ID, website: 'https://getixhealth.test', offerings: 'Revenue cycle management', profile: {} }
    setClient(
      fakeClient((q: Query) => {
        if (q.table === 'portfolio_companies' && q.op === 'select') return { data: company }
        if (q.table === 'check_rate_limit') return { data: true }
        if (q.table === 'regulation_relevance' && q.op === 'select') return { data: [] }
      }),
    )
    const { handler, background } = await loadHandler('company-regulations')
    const { model } = stubModel({ text: { content: [{ type: 'text', text: 'Found nothing new.' }], usage: {} }, submit_regulations: { regulations: [] } })
    await handler(post('company-regulations', { token: 'user-jwt', body: { companyId: company.id } }))
    await Promise.all(background)
    expect(model.length).toBeGreaterThanOrEqual(1)
    for (const [i, call] of model.entries()) await expect(asked(call)).toMatchFileSnapshot(`${DIR}/company-scan-${i + 1}.json`)
  })

  it('firm research: search, then extraction', async () => {
    const { model } = stubModel({
      text: { content: [{ type: 'text', text: 'H.I.G. Capital is an SEC-registered adviser.' }], usage: {} },
      submit_findings: { identity: { official_site: '', confident: false, reason: 'Nothing read.' }, findings: [], new_entities: [] },
    })
    await research(
      { firm: { id: FIRM_ID, name: 'H.I.G. Capital', website: null, hq_location: 'Miami, Florida', profile: {} }, funds: [{ id: 'fund-1', name: 'Fund I', structure: 'Delaware LP', size: null, profile: {} }], companies: [{ id: 'co-getix', name: 'GetixHealth', website: null, hq_location: 'Houston, Texas', profile: {} }] } as never,
      step => usage(`research-firm:${step}`),
    )
    expect(model.length).toBeGreaterThanOrEqual(1)
    for (const [i, call] of model.entries()) await expect(asked(call)).toMatchFileSnapshot(`${DIR}/firm-research-${i + 1}.json`)
  })

  it("the chat's instructions", async () => {
    const text = systemPrompt({
      firm: { name: firm.name, hq_location: firm.hq_location, jurisdictions: firm.jurisdictions, profile: firm.profile } as never,
      funds: funds as never,
      companies: companies as never,
      holdings: [{ fund_id: 'fund-1', portfolio_company_id: 'co-getix' }],
      matched: { text: '- Form PF amendments (matched to the firm)', count: 1, shown: 1 },
      scope: { type: 'firm' },
    })
    await expect(`${text}\n`).toMatchFileSnapshot(`${DIR}/chat-system.txt`)
  })
})
