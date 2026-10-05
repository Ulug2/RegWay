import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders headings, emphasis, lists and links', () => {
    const html = renderMarkdown('## Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\nSee https://www.sec.gov/rules.')
    expect(html).toContain('<h2')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<a href="https://www.sec.gov/rules" target="_blank" rel="noreferrer">https://www.sec.gov/rules</a>.')
  })

  it('escapes raw HTML in the model output', () => {
    const html = renderMarkdown('Hello <img src=x onerror=alert(1)> <script>alert(1)</script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not let a quote in a URL break out of the href attribute', () => {
    const html = renderMarkdown('Source: https://example.com/"onmouseover="alert(1)//x')
    // The whole URL stays inside one href value; no second attribute appears.
    expect(html).toContain('<a href="https://example.com/&quot;onmouseover=&quot;alert(1)//x" target="_blank" rel="noreferrer">')
    expect(html).not.toMatch(/"\s*onmouseover=/)
  })

  it('leaves underscores inside URLs and code alone', () => {
    const html = renderMarkdown('`snake_case_name` and https://example.com/a_b_c')
    expect(html).toContain('<code>snake_case_name</code>')
    expect(html).toContain('href="https://example.com/a_b_c"')
    expect(html).not.toContain('<em>')
  })

  it('tolerates an unclosed code fence while a reply is still streaming', () => {
    const html = renderMarkdown('Here:\n```ts\nconst a = 1')
    expect(html).toContain('const a = 1')
    expect(html).toContain('<pre')
  })
})
