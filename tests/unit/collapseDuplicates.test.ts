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

// Two listings of one FCA bulletin: neither is an announcement of the other.
const bulletin = reg('gc', { source: 'fca_publications', published_date: '2026-09-30' })
const bulletinAgain = reg('fg', { source: 'fca_publications', duplicate_of: 'gc', published_date: '2026-09-30' })
const fca = [bulletin, bulletinAgain].map(asVersion)

describe('one card per development', () => {
  it('lists a later version under the first version when it is in the same list', () => {
    const cards = collapseDuplicates([bulletinAgain, bulletin, other], fca)
    expect(cards.map(c => c.id)).toEqual(['gc', 'other'])
    expect(cards[0].also_published_as.map(v => v.id)).toEqual(['fg'])
    expect(cards[1].also_published_as).toEqual([])
  })

  it('keeps a later version as its own card where the first version is not listed, linking back to it', () => {
    const cards = collapseDuplicates([bulletinAgain], fca)
    expect(cards.map(c => c.id)).toEqual(['fg'])
    expect(cards[0].also_published_as.map(v => v.id)).toEqual(['gc'])
  })

  it('hides a later version when the first version was dismissed', () => {
    expect(collapseDuplicates([bulletinAgain, other], fca, new Set(['gc'])).map(c => c.id)).toEqual(['other'])
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

describe('an announcement and the official documents published for it', () => {
  it('is the card, with links to the documents, until one of them is matched', () => {
    const cards = collapseDuplicates([news, other], all)
    expect(cards.map(c => c.id)).toEqual(['news', 'other'])
    // The documents exist and are linked, matched to this entity or not.
    expect(cards[0].also_published_as.map(v => v.id)).toEqual(['doc-a', 'doc-b'])
  })

  it('gives way to the official document once it is in the list', () => {
    const cards = collapseDuplicates([news, docA, other], all)
    expect(cards.map(c => c.id)).toEqual(['doc-a', 'other'])
    expect(cards[0].also_published_as.map(v => v.id)).toEqual(['news'])
  })

  it('becomes one card per rule when it announced two', () => {
    const cards = collapseDuplicates([docB, docA, news], all)
    expect(cards.map(c => c.id)).toEqual(['doc-b', 'doc-a'])
    for (const card of cards) expect(card.also_published_as.map(v => v.id)).toEqual(['news'])
  })

  it('stays hidden behind a document the user dismissed, while the other rule it announced stays', () => {
    // doc-a was dismissed (so it is no longer listed); the announcement must not come back.
    expect(collapseDuplicates([news, docB], all, new Set(['doc-a'])).map(c => c.id)).toEqual(['doc-b'])
    expect(collapseDuplicates([news], all, new Set(['doc-a'])).map(c => c.id)).toEqual([])
  })

  it('keeps later documents hidden when the announcement itself was dismissed', () => {
    expect(collapseDuplicates([docA, other], all, new Set(['news'])).map(c => c.id)).toEqual(['other'])
  })

  it("hides a scan's copy that points at the announcement along with it", () => {
    const scanned = reg('scan', { source: 'ai_search', duplicate_of: 'news' })
    expect(collapseDuplicates([news, docA, scanned], [...all, asVersion(scanned)]).map(c => c.id)).toEqual(['doc-a'])
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
