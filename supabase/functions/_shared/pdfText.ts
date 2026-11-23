// Reads the text layer of a PDF in code (Sidekick §17.8), with pdf.js as
// packaged for serverless runtimes by unpdf (no worker, no native canvas,
// which the edge runtime cannot load). Free and fast: an SEC order with a
// text layer no longer has to be sent whole to Claude to be read. A scanned
// PDF has no text layer and comes back as not readable, for the caller to
// send to Claude as before.
//
// unpdf's version is pinned here and in package.json (devDependencies, for
// the unit tests and `pnpm audit`); tests/unit/functionImports.test.ts keeps
// the two equal.

import { extractText, getDocumentProxy } from 'npm:unpdf@2.1.0'

export interface PdfText {
  pages: string[]
  // Whether there is enough real text to read: a scan has none, or only a
  // stamp or a page number.
  readable: boolean
}

// About two lines of letters per page, and at least a short paragraph.
const MIN_LETTERS_PER_PAGE = 100
const MIN_LETTERS = 300

const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length

export const isReadable = (pages: string[]) => {
  const total = pages.reduce((n, page) => n + letters(page), 0)
  return total >= Math.max(MIN_LETTERS, Math.min(pages.length * MIN_LETTERS_PER_PAGE, 2000))
}

// Each page's text, lines kept, runs of spaces closed up.
export const tidy = (page: string) =>
  page
    .split('\n')
    .map(line => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

// Null when the file is not a PDF pdf.js can open.
export async function pdfText(bytes: ArrayBuffer | Uint8Array): Promise<PdfText | null> {
  try {
    // A copy: pdf.js may take over (detach) the buffer it is given, and a
    // scanned PDF's bytes are still needed afterwards, to send to Claude.
    const pdf = await getDocumentProxy(new Uint8Array(bytes).slice())
    const { text } = await extractText(pdf, { mergePages: false })
    const pages = (Array.isArray(text) ? text : [text]).map(tidy)
    return { pages, readable: isReadable(pages) }
  } catch (err) {
    console.error('pdf text extraction failed', (err as Error).message)
    return null
  }
}
