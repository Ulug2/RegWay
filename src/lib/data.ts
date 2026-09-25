import { supabase } from './supabase'
import { readCache, writeCache, patchCache } from './cache'
import { toRow, type Answers } from './questionnaire'
import type { Firm, Fund, PortfolioCompany, Regulation, RegulationNote } from './types'

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
  let query = supabase.from('regulation_relevance').select('relevance_reason, regulations(*)').eq('firm_id', filters.firmId)

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
    !same(previous.regions, row.regions) ||
    !same(previous.website, row.website)
  if (changed) {
    const { error: clearError } = await supabase
      .from('regulation_relevance')
      .delete()
      .eq('firm_id', firmId)
      .eq('portfolio_company_id', previous.id)
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
