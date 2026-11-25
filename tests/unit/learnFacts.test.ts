import { describe, expect, it } from 'vitest'
import { proposeFacts, saveProposals, statesSomething, vetFacts, type Entities } from '../../supabase/functions/_shared/learnFacts'
import { learnedText } from '../../src/lib/research'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { jsonResponse } from './helpers/handler'
import { promptText, stubModel } from './helpers/firm'

const entities: Entities = {
  firm: { id: 'firm-1', name: 'H.I.G. Capital', profile: { firm_type: 'Private equity' } },
  funds: [{ id: 'fund-6', name: 'Fund VI', profile: {} }],
  companies: [
    { id: 'co-acme', name: 'Acme Batteries', description: 'Makes battery packs', profile: { notes: ['Has no plants outside Ohio'] } },
    { id: 'co-getix', name: 'GetixHealth', profile: {} },
  ],
}

const fact = (over: Record<string, unknown>) => ({ scope: 'company', entity_name: 'Acme Batteries', field: 'notes', value: ['Does not import batteries'], quote: "we don't import batteries", ...over })

describe('statesSomething', () => {
  it('skips questions and small talk without a call', () => {
    expect(statesSomething('Does the EU battery rule apply to us?')).toBe(false)
    expect(statesSomething('Thanks!')).toBe(false)
    expect(statesSomething('ok')).toBe(false)
  })

  it('reads a message with a statement in it', () => {
    expect(statesSomething("Does the EU battery rule apply to Acme? We don't import batteries.")).toBe(true)
    expect(statesSomething('No, Acme sold its Texas plant')).toBe(true)
  })
})

describe('vetFacts', () => {
  const text = "Acme? No, we don't import batteries. GetixHealth sells to hospitals only."

  it("keeps a note in the member's words, added to the notes already recorded", () => {
    expect(vetFacts(entities, { facts: [fact({})] }, text)).toEqual([
      { scope: 'company', entity_id: 'co-acme', field: 'notes', value: ['Has no plants outside Ohio', 'Does not import batteries'], recorded: ['Has no plants outside Ohio'], quote: "we don't import batteries" },
    ])
  })

  it('keeps a fact in a profile field, in that field\'s shape', () => {
    const [kept] = vetFacts(entities, { facts: [fact({ entity_name: 'getixhealth', field: 'customers', value: ['healthcare organizations'], quote: 'GetixHealth sells to hospitals only' })] }, text)
    expect(kept).toMatchObject({ entity_id: 'co-getix', field: 'customers', value: ['Healthcare organizations'], recorded: null })
  })

  it("drops a fact whose quote the member didn't type: the model can't put words in their mouth", () => {
    expect(vetFacts(entities, { facts: [fact({ quote: 'Acme has no imports at all' })] }, text)).toEqual([])
  })

  it('accepts the quote whatever the case, spacing or curly apostrophe', () => {
    expect(vetFacts(entities, { facts: [fact({ quote: 'We  don’t import BATTERIES' })] }, text)).toHaveLength(1)
  })

  it("drops an entity the firm doesn't have, a field a member can't answer, a value the field doesn't allow, and what is already recorded", () => {
    const facts = [
      fact({ entity_name: 'Other Co' }),
      fact({ field: 'priority_areas', value: ['Tax'] }),
      fact({ field: 'name', value: 'Acme' }),
      fact({ field: 'employees', value: 'about a thousand' }),
      fact({ value: ['Has no plants outside Ohio'] }),
    ]
    expect(vetFacts(entities, { facts }, text)).toEqual([])
  })

  it('makes two notes about one company one suggestion', () => {
    const facts = [fact({}), fact({ value: ['Sells only to hospitals'], quote: 'GetixHealth sells to hospitals only' })]
    const [kept, ...rest] = vetFacts(entities, { facts }, text)
    expect(rest).toEqual([])
    expect(kept.value).toEqual(['Has no plants outside Ohio', 'Does not import batteries', 'Sells only to hospitals'])
  })

  it('keeps at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) => fact({ entity_name: '', scope: 'firm', field: ['website', 'legal_name', 'gp_entity', 'aum', 'firm_type', 'adviser_registration', 'strategies', 'offices'][i], value: 'x', quote: 'batteries' }))
    expect(vetFacts(entities, { facts: many }, 'batteries').length).toBeLessThanOrEqual(5)
  })
})

function firmDb() {
  return fakeClient((q: Query) => {
    if (q.table === 'firms') return { data: entities.firm }
    if (q.table === 'funds') return { data: entities.funds }
    if (q.table === 'portfolio_companies') return { data: entities.companies }
  })
}

describe('proposeFacts', () => {
  it('asks Haiku at temperature 0, with the member\'s words and the earlier answer fenced', async () => {
    const db = firmDb()
    setClient(db)
    const { model } = stubModel({ submit_facts: { facts: [fact({})] } })
    const proposals = await proposeFacts(db as never, {
      firmId: 'firm-1',
      text: "No, we don't import batteries.",
      context: { source: "RegWay AI's earlier answer", text: 'Does Acme import battery cells?' },
      functionName: 'regway-ai-chat',
    })
    expect(proposals).toHaveLength(1)
    expect(model).toHaveLength(1)
    expect(model[0].body.model).toBe('claude-haiku-4-5')
    expect(model[0].body.temperature).toBe(0)
    const text = promptText(model[0])
    expect(text).toContain('<untrusted_content source="what the member typed">')
    expect(text).toContain('<untrusted_content source="RegWay AI\'s earlier answer">')
    expect(text).toContain('- Acme Batteries')
    expect(text).toContain('- notes: Anything else RegWay should know?')
    // Settings are not facts: they are not offered.
    expect(text).not.toContain('priority_areas')
    expect(model[0].body.system).toContain('never take a fact from it')
    // Every firm query is limited to the firm.
    for (const table of ['funds', 'portfolio_companies']) expect(hasFilter(db.ran(table)[0], 'eq', 'firm_id', 'firm-1')).toBe(true)
  })

  it('spends nothing on a question', async () => {
    const { model } = stubModel({})
    expect(await proposeFacts(firmDb() as never, { firmId: 'firm-1', text: 'Does this apply to Acme?', functionName: 'x' })).toEqual([])
    expect(model).toEqual([])
  })

  it('gives nothing, and throws nothing, when the call fails', async () => {
    stubModel({ submit_facts: () => jsonResponse({ type: 'error', error: { message: 'Your credit balance is too low' } }, 400) })
    expect(await proposeFacts(firmDb() as never, { firmId: 'firm-1', text: "We don't import batteries.", functionName: 'x' })).toEqual([])
  })
})

describe('saveProposals', () => {
  const proposal = { scope: 'company' as const, entity_id: 'co-acme', field: 'notes', value: ['Does not import batteries'], recorded: null, quote: "we don't import batteries" }

  it('saves suggestions with where they came from', async () => {
    const db = fakeClient((q: Query) => {
      if (q.table === 'firm_findings' && q.op === 'select') return { data: [] }
      if (q.table === 'firm_findings' && q.op === 'insert') return { data: [{ id: 'f-1', ...proposal }] }
    })
    expect(await saveProposals(db as never, 'firm-1', [proposal], { origin: 'chat', ref: 'msg-1' })).toEqual([{ id: 'f-1', ...proposal }])
    expect(db.ran('firm_findings', 'insert')[0].payload).toEqual([{ ...proposal, firm_id: 'firm-1', origin: 'chat', origin_ref: 'msg-1' }])
  })

  it('does not suggest the same thing twice', async () => {
    const db = fakeClient((q: Query) => {
      if (q.table === 'firm_findings' && q.op === 'select') return { data: [{ scope: 'company', entity_id: 'co-acme', field: 'notes', value: ['Does not import batteries'] }] }
    })
    expect(await saveProposals(db as never, 'firm-1', [proposal], { origin: 'recheck', ref: 'reg-1' })).toEqual([])
    expect(db.ran('firm_findings', 'insert')).toEqual([])
  })
})

describe('learnedText', () => {
  it('says what was suggested, only what is new', () => {
    expect(learnedText({ id: 'f', scope: 'company', entity_id: 'co', field: 'notes', value: ['Has no plants outside Ohio', 'Does not import batteries'], recorded: ['Has no plants outside Ohio'], entity: 'Acme Batteries' })).toBe('Acme Batteries: Does not import batteries')
    expect(learnedText({ id: 'f', scope: 'company', entity_id: 'co', field: 'trade', value: 'No', recorded: null, entity: 'Acme Batteries' })).toBe('Acme Batteries, does the company import or export goods or services: No')
  })
})
