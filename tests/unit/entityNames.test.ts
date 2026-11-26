import { describe, expect, it } from 'vitest'
import { resolveEntity } from '../../supabase/functions/_shared/entityNames'
import { buildRelevanceRows } from '../../supabase/functions/_shared/relevance'

// A matcher often shortens a fund's or company's name. Before, the exact
// name was looked up, and a shortened one was saved as the firm's match
// (first scored test set, 2026-11-25: "Brightwell Wealth" for "Brightwell
// Wealth (test)" on an FCA consultation).

const companies = [
  { id: 'c1', name: 'Brightwell Wealth (test)' },
  { id: 'c2', name: 'A.L.A. S.p.A. (Advanced Logistics for Aerospace)' },
  { id: 'c3', name: 'Rheintal Batterie GmbH (test)' },
  { id: 'c4', name: 'GetixHealth' },
  { id: 'c5', name: 'Harbor Health' },
  { id: 'c6', name: 'Harbor Health Partners' },
]

describe('finding the entity a model named', () => {
  it('finds it by its exact name, any case', () => {
    expect(resolveEntity(companies, ' getixhealth ')?.id).toBe('c4')
    expect(resolveEntity(companies, 'Harbor Health')?.id).toBe('c5')
  })

  it('finds it without what is in brackets, and without punctuation', () => {
    expect(resolveEntity(companies, 'Brightwell Wealth')?.id).toBe('c1')
    expect(resolveEntity(companies, 'A.L.A. S.p.A.')?.id).toBe('c2')
    expect(resolveEntity(companies, 'ALA SpA')?.id).toBe('c2')
  })

  it('finds it when one name starts with the other, word for word', () => {
    expect(resolveEntity(companies, 'Rheintal Batterie')?.id).toBe('c3')
    expect(resolveEntity(companies, 'GetixHealth Inc.')?.id).toBe('c4')
    // Not part of a word.
    expect(resolveEntity(companies, 'Getix')).toBeNull()
  })

  it('gives nothing for a name it can\'t tell apart, or that the firm doesn\'t have', () => {
    expect(resolveEntity([...companies, { id: 'c7', name: 'Brightwell Wealth Ltd' }], 'Brightwell')).toBeNull()
    expect(resolveEntity(companies, 'Aero Italia S.p.A.')).toBeNull()
    expect(resolveEntity(companies, '')).toBeNull()
    expect(resolveEntity(companies, null)).toBeNull()
  })
})

describe('saving a verdict', () => {
  const candidates = [{ id: 'reg-1' }]

  it("saves a shortened company name as that company's match", () => {
    const [row] = buildRelevanceRows([{ index: 0, relevant: true, reason: 'FCA-authorised.', scope: 'company', entity_name: 'Brightwell Wealth' }], candidates, 'firm-1', [], companies)
    expect(row).toMatchObject({ portfolio_company_id: 'c1', fund_id: null, relevance_reason: 'FCA-authorised.' })
  })

  it("never saves a company it can't find as the firm's match", () => {
    const [row] = buildRelevanceRows([{ index: 0, relevant: true, reason: 'Invented.', scope: 'company', entity_name: 'Aero Italia S.p.A.' }], candidates, 'firm-1', [], companies)
    expect(row.portfolio_company_id).toBeNull()
    expect(row.relevance_reason).toBe('NOT_RELEVANT: named "Aero Italia S.p.A.", not one of the firm\'s funds or companies. Invented.')
  })
})
