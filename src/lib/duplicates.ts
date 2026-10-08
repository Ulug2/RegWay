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
export function collapseDuplicates<T extends Regulation>(
  items: T[],
  versions: PublishedVersion[],
  dismissed: ReadonlySet<string> = new Set(),
): (T & { also_published_as: PublishedVersion[] })[] {
  const listed = new Set(items.map(i => i.id))
  return items
    .filter(item => !item.duplicate_of || (!listed.has(item.duplicate_of) && !dismissed.has(item.duplicate_of)))
    .map(item => ({ ...item, also_published_as: versionsOf(item, versions) }))
}

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
