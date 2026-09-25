import { supabase } from './supabase'
import type { Firm, Fund, PortfolioCompany, Regulation, RegulationNote } from './types'

export async function getFirmId(): Promise<string | null> {
  const { data, error } = await supabase.from('firm_members').select('firm_id').maybeSingle()
  if (error) throw error
  return data?.firm_id ?? null
}

export async function fetchFirm(firmId: string): Promise<Firm> {
  const { data, error } = await supabase.from('firms').select('*').eq('id', firmId).single()
  if (error) throw error
  return data
}

export async function updateFirm(
  firmId: string,
  updates: Partial<Pick<Firm, 'name' | 'hq_location' | 'lead_gp_name' | 'jurisdictions'>>,
): Promise<void> {
  const { error } = await supabase.from('firms').update(updates).eq('id', firmId)
  if (error) throw error
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
  return data ?? []
}

export async function fetchFunds(firmId: string): Promise<Fund[]> {
  const { data, error } = await supabase.from('funds').select('*').eq('firm_id', firmId).order('name')
  if (error) throw error
  return data ?? []
}

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

export type FundInput = Pick<Fund, 'name' | 'size' | 'structure' | 'jurisdictions'>
export type PortfolioCompanyInput = Pick<
  PortfolioCompany,
  'name' | 'sectors' | 'regions' | 'hq_location' | 'aum' | 'offerings'
>

export async function addFund(firmId: string, fund: FundInput): Promise<void> {
  const { error } = await supabase.from('funds').insert({ ...fund, firm_id: firmId })
  if (error) throw error
}

export async function updateFund(fundId: string, fund: FundInput): Promise<void> {
  const { error } = await supabase.from('funds').update(fund).eq('id', fundId)
  if (error) throw error
}

export async function removeFund(fundId: string): Promise<void> {
  const { error } = await supabase.from('funds').delete().eq('id', fundId)
  if (error) throw error
}

export async function addPortfolioCompany(firmId: string, company: PortfolioCompanyInput): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').insert({ ...company, firm_id: firmId })
  if (error) throw error
}

// Cached company-regulations results were computed from the company's old
// location/sectors/regions, so if any of those changed, drop them — the
// dashboard re-scans on the next click when nothing is cached.
export async function updatePortfolioCompany(
  firmId: string,
  previous: PortfolioCompany,
  company: PortfolioCompanyInput,
): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').update(company).eq('id', previous.id)
  if (error) throw error

  const changed =
    (previous.hq_location ?? '') !== (company.hq_location ?? '') ||
    JSON.stringify(previous.sectors) !== JSON.stringify(company.sectors) ||
    JSON.stringify(previous.regions) !== JSON.stringify(company.regions)
  if (changed) {
    const { error: clearError } = await supabase
      .from('regulation_relevance')
      .delete()
      .eq('firm_id', firmId)
      .eq('portfolio_company_id', previous.id)
    if (clearError) throw clearError
  }
}

export async function removePortfolioCompany(companyId: string): Promise<void> {
  const { error } = await supabase.from('portfolio_companies').delete().eq('id', companyId)
  if (error) throw error
}
