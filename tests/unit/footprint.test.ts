import { describe, expect, it } from 'vitest'
import { companyFootprint, describeFootprint, firmFootprint, foreignCountries, hasForeignExposure, overlaps } from '../../supabase/functions/_shared/footprint.ts'
import type { CompanyRow, FirmRow } from '../../supabase/functions/_shared/relevance.ts'

const firm = (over: Partial<FirmRow> = {}): FirmRow => ({ name: 'Harbor Capital', hq_location: 'Miami, Florida', jurisdictions: null, profile: null, ...over })
const company = (over: Partial<CompanyRow> = {}): CompanyRow => ({ id: 'c1', name: 'Aero Logistics', hq_location: null, sectors: null, regions: null, offerings: null, profile: null, ...over })

describe('firmFootprint', () => {
  it('records headquarters and legal domicile separately', () => {
    const fp = firmFootprint(firm({ profile: { hq: { city: 'Miami', state: 'Florida', country: 'United States' }, legal_domicile: 'Cayman Islands', firm_type: 'Private equity', strategies: ['Buyout', 'Growth'] } }))
    expect(fp.facts).toEqual([
      { kind: 'headquarters', country: 'United States' },
      { kind: 'legal domicile', country: 'Cayman Islands' },
    ])
    expect(fp.activities).toEqual(['Private equity', 'Buyout', 'Growth'])
    expect(fp.unplacedLocations).toBe(false)
  })

  it('falls back to the legacy hq_location column', () => {
    expect(firmFootprint(firm()).facts).toEqual([{ kind: 'headquarters', country: 'United States' }])
  })
})

describe('companyFootprint', () => {
  const aero = company({
    hq_location: 'Naples, Italy',
    sectors: ['Aerospace'],
    offerings: 'Aircraft parts logistics',
    profile: {
      facility_locations: ['Turin', 'Austin, TX'],
      operating_locations: ['Italy', 'Germany'],
      foreign_countries: ['Germany', 'India'],
      supplier_locations: ['Vietnam'],
    },
  })

  it('keeps each kind of connection distinguishable, without duplicates', () => {
    expect(companyFootprint(aero).facts).toEqual([
      { kind: 'headquarters', country: 'Italy' },
      { kind: 'facilities', country: 'United States' },
      { kind: 'operations', country: 'Italy' },
      { kind: 'operations', country: 'Germany' },
      { kind: 'operations', country: 'India' },
      { kind: 'suppliers', country: 'Vietnam' },
    ])
  })

  it('flags a location it cannot place instead of dropping it silently', () => {
    expect(companyFootprint(aero).unplacedLocations).toBe(true) // "Turin"
    expect(companyFootprint(company({ hq_location: 'Italy' })).unplacedLocations).toBe(false)
  })

  it('distinguishes "no suppliers recorded" from recorded suppliers', () => {
    expect(companyFootprint(aero).suppliersRecorded).toBe(true)
    expect(companyFootprint(company()).suppliersRecorded).toBe(false)
    expect(companyFootprint(company({ profile: { supplier_locations: [] } })).suppliersRecorded).toBe(false)
  })

  it('uses legacy regions only when no operating locations are recorded', () => {
    expect(companyFootprint(company({ regions: ['Canada'] })).facts).toEqual([{ kind: 'operations', country: 'Canada' }])
    expect(companyFootprint(company({ regions: ['Canada'], profile: { operating_locations: ['Mexico'] } })).facts).toEqual([{ kind: 'operations', country: 'Mexico' }])
  })

  it('lists what the company does', () => {
    expect(companyFootprint(aero).activities).toEqual(['Aerospace', 'Aircraft parts logistics'])
    expect(companyFootprint(company({ offerings: '  ' })).activities).toEqual([])
  })
})

describe('pre-filter helpers', () => {
  const italian = companyFootprint(company({ name: 'Aero', hq_location: 'Naples, Italy', profile: { supplier_locations: ['Vietnam'] } }))
  const domestic = companyFootprint(company({ name: 'SoftCo', hq_location: 'Austin, Texas' }))
  const vague = companyFootprint(company({ name: 'GlobalCo', hq_location: 'Texas', profile: { operating_locations: ['International'] } }))

  it('lists the non-U.S. countries a firm touches', () => {
    expect(foreignCountries([italian, domestic])).toEqual(['Italy', 'Vietnam'])
    expect(foreignCountries([domestic])).toEqual([])
  })

  it('treats a U.S.-only footprint as having no foreign exposure', () => {
    expect(hasForeignExposure([domestic])).toBe(false)
    expect(hasForeignExposure([domestic, italian])).toBe(true)
  })

  it('counts an unplaced location as possible foreign exposure', () => {
    expect(hasForeignExposure([vague])).toBe(true)
  })

  it('names the exact overlapping facts for a development', () => {
    expect(overlaps([italian, domestic], ['Vietnam', 'Iran'])).toEqual(['Aero (company) — suppliers: Vietnam'])
    expect(overlaps([italian, domestic], ['Iran'])).toEqual([])
  })
})

describe('describeFootprint', () => {
  it('states unknowns explicitly rather than leaving them out', () => {
    const line = describeFootprint(companyFootprint(company({ name: 'SoftCo', hq_location: 'Austin, Texas' })))
    expect(line).toBe('- SoftCo (company): activity: NOT RECORDED; headquarters: United States; key suppliers: NOT RECORDED')
  })

  it('never says a firm has unrecorded suppliers (suppliers are a company fact)', () => {
    expect(describeFootprint(firmFootprint(firm()))).not.toContain('suppliers')
  })

  it('says when suppliers are recorded but cannot be placed', () => {
    const line = describeFootprint(companyFootprint(company({ profile: { supplier_locations: ['Asia'] } })))
    expect(line).toContain('key suppliers: recorded but not placed in a specific country')
    expect(line).toContain('locations recorded without a country')
  })
})
