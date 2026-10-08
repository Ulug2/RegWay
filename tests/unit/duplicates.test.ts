import { describe, expect, it } from 'vitest'
import {
  announcementBody,
  announcementsFor,
  federalRegisterNumber,
  linkDuplicate,
  matchAnnouncement,
  neverAnnounced,
  sameTitleGroups,
  sanctionsActKey,
  sanctionsPairs,
  scanResultLinks,
  titleKey,
  withoutCoveredDuplicates,
  type Version,
} from '../../supabase/functions/_shared/duplicates'
import { generateImpacts } from '../../supabase/functions/_shared/impact'
import { fakeClient, hasFilter, setClient } from './helpers/fakeSupabase'
import { promptText, stubModel } from './helpers/firm'

const version = (id: string, over: Partial<Version> = {}): Version => ({
  id,
  source: 'federal_register',
  title: id,
  agency: 'Securities and Exchange Commission',
  summary: null,
  published_date: '2026-10-06',
  source_url: `https://example.test/${id}`,
  duplicate_of: null,
  created_at: '2026-10-06T12:00:00Z',
  ...over,
})

// Titles as EUR-Lex publishes them.
const DRC_REGULATION = 'Council Implementing Regulation (EU) 2026/2191 of 28 September 2026 implementing Regulation (EC) No 1183/2005 concerning restrictive measures in view of the situation in the Democratic Republic of the Congo'
const DRC_DECISION = 'Council Implementing Decision (CFSP) 2026/2172 of 28 September 2026 implementing Decision 2010/788/CFSP concerning restrictive measures in view of the situation in the Democratic Republic of the Congo'
const RUSSIA_DECISION = 'Council Decision (CFSP) 2026/2164 of 24 September 2026 amending Decision (CFSP) 2024/2643 concerning restrictive measures in view of Russia’s destabilising activities'
const RUSSIA_REGULATION = "Council Implementing Regulation (EU) 2026/2165 of 24 September 2026 implementing Regulation (EU) 2024/2642 concerning restrictive measures in view of Russia's destabilising activities"
const BURUNDI_DECISION = 'Council Decision (CFSP) 2026/2197 of 28 September 2026 amending Decision (CFSP) 2015/1763 concerning restrictive measures in view of the situation in Burundi'

const eu = (id: string, title: string, over: Partial<Version> = {}) => version(id, { source: 'eu_sanctions', title, agency: 'Council of the European Union (EU sanctions)', published_date: '2026-09-29', ...over })

describe('EU sanctions: a Decision and the Regulation published with it', () => {
  it('reads the act date and the regime from the title', () => {
    expect(sanctionsActKey(DRC_REGULATION)).toBe('28 September 2026|restrictive measures in view of the situation in the democratic republic of the congo')
    expect(sanctionsActKey(DRC_DECISION)).toBe(sanctionsActKey(DRC_REGULATION))
    // Typographic and plain apostrophes are the same regime.
    expect(sanctionsActKey(RUSSIA_DECISION)).toBe(sanctionsActKey(RUSSIA_REGULATION))
    expect(sanctionsActKey(BURUNDI_DECISION)).not.toBe(sanctionsActKey(DRC_DECISION))
    expect(sanctionsActKey('OFSI General licence INT/2025/5635700')).toBeNull()
  })

  it('links the Decision to the Regulation, and leaves an act published alone as it is', () => {
    const links = sanctionsPairs([eu('drc-d', DRC_DECISION), eu('drc-r', DRC_REGULATION), eu('ru-d', RUSSIA_DECISION), eu('ru-r', RUSSIA_REGULATION), eu('burundi', BURUNDI_DECISION)])
    expect(links).toEqual([
      { secondary: 'drc-d', primary: 'drc-r' },
      { secondary: 'ru-d', primary: 'ru-r' },
    ])
  })

  it('does not guess when two actions on one regime share a date', () => {
    const second = (title: string) => title.replace(/2026\/\d+/, '2026/9999')
    expect(sanctionsPairs([eu('d1', DRC_DECISION), eu('r1', DRC_REGULATION), eu('d2', second(DRC_DECISION)), eu('r2', second(DRC_REGULATION))])).toEqual([])
    // Two Decisions are not a Decision and a Regulation.
    expect(sanctionsPairs([eu('d1', DRC_DECISION), eu('d2', second(DRC_DECISION))])).toEqual([])
  })

  it('does not pair instruments published weeks apart', () => {
    expect(sanctionsPairs([eu('d', DRC_DECISION, { published_date: '2026-09-29' }), eu('r', DRC_REGULATION, { published_date: '2026-10-20' })])).toEqual([])
  })
})

describe('the same publication listed twice by one source', () => {
  const fca = (id: string, title: string, over: Partial<Version> = {}) => version(id, { source: 'fca_publications', title, published_date: '2026-09-30', ...over })

  it('compares titles without the reference number', () => {
    expect(titleKey('GC26/6: Primary Market Bulletin No. 66')).toBe('primary market bulletin no. 66')
    expect(titleKey('FG26/8: Primary Market Bulletin No. 66')).toBe('primary market bulletin no. 66')
    // Too short to mean anything.
    expect(titleKey('CP26/1: Fees')).toBeNull()
  })

  it('links the later one to the first', () => {
    const links = sameTitleGroups([
      fca('fg', 'FG26/8: Primary Market Bulletin No. 66', { created_at: '2026-09-30T10:00:01Z' }),
      fca('gc', 'GC26/6: Primary Market Bulletin No. 66', { created_at: '2026-09-30T10:00:00Z' }),
      fca('other', 'PS26/18: Cryptoasset perimeter guidance'),
    ])
    expect(links).toEqual([{ secondary: 'fg', primary: 'gc' }])
  })

  it('keeps apart different titles, different sources, and the same title months later', () => {
    expect(sameTitleGroups([fca('a', 'Iran sanctions: guidance'), fca('b', 'Iran nuclear sanctions: guidance')])).toEqual([])
    expect(sameTitleGroups([fca('a', 'Primary Market Bulletin No. 66'), version('b', { source: 'esma_news', title: 'Primary Market Bulletin No. 66', published_date: '2026-09-30' })])).toEqual([])
    expect(sameTitleGroups([fca('a', 'Quarterly consultation paper', { published_date: '2026-06-01' }), fca('b', 'Quarterly consultation paper', { published_date: '2026-09-01' })])).toEqual([])
  })
})

describe("a company scan's result that is a Federal Register document", () => {
  const doc = (id: string, number: string, title: string, over: Partial<Version> = {}) => ({ ...version(id, { title, ...over }), external_id: number })
  const scan = (id: string, title: string, url: string, over: Partial<Version> = {}) => version(id, { source: 'ai_search', title, source_url: url, ...over })

  it('finds the document number in a Federal Register or GovInfo link only', () => {
    expect(federalRegisterNumber('https://www.federalregister.gov/documents/2026/10/06/2026-20466/adviser-and-regulated-fund-custody-rules')).toBe('2026-20466')
    expect(federalRegisterNumber('https://www.govinfo.gov/content/pkg/FR-2026-10-06/pdf/2026-20466.pdf')).toBe('2026-20466')
    expect(federalRegisterNumber('https://www.sec.gov/files/rules/2026-20466.pdf')).toBeNull()
    expect(federalRegisterNumber('https://www.federalregister.gov/agencies/securities-and-exchange-commission')).toBeNull()
  })

  it('links by document number whatever the scan called it, with the Federal Register row as the card', () => {
    const documents = [doc('fr', '2026-11111', 'Anti-Money Laundering and Countering the Financing of Terrorism Programs')]
    const scanned = [scan('s', 'FinCEN Proposed Rule: AML/CFT Program Reform', 'https://www.federalregister.gov/documents/2026/08/01/2026-11111/anti-money-laundering')]
    expect(scanResultLinks(scanned, documents)).toEqual([{ secondary: 's', primary: 'fr' }])
  })

  it('links by an identical title when exactly one document has it', () => {
    const documents = [doc('fr', '2026-20466', 'Adviser and Regulated Fund Custody Rules; Crypto Custody Rules')]
    const scanned = [
      scan('s1', 'Adviser and Regulated Fund Custody Rules; Crypto Custody Rules', 'https://www.sec.gov/rules-regulations/rulemaking-activity', { published_date: '2026-10-01' }),
      scan('s2', 'Amendments to Regulation S-P', 'https://corsicatech.com/blog/sec-update'),
    ]
    expect(scanResultLinks(scanned, documents)).toEqual([{ secondary: 's1', primary: 'fr' }])
  })

  it('does not link by title when several documents share it or the dates are far apart', () => {
    const notices = [doc('n1', '2026-00001', 'Notice of OFAC Sanctions Action'), doc('n2', '2026-00002', 'Notice of OFAC Sanctions Action')]
    expect(scanResultLinks([scan('s', 'Notice of OFAC Sanctions Action', 'https://ofac.treasury.gov/recent-actions')], notices)).toEqual([])

    const final = [doc('fr', '2026-20000', 'Transparency in Coverage', { published_date: '2026-10-06' })]
    expect(scanResultLinks([scan('s', 'Transparency in Coverage', 'https://www.cms.gov/x', { published_date: '2025-11-01' })], final)).toEqual([])
    // A scan that found no date is linked on the title alone.
    expect(scanResultLinks([scan('s', 'Transparency in Coverage', 'https://www.cms.gov/x', { published_date: null })], final)).toEqual([{ secondary: 's', primary: 'fr' }])
  })
})

describe("a Federal Register document and the agency's announcement of it", () => {
  const announcement = (id: string, over: Partial<Version> = {}) => version(id, { source: 'sec_news', agency: 'Securities and Exchange Commission (SEC)', published_date: '2026-10-01', ...over })
  const document = version('fr', { title: 'Adviser and Regulated Fund Custody Rules; Crypto Custody Rules', summary: 'The Commission is proposing new custody rules.', published_date: '2026-10-06' })

  it("compares a document only with its own agency's announcements from the weeks before it", () => {
    const candidates = announcementsFor(document, [
      announcement('recent'),
      announcement('two-months', { published_date: '2026-08-10' }),
      announcement('too-old', { published_date: '2026-07-01' }),
      announcement('day-after', { published_date: '2026-10-08' }),
      announcement('much-later', { published_date: '2026-10-20' }),
      announcement('ftc', { source: 'ftc_news' }),
      announcement('fca', { source: 'fca_publications' }),
    ])
    expect(candidates.map(c => c.id)).toEqual(['recent', 'two-months', 'day-after'])
    expect(announcementsFor({ ...document, published_date: null }, [announcement('recent')])).toEqual([])
  })

  it('never asks about exchange and FINRA rule filings', () => {
    expect(neverAnnounced(version('sro', { title: 'Self-Regulatory Organizations; Financial Industry Regulatory Authority, Inc.; Order Approving a Proposed Rule Change' }))).toBe(true)
    expect(neverAnnounced(document)).toBe(false)
  })

  it('asks the model once and maps its answer back to an announcement', async () => {
    const announcements = [announcement('exam', { title: 'SEC’s Division of Examinations Announces New Exam Handbook' }), announcement('custody', { title: 'SEC Proposal Would Address How Investment Advisers and Funds Can Custody Crypto Assets' })]
    const db = fakeClient()
    const { model } = stubModel({ submit_match: { reason: 'Same custody proposal.', press_release: 2 } })

    expect(await matchAnnouncement(db, document, announcements)).toBe(1)
    expect(model).toHaveLength(1)
    expect(model[0].body.model).toBe('claude-haiku-4-5')
    expect(model[0].body.temperature).toBe(0)
    const prompt = promptText(model[0])
    expect(prompt).toContain('Title: Adviser and Regulated Fund Custody Rules; Crypto Custody Rules')
    expect(prompt).toContain('1. [2026-10-01] SEC’s Division of Examinations Announces New Exam Handbook')
    expect(prompt).toContain('2. [2026-10-01] SEC Proposal Would Address How Investment Advisers and Funds Can Custody Crypto Assets')
    // Billed to no firm: the link is the same for everyone.
    const [usage] = db.ran('usage_events', 'insert')
    expect(usage.payload).toMatchObject({ function_name: 'group-duplicates', firm_id: null, model: 'claude-haiku-4-5' })
  })

  it("reads a press release's body from its page, starting where the release itself starts", () => {
    const release = { title: 'SEC Proposes Amendments', summary: 'The Securities and Exchange Commission today voted to propose rule amendments that would…' }
    const page = `Skip to main content SEC homepage Newsroom Press Releases The Securities and Exchange Commission today voted to propose rule amendments that would facilitate capital formation. The proposals would: Modernize the interval fund framework. ${'x'.repeat(5000)}`
    const body = announcementBody(page, release)
    expect(body.startsWith('The Securities and Exchange Commission today voted')).toBe(true)
    expect(body).toContain('Modernize the interval fund framework')
    expect(body).toHaveLength(3000)
    // No summary in the feed: from the headline. Neither found: nothing, and the summary is used.
    expect(announcementBody('Menu SEC Proposes Amendments Washington D.C.', { ...release, summary: null })).toBe('SEC Proposes Amendments Washington D.C.')
    expect(announcementBody('Request blocked', release)).toBe('')
  })

  it('gives the model the body where it has one, and the summary otherwise', async () => {
    const { model } = stubModel({ submit_match: { reason: 'x', press_release: 1 } })
    const announcements = [announcement('a', { summary: 'Short summary A…' }), announcement('b', { summary: 'Short summary B…' })]
    await matchAnnouncement(fakeClient(), document, announcements, new Map([['a', 'Full body of release A, naming the custody rules.'], ['b', '']]))
    const prompt = promptText(model[0])
    expect(prompt).toContain('Full body of release A, naming the custody rules.')
    expect(prompt).not.toContain('Short summary A')
    expect(prompt).toContain('Short summary B…')
  })

  it.each([
    ['none announced it', 0],
    ['a number that is not on the list', 7],
    ['a negative number', -1],
    ['not a number', 'the second one'],
  ])('links nothing when the model answers %s', async (_, answer) => {
    stubModel({ submit_match: { reason: 'x', press_release: answer } })
    expect(await matchAnnouncement(fakeClient(), document, [announcement('a')])).toBeNull()
  })
})

describe('linking', () => {
  const database = (rows: { id: string; duplicate_of: string | null }[]) =>
    fakeClient(q => (q.table === 'regulations' && q.op === 'select' ? { data: rows.filter(r => (q.filters.find(f => f[0] === 'in')![2] as string[]).includes(r.id)) } : undefined))

  it('points the later version at the first and brings along whatever pointed at it', async () => {
    const db = database([{ id: 'doc', duplicate_of: null }, { id: 'news', duplicate_of: null }])
    expect(await linkDuplicate(db, { secondary: 'doc', primary: 'news' })).toBe(true)
    const [point, follow] = db.ran('regulations', 'update')
    expect(point.payload).toEqual({ duplicate_of: 'news' })
    expect(hasFilter(point, 'eq', 'id', 'doc')).toBe(true)
    expect(follow.payload).toEqual({ duplicate_of: 'news' })
    expect(hasFilter(follow, 'eq', 'duplicate_of', 'doc')).toBe(true)
  })

  it('keeps links one level deep: a link to a later version goes to its first version', async () => {
    const db = database([{ id: 'scan', duplicate_of: null }, { id: 'doc', duplicate_of: 'news' }])
    await linkDuplicate(db, { secondary: 'scan', primary: 'doc' })
    expect(db.ran('regulations', 'update')[0].payload).toEqual({ duplicate_of: 'news' })
  })

  it('changes nothing when the link is already there, would loop, or a row is gone', async () => {
    for (const [rows, link] of [
      [[{ id: 'doc', duplicate_of: 'news' }, { id: 'news', duplicate_of: null }], { secondary: 'doc', primary: 'news' }],
      [[{ id: 'doc', duplicate_of: 'news' }, { id: 'news', duplicate_of: null }], { secondary: 'news', primary: 'doc' }],
      [[{ id: 'news', duplicate_of: null }], { secondary: 'doc', primary: 'news' }],
      [[{ id: 'news', duplicate_of: null }], { secondary: 'news', primary: 'news' }],
    ] as const) {
      const db = database([...rows])
      expect(await linkDuplicate(db, link)).toBe(false)
      expect(db.ran('regulations', 'update')).toEqual([])
    }
  })
})

describe('analyses prepared ahead', () => {
  const database = (versions: unknown[], matched: unknown[]) =>
    fakeClient(q => {
      if (q.table === 'regulations') return { data: versions }
      if (q.table === 'regulation_relevance') return { data: matched }
    })

  it('skips a later version whose first version is already matched to the firm', async () => {
    const db = database([{ id: 'doc', duplicate_of: 'news' }, { id: 'doc-2', duplicate_of: 'rejected-news' }], [{ regulation_id: 'news' }])
    expect(await withoutCoveredDuplicates(db, 'firm-1', ['doc', 'doc-2', 'plain'])).toEqual(['doc-2', 'plain'])
    const [lookup] = db.ran('regulation_relevance')
    expect(hasFilter(lookup, 'eq', 'firm_id', 'firm-1')).toBe(true)
    expect(hasFilter(lookup, 'in', 'regulation_id', ['news', 'rejected-news'])).toBe(true)
    // A first version the firm's matcher rejected covers nothing.
    expect(hasFilter(lookup, 'not', 'relevance_reason', 'like', 'NOT_RELEVANT:%')).toBe(true)
  })

  it('asks nothing further when none of them is a later version', async () => {
    const db = database([], [])
    expect(await withoutCoveredDuplicates(db, 'firm-1', ['a', 'b'])).toEqual(['a', 'b'])
    expect(db.ran('regulation_relevance')).toEqual([])
  })

  it('queues an analysis for the rest only, but a forced refresh covers every version', async () => {
    setClient(database([{ id: 'doc', duplicate_of: 'news' }], [{ regulation_id: 'news' }]))
    const { queued } = stubModel({})
    await generateImpacts(['doc', 'plain'], 'firm-1')
    expect(queued.map(q => q.regulationId)).toEqual(['plain'])

    await generateImpacts(['doc', 'plain'], 'firm-1', 8, { force: true })
    expect(queued.map(q => q.regulationId)).toEqual(['plain', 'doc', 'plain'])
  })
})
