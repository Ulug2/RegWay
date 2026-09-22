import { supabase } from './supabase'
import type { Fund, PortfolioCompany, Regulation, RegulationNote } from './types'

export async function getFirmId(): Promise<string | null> {
  const { data, error } = await supabase.from('firm_members').select('firm_id').maybeSingle()
  if (error) throw error
  return data?.firm_id ?? null
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
