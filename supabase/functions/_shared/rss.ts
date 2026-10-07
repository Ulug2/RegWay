// Minimal RSS <item> parser shared by the SEC/FINRA enforcement syncs. Real
// feeds, not an XML-schema-general parser — regex-based on purpose, since
// these feeds are simple and stable and a full XML parser is unnecessary
// weight for an edge function.

export interface FeedItem {
  title: string
  link: string
  pubDate: string
  // `dc:creator` where the feed uses it as a release/order number (SEC); empty
  // string where the feed doesn't provide one (FINRA's newsreleases feed).
  creator: string
  // Plain-text (HTML stripped) of <description>, where present.
  description: string
}

const NAMED_ENTITIES: Record<string, string> = { nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>' }

// Decodes the HTML entities feeds use in titles/descriptions (&#8220;,
// &#x2019;, &quot;, ...). `&amp;` goes last so "&amp;#8220;" isn't decoded twice.
const decodeEntities = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&(nbsp|quot|apos|lt|gt);/g, (_, name) => NAMED_ENTITIES[name])
    .replace(/&amp;/g, '&')

// A CDATA section's content is literal text; left wrapped, the tag stripper
// below reads "<![CDATA[Do not travel<p>" as one tag and drops the opening
// words (State Department advisories wrap every description this way).
const unwrapCdata = (s: string | undefined) => s?.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim()

export function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  for (const block of xml.split('<item>').slice(1)) {
    const field = (tag: string) => unwrapCdata(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim())
    const rawTitle = field('title')
    const link = field('link')?.split('\n')[0].trim()
    const pubDate = field('pubDate')
    if (!rawTitle || !link || !pubDate) continue
    // Some feeds (e.g. FINRA's newsreleases) wrap the title in an <a> tag and
    // HTML-entity-encode ampersands in it.
    // Decoded before tags are stripped: some feeds escape their HTML
    // (&lt;p&gt;), which only becomes a strippable tag once decoded.
    const title = decodeEntities(rawTitle).replace(/<[^>]+>/g, '').trim()
    const rawDescription = field('description') ?? ''
    const description = decodeEntities(rawDescription)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    items.push({ title, link, pubDate, creator: field('dc:creator') ?? '', description })
  }
  return items
}

// ---------------------------------------------------------------------------
// Any regulator feed: RSS 2.0 <item> or Atom <entry>, with whatever date
// format the publisher chose. Used by sync-regulator-feeds.
// ---------------------------------------------------------------------------

export interface FeedEntry {
  title: string
  link: string
  // The day the publisher put on the entry, as written ("YYYY-MM-DD"); null
  // when none can be read.
  date: string | null
  // Plain text of <description> / <summary>.
  description: string
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const iso = (year: string, month: number, day: string) => `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`

// The calendar day written in a date string, in the publisher's own time
// zone: "Tue, 06 Oct 2026 00:00:00 +0200" is October 6, though it is still
// October 5 in UTC. Handles RFC 822 ("06 Oct 2026"), ISO ("2026-10-06T…")
// and long form ("Tuesday, October 6, 2026 - 10:00", the FCA's).
export function writtenDate(text: string | null | undefined): string | null {
  if (!text) return null
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  const dayFirst = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/)
  if (dayFirst && MONTHS.includes(dayFirst[2].toLowerCase())) return iso(dayFirst[3], MONTHS.indexOf(dayFirst[2].toLowerCase()) + 1, dayFirst[1])
  const monthFirst = text.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (monthFirst && MONTHS.includes(monthFirst[1].toLowerCase())) return iso(monthFirst[3], MONTHS.indexOf(monthFirst[1].toLowerCase()) + 1, monthFirst[2])
  return null
}

const plain = (raw: string) =>
  decodeEntities(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Atom carries several <link>s per entry: the page itself is the one with no
// `rel`, or `rel="alternate"` as HTML; never `rel="self"` (the feed's id).
function atomLink(block: string): string | undefined {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/g)].map(m => m[1])
  const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
  const page = links.find(a => !attr(a, 'rel') && attr(a, 'href')) ?? links.find(a => attr(a, 'rel') === 'alternate' && (attr(a, 'type') ?? 'text/html') === 'text/html')
  return page ? decodeEntities(attr(page, 'href')!) : undefined
}

export function parseFeedEntries(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = []
  for (const block of xml.split(/<(?:item|entry)(?=[\s>])/).slice(1)) {
    const field = (tag: string) => unwrapCdata(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1]?.trim())
    const rawTitle = field('title')
    const link = field('link')?.split('\n')[0].trim() || atomLink(block)
    if (!rawTitle || !link) continue
    const rawDescription = field('description') ?? field('summary') ?? ''
    // Some feeds (ESMA) carry no date field, only a <time datetime="…"> in
    // the (escaped) description.
    const date =
      writtenDate(field('pubDate') ?? field('updated') ?? field('published') ?? field('dc:date')) ??
      writtenDate(decodeEntities(rawDescription).match(/datetime="([^"]+)"/)?.[1])
    entries.push({ title: plain(rawTitle), link, date, description: plain(rawDescription) })
  }
  return entries
}
