// Shared plain-text extraction from an HTML page or a plain-text URL. Used
// wherever a function needs a source document's full body text: pulling a
// regulation's text for impact analysis, or a litigation release's narrative
// for enforcement ingestion.

export const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

// Fetches a URL and returns its plain text, trying each candidate in order
// until one returns a non-trivial body. Retries a candidate once on a
// non-OK response before moving on, since gov sites occasionally return a
// transient block on the first of two rapid requests.
export async function fetchPlainText(urls: (string | undefined)[], opts: { minLength?: number } = {}): Promise<string> {
  const minLength = opts.minLength ?? 400
  for (const url of urls.filter((u): u is string => !!u)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)' },
        })
        if (!res.ok) continue
        const body = await res.text()
        const isPlainText = url.endsWith('.txt') || (res.headers.get('content-type')?.includes('text/plain') ?? false)
        const text = isPlainText ? body : stripHtml(body)
        if (text.length > minLength) return text
        break // got a response but it was too short — try the next URL, not a retry
      } catch {
        // network/timeout error — worth one retry on this same URL
      }
    }
  }
  return ''
}
