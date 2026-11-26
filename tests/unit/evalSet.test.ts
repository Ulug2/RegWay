import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { classify, pick, type PoolDoc } from '../../scripts/eval/selectSet'
import { costUsd, firmContext, groups, markRequest, vetMarks, GROUP } from '../../scripts/eval/markSet'
import type { MatchingSet } from '../../scripts/eval/matchingSet'

// Building the test set and marking it (system guide §17.1). No database,
// no AI: the owner runs the scripts against the real ones.

const EXAMPLE = JSON.parse(readFileSync(path.resolve(__dirname, '../eval/matching-set.json'), 'utf8')) as MatchingSet
const unmarked = (set: MatchingSet): MatchingSet => ({ ...set, documents: set.documents.map(d => ({ ...d, expected: null })) })

describe('what production said', () => {
  const names = { funds: new Map([['f1', 'Fund I']]), companies: new Map([['c1', 'GetixHealth']]) }

  it('tells a match, a Skeptic rejection, a judge rejection and an unjudged document apart', () => {
    const judged = classify(
      [
        { regulation_id: 'm', fund_id: null, portfolio_company_id: 'c1', relevance_reason: 'Bills Medicare.' },
        { regulation_id: 's', fund_id: null, portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: Skeptic: no obligation.' },
        { regulation_id: 'r', fund_id: 'f1', portfolio_company_id: null, relevance_reason: 'NOT_RELEVANT: Trucking only.' },
      ],
      [
        { regulation_id: 's', decision: 'reject', scope: 'fund', entity_name: 'Fund I', reason: 'No obligation named.', restored_at: null },
        // A rejection a member restored does not count.
        { regulation_id: 'r', decision: 'reject', scope: 'firm', entity_name: null, reason: 'x', restored_at: '2026-11-01' },
      ],
      names,
    )
    expect(judged.get('m')).toEqual({ verdict: 'matched', entities: [{ scope: 'company', name: 'GetixHealth' }], reason: 'Bills Medicare.' })
    expect(judged.get('s')).toMatchObject({ verdict: 'skeptic_rejected', entities: [{ scope: 'fund', name: 'Fund I' }] })
    expect(judged.get('r')).toEqual({ verdict: 'rejected', entities: [], reason: 'Trucking only.' })
    expect(judged.get('u')).toBeUndefined()
  })

  it('picks the same documents for the same seed, mostly from the largest source but every source gets a turn', () => {
    const pool: PoolDoc[] = [
      ...Array.from({ length: 400 }, (_, i) => ({ id: `fr${i}`, source: 'federal_register', category: 'regulatory' as const, agency: i % 2 ? 'Securities and Exchange Commission' : 'Coast Guard', published_date: null })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `fca${i}`, source: 'fca_publications', category: 'regulatory' as const, agency: 'Financial Conduct Authority', published_date: null })),
    ]
    const plan = { regulatory: { matched: 0, skeptic_rejected: 0, rejected: 0, unjudged: 20, near: 0 }, geopolitical: { matched: 0, skeptic_rejected: 0, rejected: 0, unjudged: 0, near: 0 } }
    const a = pick(pool, new Map(), 'seed', plan)
    expect(a.map(p => p.doc.id)).toEqual(pick(pool, new Map(), 'seed', plan).map(p => p.doc.id))
    expect(a).toHaveLength(20)
    const fca = a.filter(p => p.doc.source === 'fca_publications').length
    expect(fca).toBeGreaterThan(0)
    expect(fca).toBeLessThan(10)
  })
})

describe('marking', () => {
  it('gives the marker every recorded fact and holding, and the documents fenced, but never what RegWay said', () => {
    const set = unmarked(EXAMPLE)
    set.documents[0].regway = { verdict: 'matched', entities: [{ scope: 'firm' }], reason: 'SECRET VERDICT' }
    const req = markRequest(set, set.documents.slice(0, 2), 'xhigh')
    const text = req.system[0].text + req.messages[0].content
    expect(req.model).toBe('claude-fable-5-2')
    expect(req.output_config.effort).toBe('xhigh')
    // No temperature or forced tool on this model: the API refuses both.
    expect(req).not.toHaveProperty('temperature')
    expect(req).not.toHaveProperty('tool_choice')
    expect(text).toContain('Revenue cycle management for hospitals')
    expect(text).toContain('- held by: Harbor Fund I')
    expect(text).toContain('<untrusted_content source="Securities and Exchange Commission">')
    expect(text).not.toContain('SECRET VERDICT')
    expect(firmContext(set)).toContain('adviser registration: SEC-registered')
  })

  it('keeps answers that name the firm\'s own entities, and leaves the rest unmarked', () => {
    const set = unmarked(EXAMPLE)
    const [form, medicare, , tariff] = set.documents
    const { marks, problems } = vetMarks(set, [form, medicare, tariff], {
      documents: [
        { id: form.id, applies_to: [{ scope: 'firm', name: 'Harbor Capital' }], why: 'Form PF binds the adviser.', confidence: 'high' },
        { id: medicare.id, applies_to: [{ scope: 'company', name: 'getixhealth' }, { scope: 'company', name: 'Nobody Inc' }], why: 'x', confidence: 'high' },
        { id: tariff.id, applies_to: [{ scope: 'fund', name: 'Harbor Fund I' }], why: 'x', confidence: 'low' },
      ],
    })
    expect(marks).toEqual([{ id: form.id, expected: [{ scope: 'firm' }], why: 'Form PF binds the adviser.', confidence: 'high' }])
    expect(problems).toEqual([`${medicare.id}: no company named "Nobody Inc"`, `${tariff.id}: a fund on a geopolitical item`])
  })

  it('groups only unmarked documents, one category per request', () => {
    const set = unmarked(EXAMPLE)
    set.documents[0].expected = []
    const g = groups(set)
    expect(g.map(x => x.map(d => d.category))).toEqual([['regulatory', 'regulatory'], ['geopolitical']])
    expect(GROUP).toBeGreaterThan(1)
  })

  it('prices Fable 5.2, and halves it by batch', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000 }
    expect(costUsd(usage, false)).toBeCloseTo(8 + 4 + 0.2)
    expect(costUsd(usage, true)).toBeCloseTo((8 + 4 + 0.2) / 2)
  })
})
