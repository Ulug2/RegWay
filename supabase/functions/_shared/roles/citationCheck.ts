// The chat check's source step: does what a claim says about the rule itself
// (what it requires, who it covers, its status and dates) match the text the
// answer actually cited? The answer's web-search citations carry the quoted
// passage (`cited_text`), so this compares against that text without
// fetching anything. Whether the rule reaches the firm's own entities is the
// Skeptic's question, not this one.

import type { CallOptions } from '../ai/client.ts'
import { MODEL_FOR } from '../ai/models.ts'
import { runTool, type ToolSpec } from '../ai/structured.ts'

const MODEL = MODEL_FOR.citationCheck
const QUOTE_CHARS = 1200
const MAX_SOURCES = 20

export interface CitedSource {
  url?: string
  title?: string
  cited_text?: string
}

export interface CitationFinding {
  index: number
  status: 'supported' | 'contradicted' | 'not_in_sources'
  // 1-based number of the source that settles it, or 0.
  source: number
  note: string
}

const TOOL: ToolSpec = {
  name: 'submit_citation_checks',
  description: 'Submit a finding for every numbered claim.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            status: {
              type: 'string',
              enum: ['supported', 'contradicted', 'not_in_sources'],
              description: 'supported: a quoted passage says what the claim says about the rule. contradicted: a quoted passage says otherwise. not_in_sources: no quoted passage covers it.',
            },
            source: { type: 'integer', description: 'Number of the source that supports or contradicts it, or 0.' },
            note: { type: 'string', description: 'One sentence: what the source says, where it differs from the claim, or that no source covers it.' },
          },
          required: ['index', 'status', 'source', 'note'],
        },
      },
    },
    required: ['findings'],
  },
}

// Sources the answer cited, one per URL with every passage it quoted.
export function distinctSources(citations: CitedSource[]): { title: string; url: string; quotes: string[] }[] {
  const byUrl = new Map<string, { title: string; url: string; quotes: string[] }>()
  for (const c of citations) {
    if (!c.url) continue
    const entry = byUrl.get(c.url) ?? { title: c.title ?? c.url, url: c.url, quotes: [] }
    if (c.cited_text && !entry.quotes.includes(c.cited_text)) entry.quotes.push(c.cited_text)
    byUrl.set(c.url, entry)
  }
  return [...byUrl.values()].slice(0, MAX_SOURCES)
}

export async function checkCitations(input: { claims: string[]; citations: CitedSource[] }, opts: CallOptions): Promise<CitationFinding[]> {
  const sources = distinctSources(input.citations)
  // Nothing was cited: every claim is unsourced, no call needed.
  if (sources.length === 0) return input.claims.map((_, index) => ({ index, status: 'not_in_sources', source: 0, note: 'The answer cited no source.' }))

  const answer = await runTool<{ findings: CitationFinding[] }>(
    {
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      tool: TOOL,
      messages: [
        {
          role: 'user',
          content: `Check the part of each claim that is about the rule or development itself (what it requires, whom it covers, whether it is proposed or final, its dates) against the passages the answer quoted from its sources. Ignore the part about the firm's own entities: that is checked elsewhere. Judge only from the quoted passages, not from what you know.

SOURCES
${sources.map((s, i) => `${i + 1}. ${s.title} (${s.url})\n${s.quotes.map(q => `   "${q.slice(0, QUOTE_CHARS)}"`).join('\n') || '   (no passage quoted)'}`).join('\n')}

CLAIMS
${input.claims.map((c, i) => `${i}. ${c}`).join('\n')}`,
        },
      ],
      check: a => {
        const seen = new Set((a.findings ?? []).map(f => f.index))
        return input.claims.every((_, i) => seen.has(i)) ? null : 'not every claim was checked'
      },
    },
    opts,
  )
  return answer.findings.filter(f => f.index >= 0 && f.index < input.claims.length)
}
