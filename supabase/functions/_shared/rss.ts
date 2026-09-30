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

export function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  for (const block of xml.split('<item>').slice(1)) {
    const field = (tag: string) => block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim()
    const rawTitle = field('title')
    const link = field('link')?.split('\n')[0].trim()
    const pubDate = field('pubDate')
    if (!rawTitle || !link || !pubDate) continue
    // Some feeds (e.g. FINRA's newsreleases) wrap the title in an <a> tag and
    // HTML-entity-encode ampersands in it.
    const title = rawTitle
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .trim()
    const rawDescription = field('description') ?? ''
    const description = rawDescription
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    items.push({ title, link, pubDate, creator: field('dc:creator') ?? '', description })
  }
  return items
}
