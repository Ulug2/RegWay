import { afterEach, describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, promptText, stubModel, type FirmState } from './helpers/firm'
import { loadHandler, post } from './helpers/handler'
import { setEnv } from './helpers/setup'

const REG = 'reg-1'
const ANALYSIS = { overview: 'An overview.', scope: '', status: '', key_provisions: [], key_dates: [], impacts: [], considerations: [], limitations: '' }
const TEXT = 'The agency is amending its regulations. '.repeat(30)

const regulation = (over: Record<string, unknown> = {}) => ({
  id: REG,
  title: 'Medicare payment update',
  agency: 'CMS',
  summary: 'Updates outpatient rates.',
  countries: [],
  published_date: '2026-10-01',
  category: 'regulatory',
  jurisdiction: 'CMS · Federal',
  // What the analysis regeneration reads, on top of the above.
  source: 'ai_search',
  source_url: 'https://www.cms.test/rule',
  raw: null,
  effective_date: null,
  on_public_inspection: false,
  ...over,
})

interface State extends FirmState {
  regulation?: Record<string, unknown> | null
  // The firm's current verdict rows on this regulation.
  existing?: { id: string; fund_id: string | null; portfolio_company_id: string | null }[]
  // What the Skeptic answers, when SKEPTIC_MODE is on.
  reviews?: unknown[]
}

async function recheck(state: State, verdicts: unknown[], body: Record<string, unknown> = { regulationId: REG }) {
  const db = fakeClient((q: Query) => {
    const shared = firmQueries(q, state)
    if (shared) return shared
    if (q.table === 'regulations') return { data: state.regulation === undefined ? regulation() : state.regulation }
    if (q.table === 'regulation_relevance' && q.op === 'select') {
      // replaceRegulationVerdicts asks for the rows it may delete.
      if (q.columns === 'id, fund_id, portfolio_company_id') return { data: state.existing ?? [] }
      return { data: [] }
    }
    if (q.table === 'fund_holdings') return { data: [] }
  })
  setClient(db)
  const { handler } = await loadHandler('rematch-regulation')
  const net = stubModel({ submit_verdicts: { verdicts }, submit_impact_analysis: ANALYSIS, submit_reviews: { reviews: state.reviews ?? [] } }, url => (url.hostname === 'www.cms.test' ? new Response(TEXT) : undefined))
  const res = await handler(post('rematch-regulation', { token: 'user-jwt', body }))
  return { res, db, ...net, verdictCalls: net.model.filter(m => m.tool === 'submit_verdicts'), analysisCalls: net.model.filter(m => m.tool === 'submit_impact_analysis') }
}

const stillRelevant = [{ index: 0, relevant: true, reason: 'GetixHealth bills Medicare.', scope: 'company', entity_name: 'GetixHealth' }]
const noLonger = [{ index: 0, relevant: false, reason: 'GetixHealth stopped billing Medicare.', scope: 'firm', entity_name: '' }]

describe('rematch-regulation', () => {
  it('needs a regulation that exists', async () => {
    expect((await recheck({}, [], {})).res.status).toBe(400)
    expect((await recheck({ regulation: null }, [])).res.status).toBe(404)
  })

  it('refuses enforcement items without spending anything', async () => {
    const { res, model, db } = await recheck({ regulation: regulation({ category: 'enforcement' }) }, [])
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Re-checking is not available for enforcement items yet.')
    expect(model).toEqual([])
    expect(db.ran('check_rate_limit')).toEqual([])
  })

  it('stops at the rate limit before calling the model', async () => {
    const { res, model } = await recheck({ allowed: false }, stillRelevant)
    expect(res.status).toBe(429)
    expect(model).toEqual([])
  })

  it("puts the user's note in front of the model, trimmed and capped", async () => {
    const { verdictCalls } = await recheck({}, noLonger, { regulationId: REG, note: `  ${'We stopped billing Medicare. '.repeat(60)}  ` })
    const text = promptText(verdictCalls[0])
    expect(text).toContain('provided this correction: "We stopped billing Medicare.')
    const note = /provided this correction: "([^"]*)"/.exec(text)![1]
    expect(note.length).toBe(1000)
    expect(text).toContain('0. [CMS] Medicare payment update')
  })

  it('judges a regulatory item by the same rules as the matcher, at temperature 0', async () => {
    const { verdictCalls } = await recheck({}, noLonger)
    const text = promptText(verdictCalls[0])
    // The matcher's strictness rules, which the old re-check prompt lacked:
    // a technical correction kept matching on a re-check that the matcher rejects.
    expect(text).toContain('Speculative or hypothetical connections are not sufficient grounds for relevance')
    expect(text).toContain('purely administrative or procedural')
    expect(verdictCalls[0].body.temperature).toBe(0)
  })

  it('suggests a fact the note states for the profile, beside the re-check', async () => {
    const said = { scope: 'company', entity_name: 'GetixHealth', field: 'notes', value: ['Does not bill Medicare'], quote: 'we stopped billing Medicare' }
    const db = fakeClient((q: Query) => {
      const shared = firmQueries(q, {})
      if (shared) return shared
      if (q.table === 'regulations') return { data: regulation() }
      if (q.table === 'regulation_relevance') return { data: [] }
      if (q.table === 'firm_findings' && q.op === 'insert') return { data: [{ id: 'f-1', ...(q.payload as object[])[0] }] }
      if (q.table === 'firm_findings') return { data: [] }
      if (q.table === 'fund_holdings') return { data: [] }
    })
    setClient(db)
    const { handler } = await loadHandler('rematch-regulation')
    const { model } = stubModel({ submit_verdicts: { verdicts: noLonger }, submit_facts: { facts: [said] }, submit_reviews: { reviews: [] } })
    const res = await handler(post('rematch-regulation', { token: 'user-jwt', body: { regulationId: REG, note: 'GetixHealth? We stopped billing Medicare last year.' } }))
    const body = await res.json()

    const learn = model.find(m => m.tool === 'submit_facts')!
    expect(promptText(learn)).toContain('<untrusted_content source="the development being re-checked">\nMedicare payment update')
    expect(db.ran('firm_findings', 'insert')[0].payload).toEqual([
      { scope: 'company', entity_id: 'co-getix', field: 'notes', value: ['Does not bill Medicare'], recorded: null, quote: 'we stopped billing Medicare', firm_id: FIRM_ID, origin: 'recheck', origin_ref: REG },
    ])
    expect(body.learned).toEqual([expect.objectContaining({ id: 'f-1', field: 'notes', value: ['Does not bill Medicare'] })])
    expect(body.relevant).toBe(false)
  })

  it('re-checks without a note too', async () => {
    const { verdictCalls } = await recheck({}, noLonger)
    expect(promptText(verdictCalls[0])).toContain('with no further detail')
  })

  it('when the match no longer holds: removes it from the company, records why, and writes no analysis', async () => {
    const { res, db, analysisCalls } = await recheck({ existing: [{ id: 'old-company-match', fund_id: null, portfolio_company_id: 'co-getix' }] }, noLonger)

    expect(await res.json()).toEqual({
      relevant: false,
      reason: 'GetixHealth stopped billing Medicare.',
      verdicts: [{ entity: 'H.I.G. Capital', relevant: false, reason: 'GetixHealth stopped billing Medicare.' }],
      // No note, so nothing to learn and no call to learn it.
      learned: [],
    })
    expect(hasFilter(db.ran('regulation_relevance', 'delete')[0], 'in', 'id', ['old-company-match'])).toBe(true)
    expect(db.ran('regulation_relevance', 'upsert')[0].payload).toEqual([
      { regulation_id: REG, firm_id: FIRM_ID, fund_id: null, portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: GetixHealth stopped billing Medicare.' },
    ])
    expect(analysisCalls).toEqual([])
  })

  it('when the match still holds: keeps it and rewrites the analysis', async () => {
    const { res, db, analysisCalls } = await recheck({ existing: [{ id: 'company-match', fund_id: null, portfolio_company_id: 'co-getix' }] }, stillRelevant)

    expect(await res.json()).toMatchObject({ relevant: true, reason: 'GetixHealth bills Medicare.' })
    expect(db.ran('regulation_relevance', 'delete')).toEqual([])
    expect(analysisCalls).toHaveLength(1)
    expect(db.ran('regulation_impacts', 'upsert')).toHaveLength(1)
  })

  it('lists every entity it judged, relevant ones first', async () => {
    const { res } = await recheck({}, [
      { index: 0, relevant: false, reason: 'Aero Logistics is not a healthcare provider.', scope: 'company', entity_name: 'Aero Logistics' },
      { index: 0, relevant: true, reason: 'GetixHealth bills Medicare.', scope: 'company', entity_name: 'GetixHealth' },
    ])
    expect((await res.json()).verdicts).toEqual([
      { entity: 'GetixHealth', relevant: true, reason: 'GetixHealth bills Medicare.' },
      { entity: 'Aero Logistics', relevant: false, reason: 'Aero Logistics is not a healthcare provider.' },
    ])
  })

  it('records the re-check as "not relevant" when the model returns no verdict', async () => {
    const { res, db } = await recheck({}, [])
    expect(await res.json()).toMatchObject({ relevant: false, reason: 'No verdict returned for this regulation.' })
    expect(db.ran('regulation_relevance', 'upsert')[0].payload).toEqual([
      { regulation_id: REG, firm_id: FIRM_ID, fund_id: null, portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: No verdict returned for this regulation.' },
    ])
  })

  it("re-judges a geopolitical item by location, with the matcher's own rules, then re-derives fund rows", async () => {
    const tariff = regulation({ category: 'geopolitical', title: 'Tariff on Italian aircraft parts', agency: 'Trade Representative', countries: ['Italy'] })
    const { verdictCalls, db, res } = await recheck({ regulation: tariff }, [{ index: 0, relevant: true, reason: 'Direct: Aero Logistics is headquartered in Italy.', scope: 'company', entity_name: 'Aero Logistics' }], { regulationId: REG, note: 'We sold the Naples site.' })

    const text = promptText(verdictCalls[0])
    expect(text).toContain('Recorded location footprints')
    expect(text).toContain('Overlapping profile facts: Aero Logistics (company) — headquarters: Italy')
    expect(text).toContain('provided this correction: "We sold the Naples site."')
    // Funds are never asked about: their rows follow from holdings.
    expect(verdictCalls[0].body.tools[0].input_schema.properties.verdicts.items.properties.scope.enum).toEqual(['firm', 'company'])
    expect(db.ran('fund_holdings')).toHaveLength(2) // the roll-up, then the analysis
    expect((await res.json()).relevant).toBe(true)
  })

  it('charges the re-check to this function in the usage log', async () => {
    const { db } = await recheck({}, noLonger)
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'rematch-regulation', firm_id: FIRM_ID })
  })
})

describe('rematch-regulation with the Skeptic on', () => {
  afterEach(() => setEnv('SKEPTIC_MODE', undefined))

  it("sends the re-check's verdict through the same second pass as a new match", async () => {
    setEnv('SKEPTIC_MODE', 'on')
    const reviews = [{ index: 0, decision: 'reject', scope: 'company', entity_name: 'GetixHealth', reason: 'Billing Medicare is not recorded for GetixHealth.', unsupported_assumptions: ['bills Medicare'] }]
    const { res, db, model, analysisCalls } = await recheck({ reviews }, stillRelevant)
    expect(model.map(m => m.tool)).toEqual(['submit_verdicts', 'submit_reviews'])
    const [upsert] = db.ran('regulation_relevance', 'upsert')
    expect(upsert.payload).toEqual([
      { regulation_id: REG, firm_id: FIRM_ID, fund_id: null, portfolio_company_id: 'co-getix', relevance_reason: 'NOT_RELEVANT: Reviewed: Billing Medicare is not recorded for GetixHealth.' },
    ])
    expect(analysisCalls).toEqual([])
    expect(await res.json()).toMatchObject({ relevant: false, reason: 'Reviewed: Billing Medicare is not recorded for GetixHealth.' })
  })
})
