import type { Query, Result } from './fakeSupabase'
import { jsonResponse, stubFetch } from './handler'

// A small firm for handler tests, and the pieces most of them share.

export const FIRM_ID = 'firm-1'

export const firm = { name: 'H.I.G. Capital', hq_location: 'Miami, Florida', jurisdictions: ['United States'], profile: { firm_type: 'Private equity', adviser_registration: 'SEC-registered' } }
export const funds = [{ id: 'fund-1', name: 'Fund I', structure: 'Delaware LP', size: '$1B', jurisdictions: ['United States'], profile: { strategy: 'Buyout' } }]
export const companies = [
  { id: 'co-getix', name: 'GetixHealth', hq_location: 'Houston, Texas', sectors: ['Healthcare'], regions: ['United States'], offerings: 'Revenue cycle management', profile: {} },
  { id: 'co-aero', name: 'Aero Logistics', hq_location: 'Naples, Italy', sectors: ['Aerospace'], regions: ['Italy'], offerings: null, profile: {} },
]

export interface FirmState {
  member?: boolean
  firmExists?: boolean
  allowed?: boolean
}

// Answers the queries every matcher makes about the firm itself; returns
// undefined for anything else so a test's own resolver can handle it.
export function firmQueries(q: Query, state: FirmState = {}): Result | undefined {
  if (q.table === 'firm_members') return { data: state.member === false ? null : { firm_id: FIRM_ID } }
  if (q.table === 'check_rate_limit') return { data: state.allowed ?? true }
  if (q.table === 'firms') return { data: state.firmExists === false ? null : firm }
  if (q.table === 'funds') return { data: funds }
  if (q.table === 'portfolio_companies' && q.op === 'select') return { data: companies }
  return undefined
}

export interface ModelCall {
  body: any
  tool: string | undefined
}

// Stubs the network: Anthropic answers each forced tool call with
// `replies[tool name]`, and analysis jobs handed to regulation-impact are
// recorded in `queued` rather than run.
export function stubModel(replies: Record<string, unknown | (() => Response)>, extra: (url: URL) => Response | undefined = () => undefined) {
  const model: ModelCall[] = []
  const queued: { regulationId: string; firmId: string; force: boolean }[] = []
  stubFetch((url, init) => {
    if (url.hostname === 'api.anthropic.com') {
      const body = JSON.parse(init!.body as string)
      const tool = body.tool_choice?.name as string | undefined
      model.push({ body, tool })
      const reply = replies[tool ?? 'text']
      if (typeof reply === 'function') return (reply as () => Response)()
      return jsonResponse(tool ? { content: [{ type: 'tool_use', name: tool, input: reply }], usage: { input_tokens: 1000, output_tokens: 200 } } : reply)
    }
    if (url.pathname === '/functions/v1/regulation-impact') {
      queued.push(JSON.parse(init!.body as string))
      return jsonResponse({ queued: true }, 202)
    }
    return extra(url)
  })
  return { model, queued }
}

// The text of the user turn sent to the model, whatever shape it was sent in.
export const promptText = (call: ModelCall): string => {
  const content = call.body.messages[0].content
  return typeof content === 'string' ? content : content.map((b: { text?: string }) => b.text ?? '').join('\n')
}
