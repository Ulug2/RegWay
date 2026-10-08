import { describe, expect, it } from 'vitest'
import { collapseDuplicates, publisherName, versionsOf } from '../../src/lib/duplicates'
import type { PublishedVersion, Regulation } from '../../src/lib/types'

const reg = (id: string, over: Partial<Regulation> = {}): Regulation => ({
  id,
  source: 'federal_register',
  category: 'regulatory',
  countries: [],
  title: id,
  agency: null,
  jurisdiction: null,
  summary: null,
  published_date: '2026-10-06',
  effective_date: null,
  source_url: `https://example.test/${id}`,
  duplicate_of: null,
  ...over,
})

const asVersion = (r: Regulation): PublishedVersion => ({ id: r.id, source: r.source, title: r.title, agency: r.agency, published_date: r.published_date, source_url: r.source_url, duplicate_of: r.duplicate_of ?? null })

// An SEC announcement and the two Federal Register documents published for it.
const news = reg('news', { source: 'sec_news', published_date: '2026-09-30' })
const docA = reg('doc-a', { duplicate_of: 'news', published_date: '2026-10-05' })
const docB = reg('doc-b', { duplicate_of: 'news', published_date: '2026-10-06' })
const other = reg('other')
const all = [news, docA, docB].map(asVersion)

describe('one card per development', () => {
  it('lists later versions under the first version when it is in the same list', () => {
    const cards = collapseDuplicates([docB, docA, news, other], all)
    expect(cards.map(c => c.id)).toEqual(['news', 'other'])
    expect(cards[0].also_published_as.map(v => v.id)).toEqual(['doc-a', 'doc-b'])
    expect(cards[1].also_published_as).toEqual([])
  })

  it('links to versions the entity was never matched to', () => {
    // Only the announcement was matched here; the documents still exist.
    expect(collapseDuplicates([news], all)[0].also_published_as.map(v => v.id)).toEqual(['doc-a', 'doc-b'])
  })

  it('keeps a later version as its own card where the first version is not listed, linking back to it', () => {
    const cards = collapseDuplicates([docA, docB], all)
    // Two documents announced together are two rules: each is a card.
    expect(cards.map(c => c.id)).toEqual(['doc-a', 'doc-b'])
    expect(cards[0].also_published_as.map(v => v.id)).toEqual(['news'])
  })

  it('hides a later version when the first version was dismissed', () => {
    expect(collapseDuplicates([docA, other], all, new Set(['news'])).map(c => c.id)).toEqual(['other'])
  })

  it("hides a company scan's copy of a document under the document, and never offers the scan's page as a link", () => {
    const document = reg('fr')
    const scanned = reg('scan', { source: 'ai_search', duplicate_of: 'fr', source_url: 'https://lawfirm.test/blog/summary' })
    const versions = [document, scanned].map(asVersion)
    const both = collapseDuplicates([scanned, document], versions)
    expect(both.map(c => c.id)).toEqual(['fr'])
    expect(both[0].also_published_as).toEqual([])
    // Where only the scan's copy is matched, it links to the document itself.
    expect(collapseDuplicates([scanned], versions)[0].also_published_as.map(v => v.id)).toEqual(['fr'])
  })

  it('leaves a list without duplicates as it is, in order', () => {
    expect(collapseDuplicates([other, news], []).map(c => c.id)).toEqual(['other', 'news'])
  })

  it('never lists an item as a version of itself, or one version twice', () => {
    expect(versionsOf(news, [...all, ...all]).map(v => v.id)).toEqual(['doc-a', 'doc-b'])
  })
})

describe('where a version was published', () => {
  it('names the source, or the site a company scan found it on', () => {
    expect(publisherName(asVersion(docA))).toBe('Federal Register')
    expect(publisherName(asVersion(news))).toBe('SEC announcement')
    expect(publisherName({ source: 'ai_search', source_url: 'https://www.sec.gov/rules-regulations/rulemaking-activity' })).toBe('sec.gov')
    expect(publisherName({ source: 'ai_search', source_url: 'not a link' })).toBe('Other source')
  })
})
