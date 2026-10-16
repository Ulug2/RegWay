// The streamed answer: the model's Server-Sent Events are forwarded to the
// browser unchanged, and read here on the way past only to keep what gets
// saved (the text, its citations, what it cost).

import { mergeUsage, type UsageTotals } from '../_shared/usage.ts'

export interface Citation {
  url?: string
  title?: string
  cited_text?: string
  [field: string]: unknown
}

export class AnswerCollector {
  text = ''
  citations: Citation[] = []
  usage: UsageTotals = {}
  private buffer = ''
  // Text that resumes after a search doesn't start with a space.
  private afterTool = false
  private decoder = new TextDecoder()

  push(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        this.read(JSON.parse(line.slice(6)))
      } catch {
        // Partial line (split across chunks) or a non-JSON SSE comment — skip.
      }
    }
  }

  private read(evt: Record<string, any>): void {
    if (evt.type === 'content_block_start' && evt.content_block?.type !== 'text') {
      this.afterTool = true
    } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      if (this.afterTool && /\S$/.test(this.text) && /^\S/.test(evt.delta.text)) this.text += ' '
      this.afterTool = false
      this.text += evt.delta.text
    } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'citations_delta' && evt.delta.citation) {
      this.citations.push(evt.delta.citation)
    } else if (evt.type === 'message_start') {
      mergeUsage(this.usage, evt.message?.usage)
    } else if (evt.type === 'message_delta') {
      mergeUsage(this.usage, evt.usage)
    }
  }
}

// One of RegWay's own events, added to the stream after the model's
// (regway-ai-chat/review.ts). A client that doesn't know the type skips it.
const encoder = new TextEncoder()
export const sseEvent = (payload: { type: string }): Uint8Array => encoder.encode(`event: regway\ndata: ${JSON.stringify(payload)}\n\n`)
