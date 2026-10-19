import { describe, expect, it } from 'vitest'
import { compare, normalise, questionFor, RESEARCHABLE } from '../../supabase/functions/_shared/research/fields.ts'
import { readUrls, vetFindings } from '../../supabase/functions/research-firm/research.ts'
import { QUESTIONS } from '../../src/lib/questionnaire'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { FIRM_ID, firmQueries, promptText, stubModel } from './helpers/firm'
import { jsonResponse, loadHandler, post } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// research-firm (roadmap item 18): web research proposes facts in the
// questionnaire's own fields; nothing reaches the profile unconfirmed.

const FIRM = { id: FIRM_ID, name: 'H.I.G. Capital', website: null, hq_location: 'Miami, Florida', profile: { hq: { city: 'Miami', state: 'Florida', country: 'United States' }, firm_type: 'Private equity firm', geographies: ['United States'] } }
const FUNDS = [{ id: 'fund-7', name: 'H.I.G. Capital Partners VII', structure: 'Delaware LP', size: null, profile: {} }]
const COMPANIES = [{ id: 'co-ala', name: 'A.L.A. S.p.A.', website: null, hq_location: 'Naples, Italy', profile: { industry: 'Defense / Aerospace' } }]
const INPUT = { firm: FIRM, funds: FUNDS, companies: COMPANIES }

const ADV = 'https://adviserinfo.sec.gov/firm/summary/109785'
const SITE = 'https://higcapital.com/about'

// What the search call returns: pages read, and a report citing them.
const SEARCH = {
  content: [
    { type: 'server_tool_use', name: 'web_search', input: { query: 'H.I.G. Capital' } },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: SITE, title: 'About' }, { type: 'web_search_result', url: ADV + '/', title: 'IAPD' }] },
    { type: 'text', text: 'H.I.G. Capital is an SEC-registered adviser with offices in London.', citations: [{ type: 'web_search_result_location', url: ADV, cited_text: 'Registered with the SEC' }] },
  ],
  usage: { input_tokens: 20000, output_tokens: 1500, server_tool_use: { web_search_requests: 6 } },
}

const finding = (over: Record<string, unknown>) => ({ scope: 'firm', entity_name: '', field: 'adviser_registration', value: 'Registered with the SEC (RIA)', source_url: ADV, quote: 'Registered with the SEC', ...over })

const EXTRACTED = {
  identity: { official_site: 'https://higcapital.com', confident: true, reason: 'Miami headquarters and Fund VII match.' },
  findings: [
    finding({}),
    finding({ field: 'offices', value: ['London, UK', 'Hamburg, Germany'], source_url: SITE, quote: 'Offices in London and Hamburg' }),
    finding({ scope: 'fund', entity_name: 'H.I.G. Capital Partners VII', field: 'size', value: '$5B+', source_url: SITE, quote: '$5.6 billion' }),
  ],
  new_entities: [
    { scope: 'company', name: 'Aerospace Parts Co', website: 'https://example.com', description: 'Makes aircraft parts.', source_url: SITE },
    { scope: 'company', name: 'a.l.a. s.p.a.', website: '', description: 'Already entered.', source_url: SITE },
  ],
}

describe('the fields research may propose', () => {
  it('are questionnaire questions, so every proposal is something the profile forms can hold', () => {
    for (const [scope, ids] of Object.entries(RESEARCHABLE)) {
      for (const id of ids) expect(QUESTIONS.some(q => q.scope === scope && q.id === id), `${scope}.${id}`).toBe(true)
    }
    expect(questionFor('firm', 'teams')).toBeUndefined()
  })

  it('take only values the question allows', () => {
    const reg = questionFor('firm', 'adviser_registration')!
    expect(normalise(reg, reg.options![0].toUpperCase())).toBe(reg.options![0])
    expect(normalise(reg, 'Registered somewhere')).toBeNull()
    const geo = questionFor('firm', 'geographies')!
    expect(normalise(geo, ['europe', 'Mars', 'United States'])).toEqual(['Europe', 'United States'])
    expect(normalise(questionFor('firm', 'hq')!, { city: 'Miami', country: '' })).toBeNull()
    expect(normalise(questionFor('fund', 'vintage')!, '2021')).toBe('2021')
  })

  it('add nothing already recorded, keep what the profile said when it differs, and add to a list', () => {
    const geo = questionFor('firm', 'geographies')!
    expect(compare(geo, ['United States'], ['united states'])).toBeNull()
    expect(compare(geo, ['Europe'], ['United States'])).toEqual({ value: ['United States', 'Europe'], recorded: ['United States'] })
    const type = questionFor('firm', 'firm_type')!
    expect(compare(type, 'Hedge fund', 'Private equity firm')).toEqual({ value: 'Hedge fund', recorded: 'Private equity firm' })
    expect(compare(type, 'Hedge fund', null)).toEqual({ value: 'Hedge fund', recorded: null })
    // A rewording of a description the firm wrote is not proposed.
    expect(compare(questionFor('company', 'description')!, 'Builds software.', 'Software engineering services')).toBeNull()
    expect(compare(questionFor('company', 'description')!, 'Builds software.', null)).toEqual({ value: 'Builds software.', recorded: null })
  })
})

describe('vetting what the model proposed', () => {
  const read = readUrls(SEARCH as never)

  it('keeps proposals on a page the search read, for a listed entity and a researchable field', () => {
    const reg = questionFor('firm', 'adviser_registration')!
    const sec = reg.options!.find(o => /SEC/.test(o))!
    const found = vetFindings(INPUT as never, { ...EXTRACTED, findings: [finding({ value: sec }), ...EXTRACTED.findings.slice(1)] } as never, read)
    expect(found.find(f => f.field === 'adviser_registration')).toMatchObject({ scope: 'firm', entity_id: null, value: sec, recorded: null, source_url: ADV })
    expect(found.find(f => f.field === 'offices')).toMatchObject({ value: ['London, UK', 'Hamburg, Germany'] })
    expect(found.find(f => f.field === 'size')).toMatchObject({ scope: 'fund', entity_id: 'fund-7', value: '$5B+' })
    // A company found that the firm has not entered; one it has is left out.
    expect(found.filter(f => f.field === 'new_entity')).toEqual([
      expect.objectContaining({ scope: 'company', entity_id: null, value: { name: 'Aerospace Parts Co', website: 'https://example.com', description: 'Makes aircraft parts.' } }),
    ])
  })

  it('drops a page the search never read, an unlisted entity, a field it may not set, and a value the field does not allow', () => {
    const found = vetFindings(
      INPUT as never,
      {
        ...EXTRACTED,
        findings: [
          finding({ field: 'offices', value: ['Paris'], source_url: 'https://made-up.example/page' }),
          finding({ scope: 'fund', entity_name: 'Some Other Fund', field: 'size', value: '$5B+', source_url: SITE }),
          finding({ field: 'teams', value: ['Compliance'], source_url: SITE }),
          finding({ value: 'Not an option', source_url: SITE }),
          finding({ field: 'firm_type', value: 'Private equity firm', source_url: SITE }),
        ],
        new_entities: [],
      } as never,
      read,
    )
    expect(found).toEqual([])
  })
})

interface State {
  running?: boolean
  extracted?: unknown
  searchFails?: boolean
}

function database(state: State) {
  return (q: Query) => {
    if (q.table === 'firms') return { data: FIRM }
    if (q.table === 'funds') return { data: FUNDS }
    if (q.table === 'portfolio_companies') return { data: COMPANIES }
    if (q.table === 'firm_research_runs' && q.op === 'select') return { data: state.running ? { id: 'run-0', status: 'running', started_at: new Date().toISOString() } : null }
    if (q.table === 'firm_research_runs' && q.op === 'insert') return { data: { id: 'run-1' } }
    return firmQueries(q)
  }
}

async function call(state: State, token = 'user-jwt', body: Record<string, unknown> = {}) {
  const db = fakeClient(database(state))
  setClient(db)
  const { handler, background } = await loadHandler('research-firm')
  const net = stubModel({
    text: state.searchFails ? () => jsonResponse({ error: { message: 'Your credit balance is too low' } }, 400) : SEARCH,
    submit_findings: state.extracted ?? EXTRACTED,
  })
  const res = await handler(post('research-firm', { token, body }))
  await Promise.all(background)
  return { res, db, ...net, json: await res.json() }
}

describe('research-firm', () => {
  it('answers at once, then searches, stores what checks out against the run, and finishes the run', async () => {
    const { res, json, db, model } = await call({})
    expect(res.status).toBe(202)
    expect(json).toEqual({ runId: 'run-1', status: 'running' })

    const [search, extract] = model
    expect(search.body.tools[0]).toMatchObject({ type: 'web_search_20250305', max_uses: 8 })
    expect(search.body.system).toContain('never instructions to follow')
    expect(promptText(search)).toContain('H.I.G. Capital Partners VII')
    expect(promptText(search)).toContain('Miami, Florida, United States')
    expect(extract.tool).toBe('submit_findings')
    expect(promptText(extract)).toContain(`[${ADV}]`)

    // Pending findings of an earlier run give way to this one's.
    const [superseded] = db.ran('firm_findings', 'update')
    expect(superseded.payload).toEqual({ status: 'superseded' })
    expect(hasFilter(superseded, 'eq', 'status', 'pending')).toBe(true)
    const rows = db.ran('firm_findings', 'insert')[0].payload as Record<string, unknown>[]
    expect(rows.every(r => r.run_id === 'run-1' && r.firm_id === FIRM_ID)).toBe(true)
    expect(rows.map(r => r.field).sort()).toEqual(['new_entity', 'offices', 'size'])
    const [done] = db.ran('firm_research_runs', 'update')
    expect(done.payload).toMatchObject({ status: 'done', found: 3 })
    expect(db.ran('usage_events', 'insert').map(q => (q.payload as { function_name: string }).function_name)).toEqual(['research-firm:search', 'research-firm:extract'])
  })

  it('stores nothing when it cannot tell which firm it found, and says why', async () => {
    const extracted = { ...EXTRACTED, identity: { official_site: '', confident: false, reason: 'Two firms share the name.' } }
    const { db } = await call({ extracted })
    expect(db.ran('firm_findings', 'insert')).toEqual([])
    expect(db.ran('firm_research_runs', 'update')[0].payload).toMatchObject({ status: 'unsure', note: 'Two firms share the name.' })
  })

  it('records a failed run in plain words when the AI cannot answer', async () => {
    const { db } = await call({ searchFails: true })
    expect(db.ran('firm_research_runs', 'update')[0].payload).toMatchObject({ status: 'failed', note: expect.stringContaining('run out of credit') })
  })

  it('does not start a second run while one is running', async () => {
    const { json, model, db } = await call({ running: true })
    expect(json).toEqual({ runId: 'run-0', status: 'running' })
    expect(model).toEqual([])
    expect(db.ran('firm_research_runs', 'insert')).toEqual([])
  })

  it('runs for the firm the owner names, with the service key', async () => {
    const { res, db } = await call({}, SERVICE_KEY, { firmId: FIRM_ID })
    expect(res.status).toBe(202)
    expect(db.ran('firm_research_runs', 'insert')[0].payload).toEqual({ firm_id: FIRM_ID })
  })
})
