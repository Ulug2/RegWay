import { supabase } from './supabase'
import { readCache, writeCache, patchCache, dropCache } from './cache'
import { callFunction } from './functions'
import { toRow, type Answers } from './questionnaire'
import type { Firm, Fund, ImpactContent, PortfolioCompany, Regulation, RegulationNote } from './types'

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
  regulations: Regulation | null
}

async function fetchRelevantRegulations(filters: {
  firmId: string
  scope: 'firm' | 'fund' | 'company'
  companyId?: string
}): Promise<Regulation[]> {
  let query = supabase
    .from('regulation_relevance')
    .select('relevance_reason, regulations(*)')
    .eq('firm_id', filters.firmId)
    .is('dismissed_at', null)

  if (filters.scope === 'company' && filters.companyId) {
    query = query.eq('portfolio_company_id', filters.companyId)
  } else if (filters.scope === 'fund') {
    query = query.not('fund_id', 'is', null)
  } else {
    query = query.is('fund_id', null).is('portfolio_company_id', null)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as unknown as RelevanceRow[])
    .filter(r => r.regulations && !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
    .map(r => r.regulations as Regulation)
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
export const fetchFundRegulations = (firmId: string) => fetchRelevantRegulations({ firmId, scope: 'fund' })
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

export async function saveFirmAnswers(firmId: string, answers: Answers): Promise<void> {
  const row = toRow('firm', answers)
  const { error } = await supabase.from('firms').update(row).eq('id', firmId)
  if (error) throw error
  patchCache<Firm>('firm', prev => ({ ...prev, ...row }) as Firm)
}

export async function addFund(firmId: string, answers: Answers): Promise<void> {
  const { error } = await supabase.from('funds').insert({ ...toRow('fund', answers), firm_id: firmId })
  if (error) throw error
}

export async function saveFundAnswers(fundId: string, answers: Answers): Promise<void> {
  const { error } = await supabase.from('funds').update(toRow('fund', answers)).eq('id', fundId)
  if (error) throw error
}

export async function removeFund(fundId: string): Promise<void> {
  const { error } = await supabase.from('funds').delete().eq('id', fundId)
  if (error) throw error
}

export async function addPortfolioCompany(firmId: string, answers: Answers): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').insert({ ...toRow('company', answers), firm_id: firmId })
  if (error) throw error
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

// Asks the backend to generate the analysis now (it's normally prepared in the
// background as soon as a regulation is matched, so this is the fallback).
export async function requestImpact(regulationId: string): Promise<ImpactContent> {
  const { content } = await callFunction<{ content: ImpactContent }>('regulation-impact', { regulationId })
  writeCache(`impact:${regulationId}`, content)
  return content
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
  patchCache<Regulation[] | null>('regs:pe', without)
  patchCache<Regulation[] | null>('regs:fund', without)
  patchCache<Record<string, Regulation[]>>('regs:company', prev =>
    Object.fromEntries(Object.entries(prev).map(([id, list]) => [id, list.filter(r => r.id !== regulationId)])),
  )
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
