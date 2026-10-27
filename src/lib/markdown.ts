// Small, self-contained markdown-to-HTML renderer for RegWay AI chat
// messages — no new dependency, since the surface we need is narrow
// (headings, bold/italic/strikethrough, inline/fenced code, links, nested
// lists, tables, rules, blockquotes, paragraphs) and the input is always
// the model's own prose, not arbitrary
// untrusted markdown. Every block's text is HTML-escaped at render time
// (never passed through unescaped), so no raw tag in the source model
// output can ever pass through — but block *structure* (headings, `>`
// quotes, fences, etc.) is detected on the raw source first, since escaping
// `>` to `&gt;` up front would silently break blockquote detection. Called
// on every streamed chunk, so it must be cheap and must tolerate a
// mid-token/mid-fence truncated string (an unclosed ``` block while the
// stream is still arriving renders as an in-progress code block rather than
// erroring).

// Quotes too: a URL is written into an href attribute below, and an
// unescaped `"` in it would end the attribute and start a new one.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Inline spans: links and inline code are protected behind placeholders
// before bold/italic run, so an underscore or asterisk inside a URL or a
// code span can never be misread as emphasis syntax and corrupt the tag
// around it. Escapes HTML itself — callers always pass raw block text.
function renderInline(rawText: string): string {
  const stash: string[] = []
  const protect = (html: string) => {
    stash.push(html)
    return `\u0000${stash.length - 1}\u0000`
  }

  let out = escapeHtml(rawText)
    .replace(/`([^`]+)`/g, (_, code) => protect(`<code>${code}</code>`))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(`<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`))
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g, url => protect(`<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`))

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_a-zA-Z0-9])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)])
}

interface ListItem {
  indent: number
  ordered: boolean
  start: number
  text: string
}

type Align = 'left' | 'center' | 'right' | null

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: ListItem[] }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'table'; head: string[]; align: Align[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'p'; text: string }

// A table row's cells: outer pipes dropped, `\|` kept as a literal pipe.
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
}

// The `| --- | :---: |` line under a table's header.
const isDivider = (line: string | undefined) => !!line && line.includes('-') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: ListItem[] = []
  let quote: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join('\n') })
      para = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: 'list', items: list })
      list = []
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: 'blockquote', text: quote.join('\n') })
      quote = []
    }
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushQuote()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^\s*```([\w+#.-]*)\s*$/.exec(line)

    if (fence) {
      flushAll()
      const lang = fence[1] ?? ''
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      // If the closing fence hasn't arrived yet (still streaming), this
      // still renders the partial code so far rather than swallowing it.
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    if (line.includes('|') && isDivider(lines[i + 1])) {
      flushAll()
      const head = cells(line)
      const align = cells(lines[i + 1]).map((c): Align => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null))
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(cells(lines[i]))
        i++
      }
      i--
      blocks.push({ type: 'table', head, align, rows })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const rule = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    const item = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line)
    const quoted = /^>\s?(.*)$/.exec(line)

    if (heading) {
      flushAll()
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
    } else if (rule) {
      flushAll()
      blocks.push({ type: 'hr' })
    } else if (item) {
      flushPara()
      flushQuote()
      list.push({ indent: item[1].replace(/\t/g, '    ').length, ordered: !item[2], start: item[3] ? Number(item[3]) : 1, text: item[4] })
    } else if (quoted) {
      flushPara()
      flushList()
      quote.push(quoted[1])
    } else if (line.trim() === '') {
      flushAll()
    } else if (list.length && /^\s+\S/.test(line)) {
      // An indented line under a list item continues that item.
      list[list.length - 1].text += '\n' + line.trim()
    } else {
      flushList()
      flushQuote()
      para.push(line)
    }
  }
  flushAll()
  return blocks
}

// Items indented further than the one before them become a list inside it.
function renderList(items: ListItem[]): string {
  let pos = 0
  const level = (): string => {
    const { indent, ordered, start } = items[pos]
    let html = ordered ? (start !== 1 ? `<ol start="${start}">` : '<ol>') : '<ul>'
    while (pos < items.length && items[pos].indent >= indent) {
      if (items[pos].indent > indent) {
        html = html.replace(/<\/li>$/, '') + level() + '</li>'
        continue
      }
      if (items[pos].ordered !== ordered) break
      html += `<li>${renderInline(items[pos].text).replace(/\n/g, '<br/>')}</li>`
      pos++
    }
    return html + (ordered ? '</ol>' : '</ul>')
  }
  let out = ''
  while (pos < items.length) out += level()
  return out
}

function renderTable(b: { head: string[]; align: Align[]; rows: string[][] }): string {
  const attr = (i: number) => (b.align[i] ? ` style="text-align:${b.align[i]}"` : '')
  const head = b.head.map((c, i) => `<th${attr(i)}>${renderInline(c)}</th>`).join('')
  const rows = b.rows.map(r => `<tr>${b.head.map((_, i) => `<td${attr(i)}>${renderInline(r[i] ?? '')}</td>`).join('')}</tr>`).join('')
  // The wrapper scrolls sideways, so a wide table never widens the page.
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
}

// One top-level block of an answer, rendered. The chat puts each in its own
// element, so blocks already on screen keep their DOM while an answer
// streams in, and only a new block appears (and fades in).
export interface RenderedBlock {
  kind: Block['type']
  html: string
}

function renderBlock(b: Block): string {
  if (b.type === 'heading') return `<h${b.level}>${renderInline(b.text)}</h${b.level}>`
  if (b.type === 'list') return renderList(b.items)
  if (b.type === 'table') return renderTable(b)
  if (b.type === 'hr') return '<hr/>'
  if (b.type === 'blockquote') return `<blockquote>${renderInline(b.text).replace(/\n/g, '<br/>')}</blockquote>`
  // The Copy button is wired up by the chat (it listens for clicks on
  // `data-copy-code`); the text it copies is the <code> beside it.
  if (b.type === 'code')
    return `<div class="code-block"><div class="code-head"><span>${escapeHtml(b.lang || 'code')}</span><button type="button" data-copy-code>Copy</button></div><pre><code>${escapeHtml(b.code)}</code></pre></div>`
  return `<p>${renderInline(b.text).replace(/\n/g, '<br/>')}</p>`
}

export function renderMarkdownBlocks(source: string): RenderedBlock[] {
  return parseBlocks(source.split('\n')).map(b => ({ kind: b.type, html: renderBlock(b) }))
}

export function renderMarkdown(source: string): string {
  return renderMarkdownBlocks(source)
    .map(b => b.html)
    .join('')
}
