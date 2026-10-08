import type { PublishedVersion, Regulation } from './types'

// One development, one card (roadmap item 15). The same development can be
// stored more than once: an agency's announcement and the Federal Register
// document that follows, the EU Decision and Regulation for one sanctions
// action. A later version points at the first through `duplicate_of`
// (supabase/functions/_shared/duplicates.ts). Here a list is reduced to one
// card per development, each carrying its other versions as links.

// A later version is listed under its first version when that one is in the
// same list, and not at all when the user dismissed the first version.
// Where the first version isn't matched to this entity, the later one is
// the card and links back to it.
//
// One exception (roadmap 16b.1): an agency's announcement gives way to the
// official document published for it. Once a Federal Register document it
// announced is in the list, that document is the card (its analysis is
// written from the official text) and the announcement is its link. An
// announcement of two rules becomes two cards, one per rule. Until a
// document arrives, or where none was matched, the announcement stays.
export function collapseDuplicates<T extends Regulation>(
  items: T[],
  versions: PublishedVersion[],
  dismissed: ReadonlySet<string> = new Set(),
): (T & { also_published_as: PublishedVersion[] })[] {
  const listed = new Set(items.map(i => i.id))
  const sourceOf = new Map<string, string>([...versions, ...items].map(v => [v.id, v.source]))
  const supersedes = (item: Pick<Regulation, 'source' | 'duplicate_of'>) => isOfficialDocument(item.source) && !!item.duplicate_of && isAnnouncement(sourceOf.get(item.duplicate_of))
  // Official documents each announcement was followed by, matched here or not.
  const documentsOf = (id: string) => versions.filter(v => v.duplicate_of === id && isOfficialDocument(v.source))

  const hidden = (item: T): boolean => {
    // An announcement whose document is listed, or was dismissed.
    if (isAnnouncement(item.source) && documentsOf(item.id).some(d => listed.has(d.id) || dismissed.has(d.id))) return true
    if (!item.duplicate_of) return false
    if (dismissed.has(item.duplicate_of)) return true
    return listed.has(item.duplicate_of) && !supersedes(item)
  }
  return items.filter(item => !hidden(item)).map(item => ({ ...item, also_published_as: versionsOf(item, versions) }))
}

// Agencies' own announcements, which a Federal Register document follows.
const ANNOUNCEMENT_SOURCES = new Set(['sec_news', 'ftc_news', 'cfpb_news'])
export const isAnnouncement = (source: string | undefined) => !!source && ANNOUNCEMENT_SOURCES.has(source)
export const isOfficialDocument = (source: string | undefined) => source === 'federal_register'

// The other versions of one item: the ones that point at it, and the one it
// points at. Earliest first. A company scan's result is never offered as a
// link: it points at whatever page the scan happened to find the rule on
// (often a law firm's summary), for some company's scan, not at a
// publication of it.
export function versionsOf(item: Pick<Regulation, 'id' | 'duplicate_of'>, versions: PublishedVersion[]): PublishedVersion[] {
  const seen = new Set<string>([item.id])
  return versions
    .filter(v => v.duplicate_of === item.id || v.id === item.duplicate_of)
    .filter(v => v.source !== 'ai_search')
    .filter(v => (seen.has(v.id) ? false : (seen.add(v.id), true)))
    .sort((a, b) => (a.published_date ?? '').localeCompare(b.published_date ?? ''))
}

const SOURCE_NAMES: Record<string, string> = {
  federal_register: 'Federal Register',
  sec_news: 'SEC announcement',
  ftc_news: 'FTC announcement',
  cfpb_news: 'CFPB announcement',
  sec_enforcement: 'SEC litigation release',
  sec_admin_proceedings: 'SEC administrative proceeding',
  finra_enforcement: 'FINRA',
  state_travel_advisories: 'State Department',
  fca_publications: 'FCA',
  pra_publications: 'Bank of England (PRA)',
  uk_legislation: 'legislation.gov.uk',
  uk_sanctions: 'legislation.gov.uk',
  ofsi: 'OFSI',
  esma_news: 'ESMA',
  eur_lex: 'EUR-Lex',
  eu_sanctions: 'EUR-Lex',
}

// Where a version was published, as a short name: the source RegWay took it
// from, or the site a company scan found it on.
export function publisherName(version: Pick<PublishedVersion, 'source' | 'source_url'>): string {
  const named = SOURCE_NAMES[version.source]
  if (named) return named
  try {
    return new URL(version.source_url).hostname.replace(/^www\./, '')
  } catch {
    return 'Other source'
  }
}
