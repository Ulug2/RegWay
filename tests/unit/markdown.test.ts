import { describe, expect, it } from 'vitest'
import { renderMarkdown, renderMarkdownBlocks } from '../../src/lib/markdown'

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

describe('renderMarkdown: tables, code and nested lists', () => {
  it('renders a table with its alignment, inside a wrapper that scrolls', () => {
    const html = renderMarkdown('| Rule | Deadline |\n| :--- | ---: |\n| Form PF | **Mar 12** |\n| AIFMD II | Apr 16 |')
    expect(html).toContain('<div class="table-wrap"><table>')
    expect(html).toContain('<th style="text-align:left">Rule</th>')
    expect(html).toContain('<td style="text-align:right"><strong>Mar 12</strong></td>')
    expect(html.match(/<tr>/g)).toHaveLength(3)
  })

  it('leaves a line with a pipe alone when no table follows', () => {
    expect(renderMarkdown('A | B')).toBe('<p>A | B</p>')
  })

  it('escapes HTML inside table cells and code', () => {
    const html = renderMarkdown('| a |\n|---|\n| <img src=x> |\n\n```html\n<script>x</script>\n```')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
  })

  it('labels a code block with its language and gives it a copy button', () => {
    const html = renderMarkdown('```sql\nselect 1\n```')
    expect(html).toContain('<span>sql</span>')
    expect(html).toContain('data-copy-code')
    expect(html).toContain('<pre><code>select 1</code></pre>')
  })

  it('nests indented items, and keeps a numbered list numbered across a break', () => {
    expect(renderMarkdown('- one\n  - inner\n- two')).toBe('<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul>')
    expect(renderMarkdown('1. a\n\n2. b')).toBe('<ol><li>a</li></ol><ol start="2"><li>b</li></ol>')
  })

  it('renders named links, rules and strikethrough', () => {
    const html = renderMarkdown('See [the rule](https://www.sec.gov/a_b).\n\n---\n\n~~old~~')
    expect(html).toContain('<a href="https://www.sec.gov/a_b" target="_blank" rel="noreferrer">the rule</a>')
    expect(html).toContain('<hr/>')
    expect(html).toContain('<del>old</del>')
  })
})

describe('renderMarkdownBlocks', () => {
  it('splits an answer into its top-level blocks, which join back into renderMarkdown', () => {
    const source = '## Title\n\nA paragraph.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |'
    const blocks = renderMarkdownBlocks(source)
    expect(blocks.map(b => b.kind)).toEqual(['heading', 'p', 'list', 'table'])
    expect(blocks.map(b => b.html).join('')).toBe(renderMarkdown(source))
  })

  it('keeps the earlier blocks unchanged as more text streams in', () => {
    const early = renderMarkdownBlocks('First paragraph.\n\nSecond is still')
    const later = renderMarkdownBlocks('First paragraph.\n\nSecond is still arriving.\n\n- a list')
    expect(later[0]).toEqual(early[0])
    expect(later).toHaveLength(3)
  })
})

