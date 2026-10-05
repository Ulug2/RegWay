import { supabase } from './supabase'
import { readCache, writeCache, patchCache, dropCache } from './cache'
import { callFunction } from './functions'
import { toRow, type Answers } from './questionnaire'
import type { AiContext, Firm, Fund, FundHolding, ImpactContent, MatchedRegulation, PortfolioCompany, Regulation, RegulationNote } from './types'

export async function getFirmId(): Promise<string | null> {
  const { data, error } = await supabase.from('firm_members').select('firm_id').maybeSingle()
  if (error) throw error
  const id = data?.firm_id ?? null
  if (id) writeCache('firmId', id)
  return id
}

export async function fetchFirm(firmId: string): Promise<Firm> {
  const { data, error } = await supabase.from('firms').select('*').eq('id', firmId).single()
  if (error) throw error
  writeCache('firm', data)
  return data
}

export async function updateFirm(
  firmId: string,
  updates: Partial<Pick<Firm, 'name' | 'hq_location' | 'lead_gp_name' | 'jurisdictions'>>,
): Promise<void> {
  const { error } = await supabase.from('firms').update(updates).eq('id', firmId)
  if (error) throw error
  patchCache<Firm>('firm', prev => ({ ...prev, ...updates }))
}

interface RelevanceRow {
  relevance_reason: string | null
  created_at: string
  regulations: Regulation | null
}

async function fetchRelevantRegulations(filters: {
  firmId: string
  scope: 'firm' | 'fund' | 'company'
  companyId?: string
  fundId?: string
}): Promise<MatchedRegulation[]> {
  let query = supabase
    .from('regulation_relevance')
    .select('relevance_reason, created_at, regulations(*)')
    .eq('firm_id', filters.firmId)
    .is('dismissed_at', null)

  if (filters.scope === 'company' && filters.companyId) {
    query = query.eq('portfolio_company_id', filters.companyId)
  } else if (filters.scope === 'fund' && filters.fundId) {
    query = query.eq('fund_id', filters.fundId)
  } else if (filters.scope === 'fund') {
    query = query.not('fund_id', 'is', null)
  } else {
    query = query.is('fund_id', null).is('portfolio_company_id', null)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as unknown as RelevanceRow[])
    .filter(r => r.regulations && !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
    .map(r => ({ ...(r.regulations as Regulation), match_reason: r.relevance_reason, matched_at: r.created_at }))
    .sort((a, b) => (b.published_date ?? '').localeCompare(a.published_date ?? ''))
}

export interface RelatedEntityMatch {
  entity_type: 'firm' | 'fund' | 'company'
  entity_name: string
  fund_id: string | null
  portfolio_company_id: string | null
  relevance_reason: string | null
}

interface RelatedMatchRow {
  fund_id: string | null
  portfolio_company_id: string | null
  relevance_reason: string | null
  funds: { name: string } | null
  portfolio_companies: { name: string } | null
}

// The other funds/portfolio companies (and the firm itself) this regulation
// was matched to, straight from `regulation_relevance` — the live source of
// truth, not the AI-generated impact analysis (which is only regenerated on
// demand and can go stale relative to the actual relevance rows).
export async function fetchRelatedEntityMatches(firmId: string, regulationId: string, firmName: string): Promise<RelatedEntityMatch[]> {
  const { data, error } = await supabase
    .from('regulation_relevance')
    .select('fund_id, portfolio_company_id, relevance_reason, funds(name), portfolio_companies(name)')
    .eq('firm_id', firmId)
    .eq('regulation_id', regulationId)
    .is('dismissed_at', null)
  if (error) throw error

  return (data as unknown as RelatedMatchRow[])
    .filter(r => !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
    .map(r => ({
      entity_type: r.fund_id ? ('fund' as const) : r.portfolio_company_id ? ('company' as const) : ('firm' as const),
      entity_name: r.fund_id ? (r.funds?.name ?? 'Fund') : r.portfolio_company_id ? (r.portfolio_companies?.name ?? 'Company') : firmName,
      fund_id: r.fund_id,
      portfolio_company_id: r.portfolio_company_id,
      relevance_reason: r.relevance_reason,
    }))
}

export const fetchFirmRegulations = (firmId: string) => fetchRelevantRegulations({ firmId, scope: 'firm' })
export const fetchFundRegulations = (firmId: string, fundId?: string) => fetchRelevantRegulations({ firmId, scope: 'fund', fundId })
export const fetchCompanyRegulations = (firmId: string, companyId: string) =>
  fetchRelevantRegulations({ firmId, scope: 'company', companyId })

export async function fetchPortfolioCompanies(firmId: string): Promise<PortfolioCompany[]> {
  const { data, error } = await supabase.from('portfolio_companies').select('*').eq('firm_id', firmId).order('name')
  if (error) throw error
  writeCache('companies', data ?? [])
  return data ?? []
}

export async function fetchFunds(firmId: string): Promise<Fund[]> {
  const { data, error } = await supabase.from('funds').select('*').eq('firm_id', firmId).order('name')
  if (error) throw error
  writeCache('funds', data ?? [])
  return data ?? []
}

// Last-known values, readable synchronously so screens can render instantly
// and then refresh from the network.
export const getCachedFirmId = () => readCache<string>('firmId') ?? null
export const getCachedFirm = () => readCache<Firm>('firm') ?? null
export const getCachedCompanies = () => readCache<PortfolioCompany[]>('companies')
export const getCachedFunds = () => readCache<Fund[]>('funds')

export async function isFlagged(regulationId: string): Promise<boolean> {
  const { data } = await supabase.from('regulation_flags').select('regulation_id').eq('regulation_id', regulationId).maybeSingle()
  return !!data
}

export async function setFlagged(regulationId: string, firmId: string, flagged: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (flagged) {
    const { error } = await supabase
      .from('regulation_flags')
      .upsert({ regulation_id: regulationId, user_id: user.id, firm_id: firmId })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('regulation_flags')
      .delete()
      .eq('regulation_id', regulationId)
      .eq('user_id', user.id)
    if (error) throw error
  }
}

export async function fetchNotes(regulationId: string): Promise<RegulationNote[]> {
  const { data, error } = await supabase
    .from('regulation_notes')
    .select('*')
    .eq('regulation_id', regulationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addNote(regulationId: string, firmId: string, body: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('regulation_notes').insert({
    regulation_id: regulationId,
    firm_id: firmId,
    user_id: user.id,
    body,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Questionnaire-backed writes. Answers are mapped to rows by questionnaire.ts
// (which also derives the legacy columns the AI functions read).
// ---------------------------------------------------------------------------

// Fire-and-forget: force-regenerates the impact analysis (the AI-written
// explanation) for whatever this entity is already matched to, so an edit
// here doesn't leave a stale explanation behind — see refresh-entity-impacts.
// Never awaited by callers; a failure here shouldn't block the profile save
// that triggered it.
function refreshEntityImpacts(scope: 'firm' | 'fund' | 'company', entityId?: string): void {
  callFunction('refresh-entity-impacts', { scope, entityId }).catch(() => {})
}

// Calls `onChange` (debounced) whenever this firm gains or changes a match:
// the scheduled matcher writes rows while a dashboard may be open. Realtime
// applies regulation_relevance's RLS, so only this firm's rows arrive.
// Returns the unsubscribe function.
export function subscribeToMatches(firmId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const debounced = () => {
    clearTimeout(timer)
    timer = setTimeout(onChange, 1500)
  }
  const channel = supabase
    .channel(`matches:${firmId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'regulation_relevance', filter: `firm_id=eq.${firmId}` }, debounced)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'regulation_relevance', filter: `firm_id=eq.${firmId}` }, debounced)
    .subscribe()
  return () => {
    clearTimeout(timer)
    supabase.removeChannel(channel)
  }
}

// Matches new geopolitical developments (sanctions, export controls, trade
// actions, travel advisories) against the firm's recorded locations. Cheap
// to call often: the function returns without any AI call when nothing new
// touches a country the firm is connected to. `reevaluate` after a location
// edit re-checks items rejected under the old footprint (e.g. a newly added
// supplier country). Resolves to how many new matches were found.
export async function matchGeopoliticalDevelopments(opts: { reevaluate?: boolean } = {}): Promise<number> {
  const result = await callFunction<{ relevant?: number }>('match-geopolitical-relevance', opts)
  return result.relevant ?? 0
}

// Company profile answers that feed the geopolitical footprint (HQ is
// compared via the derived `hq_location` column instead).
const LOCATION_FIELDS = ['supplier_locations', 'facility_locations', 'operating_locations', 'foreign_countries'] as const

// Unset, '' and [] all mean "nothing recorded", so switching between them
// isn't a location change worth a re-evaluation (which costs an AI call).
const recorded = (v: unknown) => (v == null || v === '' || (Array.isArray(v) && v.length === 0) ? null : v)

export async function saveFirmAnswers(firmId: string, answers: Answers): Promise<void> {
  const row = toRow('firm', answers)
  const { error } = await supabase.from('firms').update(row).eq('id', firmId)
  if (error) throw error
  patchCache<Firm>('firm', prev => ({ ...prev, ...row }) as Firm)
  refreshEntityImpacts('firm')
}

export async function addFund(firmId: string, answers: Answers): Promise<void> {
  const { error } = await supabase.from('funds').insert({ ...toRow('fund', answers), firm_id: firmId })
  if (error) throw error
}

export async function saveFundAnswers(fundId: string, answers: Answers): Promise<void> {
  const { error } = await supabase.from('funds').update(toRow('fund', answers)).eq('id', fundId)
  if (error) throw error
  refreshEntityImpacts('fund', fundId)
}

export async function removeFund(fundId: string): Promise<void> {
  const { error } = await supabase.from('funds').delete().eq('id', fundId)
  if (error) throw error
}

// Which fund holds which portfolio company. Only ever entered by the user
// (spec §3: ownership is never inferred), so a company with no rows is
// "not recorded", not "held by no fund".
export async function fetchHoldings(firmId: string): Promise<FundHolding[]> {
  const { data, error } = await supabase.from('fund_holdings').select('fund_id, portfolio_company_id').eq('firm_id', firmId)
  if (error) throw error
  return data ?? []
}

// Records or removes one holding, then lets the geopolitical matcher bring
// fund-level matches in line (a fund's exposure is derived from the
// companies it holds; no AI call is made for that part).
export async function setHolding(firmId: string, fundId: string, companyId: string, held: boolean): Promise<void> {
  const { error } = held
    ? await supabase.from('fund_holdings').upsert({ firm_id: firmId, fund_id: fundId, portfolio_company_id: companyId })
    : await supabase.from('fund_holdings').delete().eq('fund_id', fundId).eq('portfolio_company_id', companyId)
  if (error) throw error
  dropCache('regs:fund')
  matchGeopoliticalDevelopments().catch(() => {})
}

export async function addPortfolioCompany(firmId: string, answers: Answers): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').insert({ ...toRow('company', answers), firm_id: firmId })
  if (error) throw error
  // A new company can bring new countries into the firm's footprint.
  matchGeopoliticalDevelopments({ reevaluate: true }).catch(() => {})
}

// Cached company-regulations results were computed from the company's old
// location/industry/operating footprint, so if any of those changed, drop
// them — the dashboard re-scans on the next click when nothing is cached.
export async function saveCompanyAnswers(firmId: string, previous: PortfolioCompany, answers: Answers): Promise<void> {
  const row = toRow('company', answers)
  const { error } = await supabase.from('portfolio_companies').update(row).eq('id', previous.id)
  if (error) throw error

  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const changed =
    !same(previous.hq_location, row.hq_location) ||
    !same(previous.sectors, row.sectors) ||
    !same(previous.regions, row.regions)
  if (changed) {
    // Forget the old scan so it's re-run (in the background) with the new details.
    await supabase.from('portfolio_companies').update({ last_scanned_at: null }).eq('id', previous.id)
    const { error: clearError } = await supabase
      .from('regulation_relevance')
      .delete()
      .eq('firm_id', firmId)
      .eq('portfolio_company_id', previous.id)
      .is('dismissed_at', null) // keep the user's dismissals across a rescan
    if (clearError) throw clearError
    patchCache<Record<string, unknown>>('regs:company', prev => {
      const { [previous.id]: _dropped, ...rest } = prev
      return rest
    })
  }
  // Covers the other case too: a fact changed (e.g. regulated status,
  // sensitive data) that doesn't trigger a rescan above but does feed the
  // impact analysis, so its existing matches' explanations would otherwise
  // go stale silently.
  refreshEntityImpacts('company', previous.id)

  // Spec §3: a changed location or supplier fact must cause geopolitical
  // matches to be reconsidered, not just future ones.
  const locationChanged =
    !same(previous.hq_location, row.hq_location) ||
    LOCATION_FIELDS.some(f => !same(recorded(previous.profile?.[f]), recorded(answers[f])))
  if (locationChanged) matchGeopoliticalDevelopments({ reevaluate: true }).catch(() => {})
}

export async function removePortfolioCompany(companyId: string): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').delete().eq('id', companyId)
  if (error) throw error
}

// Public bucket (logos aren't sensitive) so the returned URL renders directly
// with no signed-URL step; storage RLS still restricts who can write to a
// given company's folder to members of the firm that owns it.
export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${companyId}/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('company-logos').upload(path, file, { cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('company-logos').getPublicUrl(path)
  const { error } = await supabase.from('portfolio_companies').update({ logo_url: data.publicUrl }).eq('id', companyId)
  if (error) throw error

  patchCache<PortfolioCompany[]>('companies', list => list.map(c => (c.id === companyId ? { ...c, logo_url: data.publicUrl } : c)))
  return data.publicUrl
}

// ---------------------------------------------------------------------------
// Impact analysis and dismissals
// ---------------------------------------------------------------------------

export const getCachedImpact = (regulationId: string) => readCache<ImpactContent>(`impact:${regulationId}`)

export async function fetchImpact(regulationId: string): Promise<ImpactContent | null> {
  const { data, error } = await supabase.from('regulation_impacts').select('content').eq('regulation_id', regulationId).maybeSingle()
  if (error) throw error
  const content = (data?.content as ImpactContent | undefined) ?? null
  if (content) writeCache(`impact:${regulationId}`, content)
  return content
}

// Lightweight batch read of just the `status` text for a set of regulations,
// for list views that want a badge without pulling each full analysis.
// Regulations with no generated impact yet (or where generation hasn't
// reached this firm) are simply absent from the returned map.
export async function fetchImpactStatuses(firmId: string, regulationIds: string[]): Promise<Record<string, string>> {
  if (regulationIds.length === 0) return {}
  const { data, error } = await supabase
    .from('regulation_impacts')
    .select('regulation_id, content')
    .eq('firm_id', firmId)
    .in('regulation_id', regulationIds)
  if (error) throw error

  const statuses: Record<string, string> = {}
  for (const row of data ?? []) {
    const status = (row.content as ImpactContent | null)?.status
    if (status) statuses[row.regulation_id] = status
  }
  return statuses
}

// Asks the backend to generate the analysis now (it's normally prepared in the
// background as soon as a regulation is matched, so this is the fallback).
// Null when the analysis can't be written yet: a document on public
// inspection whose text isn't readable until publication.
export async function requestImpact(regulationId: string): Promise<ImpactContent | null> {
  const { content } = await callFunction<{ content: ImpactContent | null }>('regulation-impact', { regulationId })
  if (content) writeCache(`impact:${regulationId}`, content)
  return content
}

export interface RematchResult {
  // Relevant to at least one entity after the re-check.
  relevant: boolean
  reason: string
  // One per entity the re-check judged, relevant ones first.
  verdicts?: { entity: string; relevant: boolean; reason: string }[]
}

// "Flag an incorrect match": re-evaluates one regulation against the firm's
// current profile data on demand, optionally weighing a user's stated
// correction. Updates the relevance row in place (upsert on the same
// conflict key) and, if still relevant, force-regenerates the impact
// analysis so the explanation visibly reflects the re-check. Regulatory and
// geopolitical items — see rematch-regulation.
export async function rematchRegulation(regulationId: string, note?: string): Promise<RematchResult> {
  return callFunction<RematchResult>('rematch-regulation', { regulationId, note })
}

// Dismissing hides a regulation from every dashboard list. The row stays, so
// the matcher and company scans treat it as handled and never bring it back;
// restoring clears the mark.
export async function dismissRegulation(firmId: string, regulationId: string): Promise<void> {
  const { error } = await supabase
    .from('regulation_relevance')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('firm_id', firmId)
    .eq('regulation_id', regulationId)
  if (error) throw error
  const without = (list: Regulation[] | null) => list && list.filter(r => r.id !== regulationId)
  // The fund and company caches hold one list per fund / company.
  const withoutInEach = (lists: Record<string, Regulation[]>) =>
    Object.fromEntries(Object.entries(lists).map(([id, list]) => [id, list.filter(r => r.id !== regulationId)]))
  patchCache<Regulation[] | null>('regs:pe', without)
  patchCache<Record<string, Regulation[]>>('regs:fund', withoutInEach)
  patchCache<Record<string, Regulation[]>>('regs:company', withoutInEach)
}

export async function restoreRegulation(firmId: string, regulationId: string): Promise<void> {
  const { error } = await supabase
    .from('regulation_relevance')
    .update({ dismissed_at: null })
    .eq('firm_id', firmId)
    .eq('regulation_id', regulationId)
  if (error) throw error
  dropCache('regs:pe', 'regs:fund', 'regs:company')
}

export async function fetchDismissed(firmId: string): Promise<Regulation[]> {
  const { data, error } = await supabase
    .from('regulation_relevance')
    .select('relevance_reason, dismissed_at, regulations(*)')
    .eq('firm_id', firmId)
    .not('dismissed_at', 'is', null)
  if (error) throw error
  const seen = new Set<string>()
  return (data as unknown as { relevance_reason: string | null; dismissed_at: string; regulations: Regulation | null }[])
    .filter(r => r.regulations && !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
    .sort((a, b) => b.dismissed_at.localeCompare(a.dismissed_at))
    .map(r => r.regulations as Regulation)
    .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

// ---------------------------------------------------------------------------
// Data source health
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  federal_register: 'Federal Register',
  sec_enforcement: 'SEC litigation releases',
  finra_enforcement: 'FINRA enforcement',
  sec_admin_proceedings: 'SEC administrative proceedings',
  state_travel_advisories: 'State Department travel advisories',
  // run-matching: the scheduled AI matching of new developments to firms.
  matching: 'Automatic matching',
}

// A source is "failing" when its most recent recorded sync run didn't
// succeed — shown so an empty or stale-looking dashboard reads as a stated
// limitation rather than silently implying nothing is relevant. Platform-
// wide status, not per-firm, so no firmId filter.
export async function fetchFailingSources(): Promise<string[]> {
  const { data, error } = await supabase.from('sync_runs').select('source, ok').order('ran_at', { ascending: false }).limit(100)
  if (error || !data) return []
  const latestBySource = new Map<string, boolean>()
  for (const row of data as { source: string; ok: boolean }[]) {
    if (!latestBySource.has(row.source)) latestBySource.set(row.source, row.ok)
  }
  return [...latestBySource.entries()].filter(([, ok]) => !ok).map(([source]) => SOURCE_LABELS[source] ?? source)
}

// ---------------------------------------------------------------------------
// RegWay AI conversations (saved chats). RLS limits both tables to the
// signed-in user's own conversations in their firm.
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  id: string
  title: string
  // The fund / company / regulation scope it was started from, if any.
  context: AiContext | null
  updated_at: string
}

export interface SavedMessage {
  role: 'user' | 'assistant'
  content: string
  citations: { url?: string; title?: string }[] | null
}

const RECENT_CONVERSATIONS = 30

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('regway_ai_conversations')
    .select('id, title, context, updated_at')
    .order('updated_at', { ascending: false })
    .limit(RECENT_CONVERSATIONS)
  if (error) throw error
  return data ?? []
}

export async function fetchConversationMessages(conversationId: string): Promise<SavedMessage[]> {
  const { data, error } = await supabase
    .from('regway_ai_messages')
    .select('role, content, citations')
    .eq('conversation_id', conversationId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

// Deletes the conversation and (by cascade) its messages.
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.from('regway_ai_conversations').delete().eq('id', conversationId)
  if (error) throw error
}

