// Small, self-contained markdown-to-HTML renderer for RegWay AI chat
// messages — no new dependency, since the surface we need is narrow
// (headings, bold/italic, inline/fenced code, links, lists, blockquotes,
// paragraphs) and the input is always Claude's own prose, not arbitrary
// untrusted markdown. Every block's text is HTML-escaped at render time
// (never passed through unescaped), so no raw tag in the source model
// output can ever pass through — but block *structure* (headings, `>`
// quotes, fences, etc.) is detected on the raw source first, since escaping
// `>` to `&gt;` up front would silently break blockquote detection. Called
// on every streamed chunk, so it must be cheap and must tolerate a
// mid-token/mid-fence truncated string (an unclosed ``` block while the
// stream is still arriving renders as an in-progress code block rather than
// erroring).

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g, url => protect(`<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`))

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_a-zA-Z0-9])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)])
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'p'; text: string }

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join('\n') })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push(list)
      list = null
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
    const fence = /^```(\w*)\s*$/.exec(line)

    if (fence) {
      flushAll()
      const lang = fence[1] ?? ''
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      // If the closing fence hasn't arrived yet (still streaming), this
      // still renders the partial code so far rather than swallowing it.
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^\d+\.\s+(.*)$/.exec(line)
    const quoted = /^>\s?(.*)$/.exec(line)

    if (heading) {
      flushAll()
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
    } else if (bullet) {
      flushPara()
      flushQuote()
      if (list?.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(bullet[1])
    } else if (numbered) {
      flushPara()
      flushQuote()
      if (list?.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(numbered[1])
    } else if (quoted) {
      flushPara()
      flushList()
      quote.push(quoted[1])
    } else if (line.trim() === '') {
      flushAll()
    } else {
      flushList()
      flushQuote()
      para.push(line)
    }
  }
  flushAll()
  return blocks
}

export function renderMarkdown(source: string): string {
  const blocks = parseBlocks(source.split('\n'))

  return blocks
    .map(b => {
      if (b.type === 'heading') return `<h${b.level}>${renderInline(b.text)}</h${b.level}>`
      if (b.type === 'ul') return `<ul>${b.items.map(i => `<li>${renderInline(i)}</li>`).join('')}</ul>`
      if (b.type === 'ol') return `<ol>${b.items.map(i => `<li>${renderInline(i)}</li>`).join('')}</ol>`
      if (b.type === 'blockquote') return `<blockquote>${renderInline(b.text).replace(/\n/g, '<br/>')}</blockquote>`
      if (b.type === 'code') return `<pre><code${b.lang ? ` data-lang="${b.lang}"` : ''}>${escapeHtml(b.code)}</code></pre>`
      const p = b as { type: 'p'; text: string }
      return `<p>${renderInline(p.text).replace(/\n/g, '<br/>')}</p>`
    })
    .join('')
}
