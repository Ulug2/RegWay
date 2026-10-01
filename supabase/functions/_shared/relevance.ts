// Shared plumbing for matching something in `regulations` to a firm's funds
// and portfolio companies: caller auth, entity loading, rate limiting, and
// the relevance-row upsert. Deliberately does NOT include the prompt or the
// candidate query — those differ enough between match-relevance (regulation
// text vs. jurisdiction) and match-enforcement-relevance (case facts vs.
// entity activity, with its own allegation-vs-finding posture rules) that
// forcing them into one shape would blur two genuinely different matching
// tasks. This module exists so neither duplicates the ~100 lines around that
// difference.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { json } from './cors.ts'

export interface FirmContext {
  firmId: string
  // Present only for an ordinary user session — used to rate-limit
  // user-triggered calls. The service-role/cron path is trusted and exempt.
  rateLimitClient: SupabaseClient | null
}

// Resolves which firm a request is allowed to match for. A service-role
// caller must supply firmId explicitly (trusted, e.g. cron). An ordinary user
// session never gets to name a firmId — it's derived from their own
// membership so a user can only ever trigger matching for their own firm.
// Returns a Response directly on any failure so callers can `return` it as-is.
export async function resolveFirmContext(req: Request, admin: SupabaseClient): Promise<FirmContext | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
  const token = authHeader.replace(/^Bearer\s+/i, '')

  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    const body = await req.json().catch(() => ({}))
    if (!body.firmId) return json({ error: 'firmId is required' }, 400)
    return { firmId: body.firmId, rateLimitClient: null }
  }

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  const { data: membership } = await admin.from('firm_members').select('firm_id').eq('user_id', user.id).single()
  if (!membership) return json({ error: 'No firm associated with this user' }, 404)

  return { firmId: membership.firm_id, rateLimitClient: userClient }
}

export async function checkRateLimit(client: SupabaseClient, functionName: string, limit: number, windowMinutes = 60): Promise<boolean> {
  const { data: allowed } = await client.rpc('check_rate_limit', {
    p_function_name: functionName,
    p_limit: limit,
    p_window_minutes: windowMinutes,
  })
  return !!allowed
}

export interface FirmRow {
  name: string
  hq_location: string | null
  jurisdictions: string[] | null
  profile: Record<string, unknown> | null
}

export interface FundRow {
  id: string
  name: string
  structure: string | null
  jurisdictions: string[] | null
  profile: Record<string, unknown> | null
}

export interface CompanyRow {
  id: string
  name: string
  sectors: string[] | null
  regions: string[] | null
  offerings: string | null
  profile: Record<string, unknown> | null
}

export interface FirmEntities {
  firm: FirmRow | null
  funds: FundRow[]
  companies: CompanyRow[]
}

export async function loadFirmEntities(admin: SupabaseClient, firmId: string): Promise<FirmEntities> {
  const [{ data: firm }, { data: funds }, { data: companies }] = await Promise.all([
    admin.from('firms').select('name, hq_location, jurisdictions, profile').eq('id', firmId).single(),
    admin.from('funds').select('id, name, structure, jurisdictions, profile').eq('firm_id', firmId),
    admin.from('portfolio_companies').select('id, name, sectors, regions, offerings, profile').eq('firm_id', firmId),
  ])
  return { firm: firm ?? null, funds: funds ?? [], companies: companies ?? [] }
}

// Renders selected profile keys as "label: value; label: value" for prompt
// context, skipping anything empty.
export const describe = (profile: Record<string, unknown> | null | undefined, keys: [string, string][]) =>
  keys
    .map(([k, label]) => {
      const v = profile?.[k]
      const text = Array.isArray(v) ? v.join('/') : typeof v === 'string' ? v : ''
      return text ? `${label}: ${text}` : ''
    })
    .filter(Boolean)
    .join('; ')

export interface Verdict {
  index: number
  relevant: boolean
  reason: string
  scope: 'firm' | 'fund' | 'company'
  entity_name: string | null
}

export interface RelevanceRow {
  regulation_id: string
  firm_id: string
  fund_id: string | null
  portfolio_company_id: string | null
  relevance_reason: string
}

// Turns model verdicts into rows for `regulation_relevance`. `relevant:
// false` rows are kept as an "already evaluated, skip" marker so the next run
// doesn't re-ask about the same item.
export function buildRelevanceRows(
  verdicts: Verdict[],
  candidates: { id: string }[],
  firmId: string,
  funds: { id: string; name: string }[],
  companies: { id: string; name: string }[],
): RelevanceRow[] {
  const fundByName = new Map(funds.map(f => [f.name.toLowerCase(), f.id]))
  const companyByName = new Map(companies.map(c => [c.name.toLowerCase(), c.id]))

  return verdicts
    .map(v => {
      const reg = candidates[v.index]
      if (!reg) return null
      const fundId = v.scope === 'fund' && v.entity_name ? (fundByName.get(v.entity_name.toLowerCase()) ?? null) : null
      const companyId = v.scope === 'company' && v.entity_name ? (companyByName.get(v.entity_name.toLowerCase()) ?? null) : null
      return {
        regulation_id: reg.id,
        firm_id: firmId,
        fund_id: fundId,
        portfolio_company_id: companyId,
        relevance_reason: v.relevant ? v.reason : `NOT_RELEVANT: ${v.reason}`,
      }
    })
    .filter((r): r is RelevanceRow => r !== null)
}

export async function upsertRelevanceRows(admin: SupabaseClient, rows: RelevanceRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await admin.from('regulation_relevance').upsert(rows, {
    onConflict: 'regulation_id,firm_id,portfolio_company_id,fund_id',
  })
  if (error) throw error
}
