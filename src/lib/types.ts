export interface Firm {
  id: string
  name: string
  hq_location: string | null
  lead_gp_name: string | null
  jurisdictions: string[]
  website: string | null
  profile: Record<string, unknown>
  profile_updated_at: string | null
}

export interface Fund {
  id: string
  firm_id: string
  name: string
  size: string | null
  structure: string | null
  jurisdictions: string[]
  profile: Record<string, unknown>
  profile_updated_at: string | null
}

// One fund holding one portfolio company (`fund_holdings`). Many to many.
export interface FundHolding {
  fund_id: string
  portfolio_company_id: string
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
  last_scanned_at: string | null
  profile_updated_at: string | null
  logo_url: string | null
}

export interface AiContext {
  type: 'regulation' | 'fund' | 'company'
  id: string
  name: string
  regulation?: {
    agency?: string | null
    jurisdiction?: string | null
    summary?: string | null
    published_date?: string | null
    effective_date?: string | null
  }
}

export interface Regulation {
  id: string
  source:
    | 'federal_register'
    | 'sec_edgar'
    | 'ai_search'
    | 'manual'
    | 'sec_enforcement'
    | 'sec_admin_proceedings'
    | 'finra_enforcement'
    | 'state_travel_advisories'
  category: 'regulatory' | 'enforcement' | 'geopolitical'
  // Countries the development concerns (empty = global/unspecified).
  countries: string[]
  title: string
  agency: string | null
  jurisdiction: string | null
  summary: string | null
  published_date: string | null
  effective_date: string | null
  source_url: string
}

// A regulation as listed on one entity's page, with that entity's own
// explanation of why it was matched (spec §5: each appearance uses the
// explanation appropriate to the selected entity).
export interface MatchedRegulation extends Regulation {
  match_reason: string | null
}

export interface RegulationNote {
  id: string
  regulation_id: string
  user_id: string
  body: string
  created_at: string
}

export interface ImpactEntity {
  entity_type: 'firm' | 'fund' | 'company'
  entity_name: string
  headline: string
  how_it_applies: string
  obligations: string[]
  timeline: string
  operational_areas: string[]
  open_questions: string[]
}

// AI-written, neutral analysis of one regulation for one firm.
export interface ImpactContent {
  overview: string
  scope: string
  status: string
  key_provisions: string[]
  key_dates: { label: string; date: string; note: string }[]
  impacts: ImpactEntity[]
  considerations: string[]
  limitations: string
  text_truncated?: boolean
}
