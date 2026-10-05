import { describe, expect, it, vi } from 'vitest'
import { fetchPlainText, stripHtml } from '../../supabase/functions/_shared/text.ts'
import { federalRegisterTextUrls } from '../../supabase/functions/_shared/federalRegister.ts'

const LONG = 'The Department is amending its regulations. '.repeat(20)

// A Response-like object: `redirected` and `url` can't be set on a real one.
const response = (body: string, init: { status?: number; url?: string; redirected?: boolean } = {}) => ({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  url: init.url ?? 'https://example.test/doc',
  redirected: init.redirected ?? false,
  text: async () => body,
  body: { cancel: async () => {} },
})

const stubFetch = (handler: (url: string) => unknown) => {
  const fetchMock = vi.fn(async (url: string) => handler(url))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('stripHtml', () => {
  it('removes tags, scripts and styles, and decodes common entities', () => {
    expect(stripHtml('<style>p{}</style><p>Smith &amp; Co&#39;s&nbsp;&quot;rule&quot;</p><script>alert(1)</script>')).toBe('Smith & Co\'s "rule"')
  })
})

describe('fetchPlainText', () => {
  it('returns plain text as is', async () => {
    stubFetch(() => response(LONG))
    expect(await fetchPlainText(['https://a.test/doc.txt'])).toBe(LONG)
  })

  // Federal Register serves ".txt" as an HTML page with the text in <pre>.
  it('strips HTML whatever the URL extension says', async () => {
    stubFetch(() => response(`<html><body><pre>${LONG}</pre></body></html>`))
    expect(await fetchPlainText(['https://a.test/doc.txt'])).toBe(LONG.trim())
  })

  it('moves to the next URL, without retrying, when redirected to the CAPTCHA page', async () => {
    const fetchMock = stubFetch(url =>
      url.includes('federalregister')
        ? response('<html>Request Access</html>'.repeat(50), { redirected: true, url: 'https://unblock.federalregister.gov/' })
        : response(LONG),
    )
    const doc = { document_number: '2026-19001', publication_date: '2026-10-02', html_url: 'https://www.federalregister.gov/d/2026-19001' }
    expect(await fetchPlainText(federalRegisterTextUrls(doc))).toBe(LONG)
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual([
      'https://www.federalregister.gov/documents/full_text/text/2026/10/02/2026-19001.txt',
      'https://www.govinfo.gov/content/pkg/FR-2026-10-02/html/2026-19001.htm',
    ])
  })

  it('retries a failing URL once before moving on', async () => {
    const fetchMock = stubFetch(url => (url === 'https://a.test/1' ? response('', { status: 503 }) : response(LONG)))
    expect(await fetchPlainText(['https://a.test/1', 'https://a.test/2'])).toBe(LONG)
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual(['https://a.test/1', 'https://a.test/1', 'https://a.test/2'])
  })

  it('retries once after a network error', async () => {
    let calls = 0
    stubFetch(() => {
      if (calls++ === 0) throw new Error('timeout')
      return response(LONG)
    })
    expect(await fetchPlainText(['https://a.test/1'])).toBe(LONG)
    expect(calls).toBe(2)
  })

  it('treats a too-short body as not the document', async () => {
    const fetchMock = stubFetch(url => (url === 'https://a.test/1' ? response('Not found') : response(LONG)))
    expect(await fetchPlainText(['https://a.test/1', 'https://a.test/2'])).toBe(LONG)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await fetchPlainText(['https://a.test/1'])).toBe('')
    expect(await fetchPlainText(['https://a.test/1'], { minLength: 5 })).toBe('Not found')
  })

  it('skips missing URLs and returns an empty string when nothing is readable', async () => {
    const fetchMock = stubFetch(() => response('', { status: 404 }))
    expect(await fetchPlainText([undefined, 'https://a.test/1'])).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await fetchPlainText([])).toBe('')
  })
})

describe('federalRegisterTextUrls', () => {
  it("orders Federal Register's text, then GovInfo, then the HTML page", () => {
    expect(federalRegisterTextUrls({ document_number: 'C1-2026-18574', publication_date: '2026-09-30', html_url: 'https://fr.test/doc' })).toEqual([
      'https://www.federalregister.gov/documents/full_text/text/2026/09/30/C1-2026-18574.txt',
      'https://www.govinfo.gov/content/pkg/FR-2026-09-30/html/C1-2026-18574.htm',
      'https://fr.test/doc',
    ])
  })

  it('omits the HTML page when there is none', () => {
    expect(federalRegisterTextUrls({ document_number: '2026-1', publication_date: '2026-01-02' })).toHaveLength(2)
  })
})
