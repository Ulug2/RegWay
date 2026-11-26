import { vi } from 'vitest'

// Loads an edge function's index.ts and returns the handler it passes to
// Deno.serve, plus whatever it hands to EdgeRuntime.waitUntil (background
// work that outlives the response).
export async function loadHandler(functionName: string) {
  let handler: ((req: Request) => Promise<Response>) | undefined
  const background: Promise<unknown>[] = []
  const deno = (globalThis as unknown as { Deno: { serve: unknown } }).Deno
  deno.serve = (h: typeof handler) => {
    handler = h
  }
  vi.stubGlobal('EdgeRuntime', { waitUntil: (p: Promise<unknown>) => void background.push(p) })
  vi.resetModules()
  await import(`../../../supabase/functions/${functionName}/index.ts`)
  if (!handler) throw new Error(`${functionName} did not call Deno.serve`)
  return { handler, background }
}

export const post = (path: string, opts: { token?: string; body?: unknown } = {}) =>
  new Request(`http://supabase.test/functions/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: JSON.stringify(opts.body ?? {}),
  })

// A fetch stub routed by URL. Unmatched requests fail the test loudly
// instead of reaching the network.
export function stubFetch(route: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined) {
  const calls: { url: URL; init?: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      calls.push({ url, init })
      const res = await route(url, init)
      if (!res) throw new Error(`Unexpected request in a unit test: ${url}`)
      return res
    }),
  )
  return calls
}

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// A request to a Claude 5 model asks for its answer in a JSON format instead
// of a forced tool call (_shared/ai/modelRules.ts). The answer's fields, and
// the reply in whichever shape was asked for.
// deno-lint-ignore no-explicit-any
export const answerFields = (body: any): string[] => Object.keys(body.output_config?.format?.schema?.properties ?? body.tools?.find((t: { name?: string }) => t.name === body.tool_choice?.name)?.input_schema?.properties ?? {})
// deno-lint-ignore no-explicit-any
export const answerSchema = (body: any) => body.output_config?.format?.schema ?? body.tools?.[0]?.input_schema
// deno-lint-ignore no-explicit-any
export const toolAnswer = (body: any, name: string, input: unknown, usage = { input_tokens: 100, output_tokens: 20 }) =>
  jsonResponse({ content: [body.output_config?.format ? { type: 'text', text: JSON.stringify(input) } : { type: 'tool_use', name, input }], usage })
