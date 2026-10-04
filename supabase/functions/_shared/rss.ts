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
