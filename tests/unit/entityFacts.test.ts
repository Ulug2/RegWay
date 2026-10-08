import { describe, expect, it } from 'vitest'
import { COMPANY_FACTS, COMPANY_UNKNOWNS, FIRM_FACTS, FIRM_UNKNOWNS, facts } from '../../supabase/functions/_shared/entityFacts'

const NOW = Date.parse('2026-10-08T00:00:00Z')

describe('what the AI is told about an entity', () => {
  it('lists recorded facts and leaves blank ones out', () => {
    const row = { hq_location: 'Miami, Florida', jurisdictions: ['United States'], profile: { firm_type: 'Private Equity', strategies: [], legal_domicile: { city: '', state: 'Delaware', country: 'United States' } } }
    expect(facts(row, FIRM_FACTS)).toBe('hq_location: Miami, Florida; legal_domicile: Delaware, United States; jurisdictions: United States; firm_type: Private Equity')
    expect(facts(null, FIRM_FACTS)).toBe('')
  })

  it('names a blank fact that would change a conclusion as not recorded, never as "no"', () => {
    const company = { hq_location: 'Houston, Texas', sectors: ['Healthcare'], regions: ['Texas'], profile: { sensitive_data: ['Health / patient information'], trade: 'No' } }
    const text = facts(company, COMPANY_FACTS, COMPANY_UNKNOWNS)
    expect(text).toContain('sensitive_data: Health / patient information')
    // An answered "No" is a fact; only blanks are unknown.
    expect(text).toContain('trade: No')
    expect(text.endsWith('not recorded: supplier_locations, customers, consumer_facing, regulated, gov_contracts, outside_us')).toBe(true)
  })

  it('says nothing about unknowns when every such fact is recorded', () => {
    const firm = { profile: { adviser_registration: 'Not registered', legal_domicile: { country: 'Cayman Islands', state: '', city: '' }, strategies: ['Buyout'] } }
    expect(facts(firm, FIRM_FACTS, FIRM_UNKNOWNS)).not.toContain('not recorded')
  })

  it('marks a fact last confirmed over a year ago, and only then', () => {
    const company = {
      profile: { supplier_locations: ['Vietnam'], customers: ['Consumers'], regulated: 'Yes' },
      profile_meta: {
        supplier_locations: { source: 'user', confirmed_at: '2025-06-01T10:00:00Z' },
        customers: { source: 'user', confirmed_at: '2026-09-01T10:00:00Z' },
        // `regulated` has no entry: recorded before dates were kept.
      },
    }
    expect(facts(company, COMPANY_FACTS, [], NOW)).toBe('supplier_locations: Vietnam (last confirmed 2025-06-01); customers: Consumers; regulated: Yes')
  })

  it('dates a derived column by the oldest answer behind it', () => {
    const company = {
      hq_location: 'Naples, Italy',
      regions: ['Italy', 'France'],
      sectors: ['Aerospace'],
      profile: {},
      profile_meta: {
        hq: { source: 'user', confirmed_at: '2026-10-01T00:00:00Z' },
        operating_locations: { source: 'user', confirmed_at: '2026-10-01T00:00:00Z' },
        foreign_countries: { source: 'document', document: 'Board pack', confirmed_at: '2024-12-31T00:00:00Z' },
      },
    }
    expect(facts(company, COMPANY_FACTS, [], NOW)).toBe('hq_location: Naples, Italy; sectors: Aerospace; regions: Italy, France (last confirmed 2024-12-31)')
  })
})
