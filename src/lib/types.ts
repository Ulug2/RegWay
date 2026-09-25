export interface Firm {
  id: string
  name: string
  hq_location: string | null
  lead_gp_name: string | null
  jurisdictions: string[]
  website: string | null
  profile: Record<string, unknown>
}

export interface Fund {
  id: string
  firm_id: string
  name: string
  size: string | null
  structure: string | null
  jurisdictions: string[]
  profile: Record<string, unknown>
}

export interface PortfolioCompany {
  id: string
  firm_id: string
  name: string
  sectors: string[]
  regions: string[]
  hq_location: string | null
  aum: string | null
  offerings: string | null
  website: string | null
  profile: Record<string, unknown>
}

export interface Regulation {
  id: string
  source: 'federal_register' | 'sec_edgar' | 'ai_search' | 'manual'
  title: string
  agency: string | null
  jurisdiction: string | null
  summary: string | null
  published_date: string | null
  effective_date: string | null
  source_url: string
}

export interface RegulationNote {
  id: string
  regulation_id: string
  user_id: string
  body: string
  created_at: string
}
