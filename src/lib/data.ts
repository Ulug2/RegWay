import { supabase } from './supabase'
import { readCache, writeCache, patchCache, dropCache } from './cache'
import { callFunction } from './functions'
import { fromRow, metaOf, toRow, type Answers, type ProfileMeta, type Scope } from './questionnaire'
import type { Finding, FoundEntity, ResearchRun } from './research'
import { asSaved, firmLocationChanged, hasMatchingFacts, matchingFactsChanged } from './matchingFacts'
import { collapseDuplicates, isAnnouncement, isOfficialDocument, versionsOf, SOURCE_NAMES } from './duplicates'
import type { AiContext, Firm, Fund, FundHolding, ImpactContent, MatchedRegulation, PortfolioCompany, PublishedVersion, Regulation, RegulationNote } from './types'

export async function getFirmId(): Promise<string | null> {
  const { data, error } = await supabase.from('firm_members').select('firm_id').maybeSingle()
  if (error) throw error
  const id = data?.firm_id ?? null
  if (id) writeCache('firmId', id)
  return id
}

// One development by its id, for a page opened from its address.
export async function fetchRegulation(id: string): Promise<Regulation | null> {
  const { data, error } = await supabase.from('regulations').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
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

  const matched = (data as unknown as RelevanceRow[])
    .filter(r => r.regulations && !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
    .map(r => ({ ...(r.regulations as Regulation), match_reason: r.relevance_reason, matched_at: r.created_at }))
    .sort((a, b) => (b.published_date ?? '').localeCompare(a.published_date ?? ''))

  // One card per development: later versions go under the first one.
  const versions = await fetchVersions(matched)
  const dismissed = await fetchDismissedIds(filters.firmId, [...new Set([...firstVersionIds(matched), ...versions.map(v => v.id)])])
  return collapseDuplicates(matched, versions, dismissed)
}

// ---------------------------------------------------------------------------
// Duplicate coverage: other versions of the same development (lib/duplicates.ts)
// ---------------------------------------------------------------------------

const VERSION_COLUMNS = 'id, source, title, agency, published_date, source_url, duplicate_of'
// Ids travel in the query string.
const ID_CHUNK = 80

const firstVersionIds = (items: Pick<Regulation, 'duplicate_of'>[]) => [...new Set(items.map(i => i.duplicate_of).filter((id): id is string => !!id))]

async function versionRows(column: 'id' | 'duplicate_of', ids: string[]): Promise<PublishedVersion[]> {
  const found: PublishedVersion[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase.from('regulations').select(VERSION_COLUMNS).in(column, ids.slice(i, i + ID_CHUNK))
    if (error) throw error
    found.push(...((data ?? []) as PublishedVersion[]))
  }
  return found
}

// Every other version of these items: the ones published after them, and
// the first version of any that is itself a later one. Whether or not they
// were matched to the firm: the link is to the document.
async function fetchVersions(items: Pick<Regulation, 'id' | 'duplicate_of'>[]): Promise<PublishedVersion[]> {
  if (items.length === 0) return []
  const [later, first] = await Promise.all([versionRows('duplicate_of', items.map(i => i.id)), versionRows('id', firstVersionIds(items))])
  return [...later, ...first]
}

export async function fetchPublishedVersions(regulation: Pick<Regulation, 'id' | 'duplicate_of'>): Promise<PublishedVersion[]> {
  return versionsOf(regulation, await fetchVersions([regulation]))
}

// Which of these the firm has dismissed. Dismissing a development covers its
// later versions too, including ones that arrive afterwards.
async function fetchDismissedIds(firmId: string, regulationIds: string[]): Promise<Set<string>> {
  if (regulationIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('regulation_relevance')
    .select('regulation_id, relevance_reason')
    .eq('firm_id', firmId)
    .in('regulation_id', regulationIds)
    .not('dismissed_at', 'is', null)
  if (error) throw error
  return new Set((data ?? []).filter(r => !r.relevance_reason?.startsWith('NOT_RELEVANT:')).map(r => r.regulation_id as string))
}

// A development's own id with every version of it, for actions that apply
// to the development as a whole (dismiss, restore). An official document
// that followed an announcement stands for itself: the announcement may
// cover other rules too, and it stays hidden behind a dismissed document
// anyway (see collapseDuplicates).
async function developmentIds(regulationId: string): Promise<string[]> {
  const [own, later] = await Promise.all([versionRows('id', [regulationId]), versionRows('duplicate_of', [regulationId])])
  const first = own[0]?.duplicate_of
  if (first && isOfficialDocument(own[0].source)) {
    const [announcement] = await versionRows('id', [first])
    if (isAnnouncement(announcement?.source)) return [regulationId]
  }
  return [...new Set([regulationId, ...(first ? [first] : []), ...later.map(v => v.id)])]
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

// What a profile edit asks of the AI: rewrite the analyses of what the
// entity is matched to, re-judge recent items rejected on the old facts
// (regulatory and enforcement, and geopolitical when a location changed).
// None of it runs now. The request is recorded and the server does it all
// once, five minutes after the firm's last change (apply-profile-changes),
// so correcting several answers in a row is paid for once. Never awaited by
// callers: failing to record it must not fail the save.
interface ProfileWork {
  scope: 'firm' | 'fund' | 'company'
  entityId?: string
  refreshImpacts?: boolean
  rediscover?: boolean
  geopolitical?: boolean
}

function queueProfileWork(firmId: string | null | undefined, work: ProfileWork): void {
  if (!firmId || !(work.refreshImpacts || work.rediscover || work.geopolitical)) return
  supabase
    .from('profile_changes')
    .insert({
      firm_id: firmId,
      scope: work.scope,
      entity_id: work.entityId ?? null,
      refresh_impacts: !!work.refreshImpacts,
      rediscover: !!work.rediscover,
      geopolitical: !!work.geopolitical,
    })
    .then(
      () => {},
      () => {},
    )
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
// touches a country the firm is connected to. (A re-check after a location
// edit goes through queueProfileWork instead.) Resolves to how many new
// matches were found.
export async function matchGeopoliticalDevelopments(): Promise<number> {
  const result = await callFunction<{ relevant?: number }>('match-geopolitical-relevance', {})
  return result.relevant ?? 0
}

// Company profile answers that feed the geopolitical footprint (HQ is
// compared via the derived `hq_location` column instead).
const LOCATION_FIELDS = ['supplier_locations', 'facility_locations', 'operating_locations', 'foreign_countries'] as const

// Unset, '' and [] all mean "nothing recorded", so switching between them
// isn't a location change worth a re-evaluation (which costs an AI call).
const recorded = (v: unknown) => (v == null || v === '' || (Array.isArray(v) && v.length === 0) ? null : v)

// `meta`: the form's provenance edits (a fact confirmed, a supporting
// document named); see questionnaire.ts.
export async function saveFirmAnswers(firmId: string, answers: Answers, meta?: ProfileMeta): Promise<void> {
  const before = getCachedFirm()
  const row = toRow('firm', answers, { previous: before, meta })
  const { error } = await supabase.from('firms').update(row).eq('id', firmId)
  if (error) throw error
  patchCache<Firm>('firm', prev => ({ ...prev, ...row }) as Firm)
  const rediscover = matchingFactsChanged('firm', before, row)
  queueProfileWork(firmId, { scope: 'firm', refreshImpacts: true, rediscover, geopolitical: rediscover && firmLocationChanged(before, row) })
}

export async function addFund(firmId: string, answers: Answers, meta?: ProfileMeta): Promise<void> {
  const row = toRow('fund', answers, { meta })
  const { error } = await supabase.from('funds').insert({ ...row, firm_id: firmId })
  if (error) throw error
  // A new fund: items rejected before it existed may concern it, unless
  // only its name is recorded so far (nothing for a matcher to judge by).
  queueProfileWork(firmId, { scope: 'fund', rediscover: hasMatchingFacts('fund', row) })
}

export async function saveFundAnswers(fundId: string, answers: Answers, meta?: ProfileMeta): Promise<void> {
  const before = getCachedFunds()?.find(f => f.id === fundId)
  const row = toRow('fund', answers, { previous: before, meta })
  const { error } = await supabase.from('funds').update(row).eq('id', fundId)
  if (error) throw error
  queueProfileWork(before?.firm_id ?? getCachedFirmId(), { scope: 'fund', entityId: fundId, refreshImpacts: true, rediscover: matchingFactsChanged('fund', before, row) })
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
  writeCache('holdings', data ?? [])
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
  patchCache<FundHolding[]>('holdings', prev => {
    const others = prev.filter(h => !(h.fund_id === fundId && h.portfolio_company_id === companyId))
    return held ? [...others, { fund_id: fundId, portfolio_company_id: companyId }] : others
  })
  dropCache('regs:fund')
  matchGeopoliticalDevelopments().catch(() => {})
}

export async function addPortfolioCompany(firmId: string, answers: Answers, meta?: ProfileMeta): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').insert({ ...toRow('company', answers, { meta }), firm_id: firmId })
  if (error) throw error
  // A new company can bring new countries into the firm's footprint.
  queueProfileWork(firmId, { scope: 'company', geopolitical: true })
}

// A company's own research (company-regulations) was done from its old
// location, industry and operating footprint, so if any of those changed it
// is marked as needing a new scan. The scan itself, like the rest of the AI
// work an edit calls for, waits until the edits have stopped (lib/scans.ts),
// and replaces the old results only then.
//
// The mark is a scan date no real scan can have: unlike "never scanned"
// (null), it says there are old results to replace.
export const RESCAN_REQUESTED = '1970-01-01T00:00:00.000Z'
export const rescanRequested = (c: { last_scanned_at: string | null }) => !!c.last_scanned_at && Date.parse(c.last_scanned_at) === 0

export async function saveCompanyAnswers(firmId: string, previous: PortfolioCompany, answers: Answers, meta?: ProfileMeta): Promise<void> {
  const row = toRow('company', answers, { previous, meta })
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  // Compared with the old row as it would be saved today, not its raw text:
  // an old "Miami, Florida" is now saved as "Miami, Florida, United States",
  // which is the same place and must not pay for a new scan.
  const before = (asSaved('company', previous as unknown as Record<string, unknown>) ?? {}) as Record<string, unknown>
  const rescan = !same(before.hq_location, row.hq_location) || !same(before.sectors, row.sectors) || !same(before.regions, row.regions)
  const { error } = await supabase
    .from('portfolio_companies')
    .update(rescan && previous.last_scanned_at ? { ...row, last_scanned_at: RESCAN_REQUESTED } : row)
    .eq('id', previous.id)
  if (error) throw error

  // Spec §3: a changed location or supplier fact must cause geopolitical
  // matches to be reconsidered, not just future ones.
  const locationChanged =
    !same(before.hq_location, row.hq_location) ||
    LOCATION_FIELDS.some(f => !same(recorded(previous.profile?.[f]), recorded(answers[f])))
  queueProfileWork(firmId, {
    scope: 'company',
    entityId: previous.id,
    // Any fact can feed the analyses of what the company is matched to.
    refreshImpacts: true,
    // The firm-wide matchers read each company's sectors, regions and what
    // it does too (match-relevance's company lines).
    rediscover: matchingFactsChanged('company', previous, row),
    geopolitical: locationChanged,
  })
}

// Clears what a company's last scan found, just before it is scanned again
// from changed details. The user's dismissals are kept.
export async function clearCompanyResults(firmId: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from('regulation_relevance')
    .delete()
    .eq('firm_id', firmId)
    .eq('portfolio_company_id', companyId)
    .is('dismissed_at', null)
  if (error) throw error
  patchCache<Record<string, unknown>>('regs:company', prev => {
    const { [companyId]: _dropped, ...rest } = prev
    return rest
  })
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
export function requestImpact(regulationId: string): Promise<ImpactContent | null> {
  // One request per regulation at a time: an item opened twice before its
  // analysis is back (or an effect run twice) must not pay for it twice.
  const pending = impactRequests.get(regulationId)
  if (pending) return pending
  const request = callFunction<{ content: ImpactContent | null }>('regulation-impact', { regulationId })
    .then(({ content }) => {
      if (content) writeCache(`impact:${regulationId}`, content)
      return content
    })
    .finally(() => impactRequests.delete(regulationId))
  impactRequests.set(regulationId, request)
  return request
}
const impactRequests = new Map<string, Promise<ImpactContent | null>>()

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
  // The card stands for every version of the development.
  const { error } = await supabase
    .from('regulation_relevance')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('firm_id', firmId)
    .in('regulation_id', await developmentIds(regulationId))
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
    .in('regulation_id', await developmentIds(regulationId))
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
  const dismissed = (data as unknown as { relevance_reason: string | null; dismissed_at: string; regulations: Regulation | null }[])
    .filter(r => r.regulations && !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
    .sort((a, b) => b.dismissed_at.localeCompare(a.dismissed_at))
    .map(r => r.regulations as Regulation)
    .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  // One entry per development: restoring it brings back every version.
  return dismissed.filter(r => !r.duplicate_of || !seen.has(r.duplicate_of))
}

// Matches the Skeptic hid (SKEPTIC_MODE=on): stored as not relevant with
// its reason after this prefix (REVIEWED_PREFIX in
// supabase/functions/_shared/verdictReview.ts).
const HIDDEN_BY_REVIEW = 'NOT_RELEVANT: Reviewed: '

export interface HiddenMatch {
  id: string
  regulation: Regulation
  // The fund or company it was matched to; null for the firm itself.
  entity: string | null
  reason: string
}

export async function fetchHiddenByReview(firmId: string): Promise<HiddenMatch[]> {
  const { data, error } = await supabase
    .from('regulation_relevance')
    .select('id, relevance_reason, created_at, funds(name), portfolio_companies(name), regulations(*)')
    .eq('firm_id', firmId)
    .is('dismissed_at', null)
    .like('relevance_reason', `${HIDDEN_BY_REVIEW}%`)
    .order('created_at', { ascending: false })
  if (error) throw error
  type Row = { id: string; relevance_reason: string; funds: { name: string } | null; portfolio_companies: { name: string } | null; regulations: Regulation | null }
  return (data as unknown as Row[])
    .filter(r => r.regulations)
    .map(r => ({
      id: r.id,
      regulation: r.regulations as Regulation,
      entity: r.portfolio_companies?.name ?? r.funds?.name ?? null,
      reason: r.relevance_reason.slice(HIDDEN_BY_REVIEW.length),
    }))
}

// Puts a hidden match back with the reason the matcher gave
// (migration 0040), so it returns to the dashboard.
export async function restoreHiddenMatch(relevanceId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_reviewed_match', { p_relevance_id: relevanceId })
  if (error) throw error
  dropCache('regs:pe', 'regs:fund', 'regs:company')
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
  // sync-regulator-feeds: SEC, FTC, CFPB, FCA, PRA, UK legislation, ESMA, EUR-Lex.
  regulator_feeds: 'Regulator feeds (U.S., UK and EU)',
  // run-matching: the scheduled AI matching of new developments to firms.
  matching: 'Automatic matching',
}

// Recorded in sync_runs but not a data source: a failed run delays the
// grouping of duplicates or an alert email, it doesn't leave anything
// missing from the dashboard.
const NOT_DATA_SOURCES = new Set(['duplicates', 'profile_changes', 'match_alerts'])

// A source is "failing" when its most recent recorded sync run didn't
// succeed — shown so an empty or stale-looking dashboard reads as a stated
// limitation rather than silently implying nothing is relevant. Platform-
// wide status, not per-firm, so no firmId filter.
export async function fetchFailingSources(): Promise<string[]> {
  const { data, error } = await supabase.from('sync_runs').select('source, ok, stats').order('ran_at', { ascending: false }).limit(100)
  if (error || !data) return []
  const latestBySource = new Map<string, { source: string; ok: boolean; stats: unknown }>()
  for (const row of data as { source: string; ok: boolean; stats: unknown }[]) {
    if (!latestBySource.has(row.source)) latestBySource.set(row.source, row)
  }
  const names: string[] = []
  for (const { source, ok, stats } of latestBySource.values()) {
    if (ok || NOT_DATA_SOURCES.has(source)) continue
    if (source === 'regulator_feeds' && stats && typeof stats === 'object' && 'feeds' in stats && Array.isArray(stats.feeds)) {
      const feeds = stats.feeds.filter((feed: unknown): feed is { source: string; failures: number } =>
        !!feed && typeof feed === 'object' && 'source' in feed && typeof feed.source === 'string' &&
        'failures' in feed && typeof feed.failures === 'number' && feed.failures >= 3)
      if (feeds.length) {
        names.push(...feeds.map(feed => SOURCE_NAMES[feed.source] ?? feed.source))
        continue
      }
    }
    names.push(SOURCE_LABELS[source] ?? source)
  }
  return [...new Set(names)]
}

// Whether RegWay's AI is failing now (migration 0038's ai_status): a few
// calls in a row have failed since the last one that worked. Same for every
// firm. Null when it is working, or when the status can't be read.
export type AiOutage = { reason: 'credit' | 'auth' | 'rate_limited' | 'unavailable' | 'timeout' | 'other'; since: string }

export async function fetchAiOutage(): Promise<AiOutage | null> {
  const { data, error } = await supabase.rpc('ai_status')
  const row = (Array.isArray(data) ? data[0] : data) as { failing: boolean; reason: string | null; since: string | null } | null
  if (error || !row?.failing || !row.since) return null
  return { reason: (row.reason ?? 'other') as AiOutage['reason'], since: row.since }
}

const AI_OUTAGE_CAUSES: Record<AiOutage['reason'], string> = {
  credit: 'the AI service account has run out of credit',
  auth: 'the AI service is refusing RegWay\'s key',
  rate_limited: 'the AI service is turning requests away',
  unavailable: 'the AI service is not responding',
  timeout: 'the AI service is timing out',
  other: 'the AI service is returning errors',
}

export const aiOutageText = (outage: AiOutage): string =>
  `RegWay's AI has not been working since ${new Date(outage.since).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}: ${AI_OUTAGE_CAUSES[outage.reason]}. New matches, analyses and chat answers are paused until it is fixed.`

// ---------------------------------------------------------------------------
// Web research on the firm (roadmap item 18; research-firm, migration 0039).
// A finding enters the profile only when the user confirms it, with the
// page it came from as its provenance.
// ---------------------------------------------------------------------------

export async function fetchResearch(firmId: string): Promise<{ run: ResearchRun | null; findings: Finding[] }> {
  const [runs, findings] = await Promise.all([
    supabase.from('firm_research_runs').select('id, status, note, found, started_at, finished_at').eq('firm_id', firmId).order('started_at', { ascending: false }).limit(1),
    supabase.from('firm_findings').select('id, scope, entity_id, field, value, recorded, source_url, quote').eq('firm_id', firmId).eq('status', 'pending').order('created_at'),
  ])
  if (runs.error) throw runs.error
  if (findings.error) throw findings.error
  return { run: (runs.data?.[0] as ResearchRun | undefined) ?? null, findings: (findings.data ?? []) as Finding[] }
}

// Starts a run; an answer while one is already running returns that one.
export const startResearch = () => callFunction<{ runId?: string; status?: string }>('research-firm', {})

async function decideFinding(id: string, status: 'confirmed' | 'rejected'): Promise<void> {
  const { error } = await supabase.from('firm_findings').update({ status, decided_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export const rejectFinding = (id: string) => decideFinding(id, 'rejected')

const webMeta = (meta: ProfileMeta, fields: string[], url: string): ProfileMeta => ({
  ...meta,
  ...Object.fromEntries(fields.map(f => [f, { source: 'web' as const, url, confirmed_at: new Date().toISOString() }])),
})

// The finding's value (or the user's correction of it) saved into the
// profile through the same path as a Profile edit, so the usual re-matching
// follows.
export async function confirmFinding(firmId: string, finding: Finding, value: unknown = finding.value): Promise<void> {
  const scope: Scope = finding.scope
  const save = async (row: Record<string, unknown>, write: (answers: Answers, meta: ProfileMeta) => Promise<void>) => {
    const answers = { ...fromRow(scope, row), [finding.field]: value }
    await write(answers, webMeta(metaOf(row), [finding.field], finding.source_url))
  }
  if (scope === 'firm') {
    await save((await fetchFirm(firmId)) as unknown as Record<string, unknown>, (answers, meta) => saveFirmAnswers(firmId, answers, meta))
  } else if (scope === 'fund') {
    const fund = (await fetchFunds(firmId)).find(f => f.id === finding.entity_id)
    if (!fund) throw new Error('That fund is no longer in your profile')
    await save(fund as unknown as Record<string, unknown>, (answers, meta) => saveFundAnswers(fund.id, answers, meta))
  } else {
    const company = (await fetchPortfolioCompanies(firmId)).find(c => c.id === finding.entity_id)
    if (!company) throw new Error('That company is no longer in your profile')
    await save(company as unknown as Record<string, unknown>, (answers, meta) => saveCompanyAnswers(firmId, company, answers, meta))
  }
  await decideFinding(finding.id, 'confirmed')
}

// A fund or company the research found that the firm had not entered.
export async function addFoundEntity(firmId: string, finding: Finding): Promise<void> {
  const found = finding.value as FoundEntity
  if (finding.scope === 'fund') {
    await addFund(firmId, { name: found.name }, webMeta({}, ['name'], finding.source_url))
  } else {
    const answers: Answers = { name: found.name, website: found.website || undefined, description: found.description || undefined }
    await addPortfolioCompany(firmId, answers, webMeta({}, Object.keys(answers).filter(k => answers[k]), finding.source_url))
  }
  await decideFinding(finding.id, 'confirmed')
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

// The check run after an answer that claims something applies to the firm
// (regway-ai-chat/review.ts); null when none ran.
export interface AnswerReview {
  status: 'supported' | 'caution'
  checks: ('facts' | 'sources')[]
  claims: number
  notes: { claim: string; note: string }[]
}

export interface SavedMessage {
  role: 'user' | 'assistant'
  content: string
  citations: { url?: string; title?: string }[] | null
  review?: AnswerReview | null
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
    .select('role, content, citations, review')
    .eq('conversation_id', conversationId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

// Removes a conversation that has no saved messages: one whose first answer
// was stopped or failed, which must not stay in the chats list. A
// conversation with anything saved is left alone.
export async function discardEmptyConversation(conversationId: string): Promise<void> {
  const { data, error } = await supabase.from('regway_ai_messages').select('conversation_id').eq('conversation_id', conversationId).limit(1)
  if (error) throw error
  if (data.length === 0) await deleteConversation(conversationId)
}

// The stop button, for the server: it watches this stamp while it answers
// (regway-ai-chat/conversation.ts), since a closed connection doesn't reach it.
export async function markConversationStopped(conversationId: string): Promise<void> {
  const { error } = await supabase.from('regway_ai_conversations').update({ stopped_at: new Date().toISOString() }).eq('id', conversationId)
  if (error) throw error
}

// Deletes the conversation and (by cascade) its messages.
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.from('regway_ai_conversations').delete().eq('id', conversationId)
  if (error) throw error
}


// Email alerts (migration 0043): on unless the person turned them off. No
// row yet means on; send-match-alerts creates the row the first time it
// sees the person.
export async function fetchMatchAlerts(): Promise<boolean> {
  const { data, error } = await supabase.from('email_preferences').select('match_alerts').maybeSingle()
  if (error) throw error
  return (data as { match_alerts: boolean } | null)?.match_alerts ?? true
}

// Turning alerts back on starts from now, so the matches made while they
// were off don't arrive as one long email.
export async function setMatchAlerts(on: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('email_preferences')
    .upsert({ user_id: user.id, match_alerts: on, updated_at: now, ...(on ? { alerts_since: now } : {}) }, { onConflict: 'user_id' })
  if (error) throw error
}
