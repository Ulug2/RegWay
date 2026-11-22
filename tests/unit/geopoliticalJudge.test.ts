import { describe, expect, it } from 'vitest'
import { judgeGeopolitical, type Candidate } from '../../supabase/functions/_shared/geopoliticalJudge.ts'
import { companyFootprint, firmFootprint } from '../../supabase/functions/_shared/footprint.ts'
import { fakeClient } from './helpers/fakeSupabase'
import { jsonResponse, stubFetch } from './helpers/handler'

const firm = { name: 'Harbor Capital', hq_location: 'Miami, Florida', jurisdictions: null, profile: null }
const aero = { id: 'aero', name: 'Aero Logistics', hq_location: 'Naples, Italy', sectors: ['Aerospace'], regions: null, offerings: null, profile: null }
const footprints = [firmFootprint(firm), companyFootprint(aero)]

const candidate = (id: string, title: string, countries: string[]): Candidate => ({ id, title, agency: 'Trade Representative', summary: 'Summary.', countries, published_date: '2026-10-01' })
const candidates = [candidate('r0', 'Tariff on Italian aircraft parts', ['Italy']), candidate('r1', 'Global de minimis change', []), candidate('r2', 'Iran designations', ['Iran'])]

// The model's reply, as the Messages API returns a forced tool call.
function model(verdicts: unknown[], usage = { input_tokens: 900, output_tokens: 120 }) {
  return stubFetch(url => (url.hostname === 'api.anthropic.com' ? jsonResponse({ content: [{ type: 'tool_use', name: 'submit_verdicts', input: { verdicts } }], usage }) : undefined))
}

const judge = (db = fakeClient(), correction?: string | null) =>
  judgeGeopolitical(db as never, { firmId: 'firm-1', firmName: firm.name, companies: [aero], footprints, candidates, functionName: 'match-geopolitical-relevance', correction })

const prompt = (calls: ReturnType<typeof model>) => {
  const body = JSON.parse(calls[0].init!.body as string)
  return { body, footprintBlock: body.messages[0].content[0].text as string, developments: body.messages[0].content[1].text as string }
}

describe('judgeGeopolitical', () => {
  it('gives the model the overlap the code already found, not a free hand', async () => {
    const calls = model([])
    await judge()
    const { footprintBlock, developments } = prompt(calls)
    expect(footprintBlock).toContain('- Aero Logistics (company): does: Aerospace; headquarters: Italy; key suppliers: NOT RECORDED')
    expect(developments).toContain('Overlapping profile facts: Aero Logistics (company) — headquarters: Italy')
    expect(developments).toContain('Countries named: no specific country (global or program-wide measure)')
    // Iran is named, but nothing recorded is there.
    expect(developments).toMatch(/2\. \[.*\]\n\s+Countries named: Iran\n\s+Overlapping profile facts: none.*\n<untrusted_content source="Trade Representative">\nTitle: Iran designations\n/)
  })

  it('never asks the model about funds: fund exposure is derived from holdings', async () => {
    const calls = model([])
    await judge()
    const scope = prompt(calls).body.tools[0].input_schema.properties.verdicts.items.properties.scope
    expect(scope.enum).toEqual(['firm', 'company'])
  })

  it('drops a company verdict that names no real portfolio company', async () => {
    model([
      { index: 0, relevant: true, reason: 'Direct: Aero Logistics is headquartered in Italy.', scope: 'company', entity_name: 'aero logistics' },
      { index: 0, relevant: true, reason: 'Invented.', scope: 'company', entity_name: 'Aero Italia S.p.A.' },
      { index: 1, relevant: true, reason: 'No name.', scope: 'company', entity_name: '' },
      { index: 2, relevant: false, reason: 'Designation of named persons.', scope: 'firm', entity_name: '' },
    ])
    const verdicts = await judge()
    expect(verdicts.filter(v => v.relevant).map(v => v.entity_name)).toEqual(['aero logistics'])
    expect(verdicts.find(v => v.index === 2)).toMatchObject({ relevant: false, scope: 'firm' })
  })

  // Otherwise the same item is sent, and billed, on every run.
  it('marks every development the model skipped as evaluated', async () => {
    model([{ index: 0, relevant: false, reason: 'Not within what the tariff covers.', scope: 'firm', entity_name: '' }])
    const verdicts = await judge()
    expect(verdicts.map(v => v.index).sort()).toEqual([0, 1, 2])
    expect(verdicts.filter(v => v.reason === 'No verdict returned for this development.').map(v => v.index)).toEqual([1, 2])
    expect(verdicts.every(v => !v.relevant)).toBe(true)
  })

  it("adds a user's correction only on a re-check", async () => {
    const plain = model([])
    await judge()
    expect(prompt(plain).developments).not.toContain('flagged')

    const noted = model([])
    await judge(fakeClient(), 'We sold the Naples site in 2025.')
    expect(prompt(noted).developments).toContain('provided this correction: "We sold the Naples site in 2025."')
    expect(prompt(noted).developments).toContain('cannot add an unrecorded one')

    const bare = model([])
    await judge(fakeClient(), null)
    expect(prompt(bare).developments).toContain('with no further detail')
  })

  it('records what the call cost', async () => {
    model([], { input_tokens: 1000, output_tokens: 200 })
    const db = fakeClient()
    await judge(db)
    expect(db.ran('usage_events', 'insert')[0].payload).toMatchObject({ function_name: 'match-geopolitical-relevance', firm_id: 'firm-1', input_tokens: 1000, output_tokens: 200 })
  })

  it('throws on an API error instead of recording empty verdicts', async () => {
    stubFetch(() => jsonResponse({ error: { message: 'Your credit balance is too low' } }, 400))
    await expect(judge()).rejects.toThrow(/Anthropic API error: 400/)
  })
})
