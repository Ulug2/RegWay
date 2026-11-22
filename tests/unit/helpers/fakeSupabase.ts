// A stand-in for supabase-js: records every query a module builds and lets
// the test decide what each one returns. Stands in for the URL import the
// edge functions use (see vitest.config.ts).

export interface Query {
  table: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc'
  columns?: string
  payload?: unknown
  options?: unknown
  // Every chained call after the operation, e.g. ['eq', 'firm_id', 'f1'].
  filters: [string, ...unknown[]][]
}

export interface Result {
  data?: unknown
  error?: unknown
  count?: number | null
}

export type Resolver = (query: Query) => Result | void

const OPS = new Set(['insert', 'upsert', 'update', 'delete'])

function builder(query: Query, resolve: Resolver, log: Query[]) {
  const settle = () => {
    log.push(query)
    const result = resolve(query) ?? {}
    return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }
  }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_, method: string) {
        if (method === 'then') return (ok: (r: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve().then(settle).then(ok, fail)
        return (...args: unknown[]) => {
          if (method === 'select' && query.op === 'select' && query.columns === undefined) {
            query.columns = args[0] as string
            query.options = args[1]
          } else if (OPS.has(method) && query.filters.length === 0 && query.op === 'select' && query.columns === undefined) {
            query.op = method as Query['op']
            query.payload = args[0]
            query.options = args[1]
          } else {
            query.filters.push([method, ...args])
          }
          return proxy
        }
      },
    },
  )
  return proxy
}

export interface FakeClient {
  from(table: string): any
  rpc(name: string, args?: unknown): any
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> }
  queries: Query[]
  // Queries of one kind against one table, in the order they ran.
  ran(table: string, op?: Query['op']): Query[]
}

export function fakeClient(resolve: Resolver = () => {}, user: { id: string } | null = { id: 'user-1' }): FakeClient {
  const queries: Query[] = []
  return {
    from: (table: string) => builder({ table, op: 'select', filters: [] }, resolve, queries),
    rpc: (name: string, args?: unknown) => builder({ table: name, op: 'rpc', payload: args, filters: [] }, resolve, queries),
    auth: { getUser: async () => ({ data: { user } }) },
    queries,
    ran: (table, op) => queries.filter(q => q.table === table && (!op || q.op === op)),
  }
}

// What `createClient` hands back inside a function under test. A handler
// test sets this before invoking the handler. Kept on globalThis because
// handler tests reload modules, which would otherwise give the function its
// own copy of this file.
const slot = globalThis as unknown as { __fakeSupabase?: FakeClient; __fakeSessions?: Record<string, FakeClient> }
export const setClient = (client: FakeClient) => {
  slot.__fakeSupabase = client
  slot.__fakeSessions = undefined
}
// Optional: the client a function gets when it creates one with a caller's
// own `Authorization` header, keyed by that header ('Bearer <token>'). Lets
// a test give each session its own view of the data, as the access rules
// do; without it every client is the one `setClient` set.
export const setSessionClients = (sessions: Record<string, FakeClient>) => {
  slot.__fakeSessions = sessions
}
export const createClient = (_url?: string, _key?: string, options?: { global?: { headers?: Record<string, string> } }) => {
  const authorization = options?.global?.headers?.Authorization
  const session = authorization ? slot.__fakeSessions?.[authorization] : undefined
  return session ?? (slot.__fakeSupabase ??= fakeClient())
}
export type SupabaseClient = FakeClient

export const hasFilter = (q: Query, ...filter: unknown[]) => q.filters.some(f => f.length === filter.length && f.every((v, i) => JSON.stringify(v) === JSON.stringify(filter[i])))
