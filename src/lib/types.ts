import type { ProfileMeta } from './questionnaire'

export interface Firm {
  id: string
  name: string
  hq_location: string | null
  lead_gp_name: string | null
  jurisdictions: string[]
  website: string | null
  profile: Record<string, unknown>
  // Where each answer came from and when it was last confirmed.
  profile_meta?: ProfileMeta | null
  profile_updated_at: string | null
  // When the firm signed up: the first day its pages can step back to.
  created_at?: string
}

export interface Fund {
  id: string
  firm_id: string
  name: string
  size: string | null
  structure: string | null
  jurisdictions: string[]
  profile: Record<string, unknown>
  // Where each answer came from and when it was last confirmed.
  profile_meta?: ProfileMeta | null
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
  // Where each answer came from and when it was last confirmed.
  profile_meta?: ProfileMeta | null
  last_scanned_at: string | null
  profile_updated_at: string | null
  logo_url: string | null
  created_at?: string
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
    // Regulator feeds (supabase/functions/_shared/regulatorFeeds.ts).
    | 'sec_news'
    | 'ftc_news'
    | 'cfpb_news'
    | 'fca_publications'
    | 'pra_publications'
    | 'uk_legislation'
    | 'esma_news'
    | 'eur_lex'
    | 'eu_sanctions'
    | 'uk_sanctions'
    | 'ofsi'
  category: 'regulatory' | 'enforcement' | 'geopolitical'
  // Countries the development concerns (empty = global/unspecified).
  countries: string[]
  title: string
  agency: string | null
  jurisdiction: string | null
  summary: string | null
  // For a document on Federal Register public inspection (filed, not yet
  // published), the scheduled publication date.
  published_date: string | null
  effective_date: string | null
  source_url: string
  on_public_inspection?: boolean
  // The first version of the same development, when this row is a later
  // one (see lib/duplicates.ts).
  duplicate_of?: string | null
}

// Another version of a development: enough to link to it.
export interface PublishedVersion {
  id: string
  source: Regulation['source']
  title: string
  agency: string | null
  published_date: string | null
  source_url: string
  duplicate_of: string | null
}

// A regulation as listed on one entity's page, with that entity's own
// explanation of why it was matched (spec §5: each appearance uses the
// explanation appropriate to the selected entity).
export interface MatchedRegulation extends Regulation {
  match_reason: string | null
  // When it was matched to this entity (for the "New" badge).
  matched_at: string | null
  // The same development's other versions, shown as links on its card.
  also_published_as?: PublishedVersion[]
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
