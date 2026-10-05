import { describe, expect, it } from 'vitest'
import { parseRssItems } from '../../supabase/functions/_shared/rss.ts'

const feed = (...items: string[]) => `<?xml version="1.0"?><rss><channel><title>Feed</title>${items.join('')}</channel></rss>`

describe('parseRssItems', () => {
  it('reads title, link, date, creator and a plain-text description', () => {
    const [item] = parseRssItems(
      feed(`<item>
        <title>SEC Charges Adviser &amp; Its Owner</title>
        <link>https://www.sec.gov/litigation/lr-1</link>
        <pubDate>Thu, 01 Oct 2026 12:00:00 -0400</pubDate>
        <dc:creator>LR-26001</dc:creator>
        <description>&lt;p&gt;The adviser &#8220;misled&#8221; investors.&lt;/p&gt;</description>
      </item>`),
    )
    expect(item).toEqual({
      title: 'SEC Charges Adviser & Its Owner',
      link: 'https://www.sec.gov/litigation/lr-1',
      pubDate: 'Thu, 01 Oct 2026 12:00:00 -0400',
      creator: 'LR-26001',
      description: 'The adviser “misled” investors.',
    })
  })

  // State Department advisories: without unwrapping, "<![CDATA[Do not travel<p>"
  // was stripped as one tag and the summary lost its opening words.
  it('keeps the opening words of a CDATA-wrapped description', () => {
    const [item] = parseRssItems(
      feed(`<item><title>Mali - Level 4: Do Not Travel</title><link>https://travel.state.gov/mali</link><pubDate>Fri, 02 Oct 2026 00:00:00 GMT</pubDate>
        <description><![CDATA[Do not travel<p>to Mali due to <b>crime</b> and terrorism.</p>]]></description></item>`),
    )
    expect(item.description).toBe('Do not travel to Mali due to crime and terrorism.')
  })

  it('strips a link wrapped around the title (FINRA)', () => {
    const [item] = parseRssItems(
      feed(`<item><title><a href="/x">FINRA Fines Firm &amp; Rep</a></title><link>https://finra.org/x</link><pubDate>Fri, 02 Oct 2026 00:00:00 GMT</pubDate></item>`),
    )
    expect(item.title).toBe('FINRA Fines Firm & Rep')
    expect(item.creator).toBe('')
    expect(item.description).toBe('')
  })

  it('decodes an entity once, not twice', () => {
    const [item] = parseRssItems(feed(`<item><title>Q&amp;amp;A on &amp;#8220;fees&amp;#8221;</title><link>https://x.test</link><pubDate>Fri, 02 Oct 2026</pubDate></item>`))
    expect(item.title).toBe('Q&amp;A on &#8220;fees&#8221;')
  })

  it('skips items missing a title, link or date, and keeps the rest', () => {
    const items = parseRssItems(
      feed(
        `<item><title>No link</title><pubDate>Fri, 02 Oct 2026</pubDate></item>`,
        `<item><title>Complete</title><link>https://x.test/ok</link><pubDate>Fri, 02 Oct 2026</pubDate></item>`,
        `<item><link>https://x.test/untitled</link><pubDate>Fri, 02 Oct 2026</pubDate></item>`,
      ),
    )
    expect(items.map(i => i.title)).toEqual(['Complete'])
  })

  it('returns nothing for a feed with no items', () => {
    expect(parseRssItems(feed())).toEqual([])
    expect(parseRssItems('<html>Access denied</html>')).toEqual([])
  })
})
