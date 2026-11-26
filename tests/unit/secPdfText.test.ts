import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isReadable, pdfText, tidy } from '../../supabase/functions/_shared/pdfText'
import { fakeClient, hasFilter, setClient, type Query } from './helpers/fakeSupabase'
import { answerFields, jsonResponse, loadHandler, post, stubFetch, toolAnswer } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'

// Two PDFs made for these tests (tests/unit/fixtures): an SEC-style order
// with a text layer over two pages, and a page with only a drawn shape, as
// a scan has no text layer.
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name))
const TEXT_PDF = fixture('sec-order-text.pdf')
const SCANNED_PDF = fixture('sec-order-scanned.pdf')

describe('pdfText', () => {
  it('reads each page of a PDF with a text layer', async () => {
    const read = await pdfText(TEXT_PDF)
    expect(read?.readable).toBe(true)
    expect(read?.pages).toHaveLength(2)
    expect(read?.pages[0]).toContain('In the Matter of\nHarbor Peak Advisers LLC,')
    expect(read?.pages[1]).toContain('civil money penalty in the amount of $400,000')
  })

  it('finds nothing readable in a scan', async () => {
    const read = await pdfText(SCANNED_PDF)
    expect(read).toEqual({ pages: [''], readable: false })
  })

  it('gives null for a file that is not a PDF (an error page)', async () => {
    expect(await pdfText(new TextEncoder().encode('<html>Request Rate Threshold Exceeded</html>'))).toBeNull()
  })

  it('leaves the bytes it was given usable', async () => {
    const bytes = new Uint8Array(TEXT_PDF).buffer
    await pdfText(bytes)
    expect(bytes.byteLength).toBe(TEXT_PDF.byteLength)
  })

  it('counts a stamp or a page number as no text', () => {
    expect(isReadable(['Page 1', 'Page 2'])).toBe(false)
    expect(isReadable(['x'.repeat(250)])).toBe(false)
    expect(isReadable(['x'.repeat(350)])).toBe(true)
    // A long order needs real text throughout, up to 2,000 letters.
    expect(isReadable(Array(30).fill('x'.repeat(40)))).toBe(false)
  })

  it('closes up spaces and keeps lines', () => {
    expect(tidy('  In the   Matter of \n\n\n\n Respondent. ')).toBe('In the Matter of\n\nRespondent.')
  })
})

const FEED = `<rss><channel>
<item><title>Harbor Peak Advisers LLC</title><link>https://www.sec.gov/files/litigation/admin/2026/ia-9001.pdf</link><pubDate>Fri, 20 Nov 2026 12:00:00 -0500</pubDate><dc:creator>IA-9001</dc:creator></item>
<item><title>Scanned Respondent</title><link>https://www.sec.gov/files/litigation/admin/2026/34-9002.pdf</link><pubDate>Fri, 20 Nov 2026 12:00:00 -0500</pubDate><dc:creator>34-9002</dc:creator></item>
</channel></rss>`

type Row = { external_id: string; summary: string; raw: { narrative_text: string | null } }

async function sync(opts: { headline?: () => Response; missing?: Record<string, unknown>[]; feed?: string } = {}) {
  const db = fakeClient((q: Query) => {
    if (q.table === 'regulations' && q.op === 'select') {
      const backfillQuery = q.filters.some(f => f[0] === 'is')
      return { data: backfillQuery ? (opts.missing ?? []) : [] }
    }
  })
  setClient(db)
  const { handler } = await loadHandler('sync-sec-admin-proceedings')
  const model: { model: string; tool: string; body: any }[] = []
  stubFetch((url, init) => {
    if (url.pathname.endsWith('/administrative-proceedings/rss')) return new Response(opts.feed ?? FEED)
    if (url.pathname.endsWith('.pdf')) return new Response(url.pathname.includes('34-') ? SCANNED_PDF : TEXT_PDF)
    if (url.hostname === 'api.anthropic.com') {
      const body = JSON.parse(init!.body as string)
      const tool = body.tool_choice?.name ?? (answerFields(body).includes('narrative_text') ? 'submit_extraction' : 'submit_headline')
      model.push({ model: body.model, tool, body })
      if (tool === 'submit_headline' && opts.headline) return opts.headline()
      const input = tool === 'submit_headline' ? { headline: 'Settled order: adviser charged undisclosed monitoring fees.' } : { headline: 'Scanned order headline.', narrative_text: 'Text Sonnet read from the scan.' }
      return toolAnswer(body, tool, input)
    }
  })
  const res = await handler(post('sync-sec-admin-proceedings', { token: SERVICE_KEY }))
  const rows = db.ran('regulations', 'upsert').flatMap(u => u.payload as Row[])
  return { res, body: await res.json(), db, rows, model }
}

describe('sync-sec-admin-proceedings reads PDFs in code first', () => {
  it('keeps the text of a PDF with a text layer and asks Haiku only for the headline', async () => {
    const { rows, model } = await sync()
    const order = rows.find(r => r.external_id === 'IA-9001')!
    expect(order.raw.narrative_text).toContain('Harbor Peak Advisers LLC')
    expect(order.raw.narrative_text).toContain('$400,000')
    expect(order.summary).toBe('Settled order: adviser charged undisclosed monitoring fees.')
    const headline = model.filter(m => m.tool === 'submit_headline')
    expect(headline).toHaveLength(1)
    expect(headline[0].model).toBe('claude-haiku-4-5')
    // The text is fenced, and no PDF is attached.
    expect(JSON.stringify(headline[0].body.messages)).toContain('<untrusted_content source=\\"SEC administrative proceeding\\">')
    expect(JSON.stringify(headline[0].body.messages)).not.toContain('"document"')
  })

  it('sends only a scan to Sonnet, as a PDF', async () => {
    const { rows, model } = await sync()
    const sonnet = model.filter(m => m.tool === 'submit_extraction')
    expect(sonnet).toHaveLength(1)
    expect(sonnet[0].model).toBe('claude-sonnet-5-5')
    expect(sonnet[0].body.messages[0].content[0].type).toBe('document')
    expect(rows.find(r => r.external_id === '34-9002')!.raw.narrative_text).toBe('Text Sonnet read from the scan.')
  })

  it('stores the text even when the headline call fails', async () => {
    const { rows } = await sync({ headline: () => jsonResponse({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }, 400) })
    const order = rows.find(r => r.external_id === 'IA-9001')!
    expect(order.summary).toBe('Harbor Peak Advisers LLC')
    expect(order.raw.narrative_text).toContain('Harbor Peak Advisers LLC')
  })

  it('fills in stored orders with no text from the text layer, and marks a scan so it is not tried again, never sending it to Sonnet', async () => {
    const missing = [
      { id: 'old-text', source_url: 'https://www.sec.gov/files/litigation/admin/2026/ia-7036.pdf', summary: 'Old Respondent', raw: { order_number: 'IA-7036', narrative_text: null } },
      { id: 'old-scan', source_url: 'https://www.sec.gov/files/litigation/admin/2026/34-106906.pdf', summary: 'Scanned', raw: { order_number: '34-106906', narrative_text: null } },
    ]
    const { db, body, model } = await sync({ missing, feed: '<rss><channel></channel></rss>' })
    const [lookup] = db.ran('regulations', 'select').filter(q => q.filters.some(f => f[0] === 'is'))
    expect(hasFilter(lookup, 'is', 'raw->>narrative_text', null)).toBe(true)
    expect(hasFilter(lookup, 'is', 'raw->>text_layer', null)).toBe(true)
    const updates = db.ran('regulations', 'update')
    const text = updates.find(u => hasFilter(u, 'eq', 'id', 'old-text'))!.payload as { raw: Row['raw'] & { order_number: string }; summary: string }
    expect(text.raw.order_number).toBe('IA-7036')
    expect(text.raw.narrative_text).toContain('Harbor Peak Advisers LLC')
    expect(text.summary).toBe('Settled order: adviser charged undisclosed monitoring fees.')
    const scan = updates.find(u => hasFilter(u, 'eq', 'id', 'old-scan'))!.payload
    expect(scan).toEqual({ raw: { order_number: '34-106906', narrative_text: null, text_layer: false } })
    expect(model.filter(m => m.tool === 'submit_extraction')).toHaveLength(0)
    expect(body).toMatchObject({ new: 0, filled: 1 })
  })
})
