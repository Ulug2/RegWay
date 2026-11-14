import { describe, expect, it } from 'vitest'
import { parseFeedEntries, parseRssItems, writtenDate } from '../../supabase/functions/_shared/rss.ts'

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

  // A feed that encodes its text twice used to show "&amp;" and "&nbsp;"
  // on the card (an FCA summary read "These include:&nbsp;Guidance").
  it('decodes text a feed encoded twice', () => {
    const [item] = parseRssItems(feed(`<item><title>Q&amp;amp;A on &amp;#8220;fees&amp;#8221;</title><link>https://x.test</link><pubDate>Fri, 02 Oct 2026</pubDate><description>These include:&amp;nbsp;Guidance focused on &amp;lt;b&amp;gt;fees&amp;lt;/b&amp;gt;</description></item>`))
    expect(item.title).toBe('Q&A on \u201cfees\u201d')
    expect(item.description).toBe('These include: Guidance focused on fees')
  })

  it('keeps an ampersand that is text, decoded once', () => {
    const [item] = parseRssItems(feed(`<item><title>Mergers &amp; Acquisitions: 5 &lt; 6</title><link>https://x.test</link><pubDate>Fri, 02 Oct 2026</pubDate></item>`))
    expect(item.title).toBe('Mergers & Acquisitions: 5 < 6')
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

describe('parseFeedEntries', () => {
  it('reads an RSS item, keeping the day as the publisher wrote it', () => {
    const [entry] = parseFeedEntries(
      feed(`<item>
        <title>CELEX:32026R2202: Regulation (EU) 2026/2202 &amp; more</title>
        <description/>
        <link>https://eur-lex.europa.eu/./legal-content/AUTO/?uri=CELEX:32026R2202</link>
        <pubDate>Tue, 06 Oct 2026 00:00:00 +0200</pubDate>
      </item>`),
    )
    // Midnight in Brussels is still the 5th in UTC.
    expect(entry).toEqual({ title: 'CELEX:32026R2202: Regulation (EU) 2026/2202 & more', link: 'https://eur-lex.europa.eu/./legal-content/AUTO/?uri=CELEX:32026R2202', date: '2026-10-06', description: '' })
  })

  it('reads an Atom entry: the page link (not the feed id), the updated date, the summary', () => {
    const [entry] = parseFeedEntries(`<feed xmlns="http://www.w3.org/2005/Atom"><title>New legislation</title>
      <entry>
        <id>http://www.legislation.gov.uk/id/uksi/2026/1065</id>
        <title>The Employment Rights Act 2025 (Commencement No. 6) Regulations 2026</title>
        <link rel="self" href="http://www.legislation.gov.uk/id/uksi/2026/1065"/>
        <link href="http://www.legislation.gov.uk/uksi/2026/1065/made"/>
        <link rel="alternate" type="application/xml" href="http://www.legislation.gov.uk/uksi/2026/1065/made/data.xml" title="XML"/>
        <updated>2026-10-06T07:32:41+01:00</updated>
        <summary>These Regulations bring into force certain provisions.</summary>
      </entry></feed>`)
    expect(entry).toEqual({
      title: 'The Employment Rights Act 2025 (Commencement No. 6) Regulations 2026',
      link: 'http://www.legislation.gov.uk/uksi/2026/1065/made',
      date: '2026-10-06',
      description: 'These Regulations bring into force certain provisions.',
    })
  })

  it('takes the HTML alternate link when an Atom entry has no plain one', () => {
    const [entry] = parseFeedEntries(`<feed><entry><title>Guidance: Iran sanctions</title><updated>2026-10-01T09:28:10Z</updated>
      <link rel="alternate" type="text/html" href="https://www.gov.uk/government/publications/iran"/></entry></feed>`)
    expect(entry.link).toBe('https://www.gov.uk/government/publications/iran')
  })

  it('finds the date in the description when the feed has no date field (ESMA)', () => {
    const [entry] = parseFeedEntries(
      feed(`<item><title>ESMA consults on disclosure requirements</title><link>https://www.esma.europa.eu/x</link>
        <description>&lt;span&gt;&lt;time datetime="2026-09-30T15:25:31+02:00" class="datetime"&gt;30 September 2026&lt;/time&gt;&lt;/span&gt; &lt;p&gt;ESMA is consulting.&lt;/p&gt;</description></item>`),
    )
    expect(entry.date).toBe('2026-09-30')
    expect(entry.description).toBe('30 September 2026 ESMA is consulting.')
  })

  it('leaves the date empty when none can be read, and skips entries with no title or link', () => {
    const entries = parseFeedEntries(feed('<item><title>No date</title><link>https://x.test/a</link></item>', '<item><title>No link</title></item>'))
    expect(entries).toEqual([{ title: 'No date', link: 'https://x.test/a', date: null, description: '' }])
  })
})

describe('writtenDate', () => {
  it.each([
    ['Tue, 06 Oct 2026 10:37:55 -0400', '2026-10-06'],
    ['30 Sep 2026 13:00:00 -0400', '2026-09-30'],
    ['Tuesday, October 6, 2026 - 10:00', '2026-10-06'],
    ['2026-10-01T09:28:10Z', '2026-10-01'],
    ['Fri, 2 Oct 2026 20:00:00 GMT', '2026-10-02'],
    ['soon', null],
    ['', null],
  ])('%s', (text, day) => {
    expect(writtenDate(text)).toBe(day)
  })
})
