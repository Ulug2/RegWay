import { describe, expect, it } from 'vitest'
import { firmLocationChanged, hasMatchingFacts, matchingFactsChanged } from '../../src/lib/matchingFacts'
import { fromRow, toRow, type Answers } from '../../src/lib/questionnaire'

// As stored: an older row, with the location only in `hq_location`.
const firm = { name: 'H.I.G. Capital', website: 'https://hig.com', hq_location: 'Miami, Florida, United States', jurisdictions: ['Florida'], profile: { strategies: ['Buyout'], employees: '400' } }
const company = { name: 'GetixHealth', website: 'https://getixhealth.com', hq_location: 'Sugar Land, Texas, United States', sectors: ['Healthcare'], regions: ['All United States'], offerings: 'Billing', profile: { industry: 'Healthcare', operating_locations: ['All United States'], products: ['Billing'] } }

// What a save writes: the form's answers, loaded from the row, with an edit.
const edited = (scope: 'firm' | 'fund' | 'company', row: Record<string, unknown>, change: Answers) => toRow(scope, { ...fromRow(scope, row), ...change })

describe('which edits re-check matches', () => {
  it('a fact the matchers use, on the firm', () => {
    expect(matchingFactsChanged('firm', firm, edited('firm', firm, { strategies: ['Buyout', 'Growth Equity'] }))).toBe(true)
  })

  it('not an answer the matchers never read, even on an older row', () => {
    expect(matchingFactsChanged('firm', firm, edited('firm', firm, { website: 'https://hig.example', employees: '450' }))).toBe(false)
  })

  it('a save with no change at all', () => {
    expect(matchingFactsChanged('company', company, edited('company', company, {}))).toBe(false)
  })

  it('re-checks when there is nothing to compare against', () => {
    expect(matchingFactsChanged('fund', null, toRow('fund', { name: 'New fund' }))).toBe(true)
  })

  it('a new fund with only a name gives the matchers nothing to judge by', () => {
    expect(hasMatchingFacts('fund', toRow('fund', { name: 'New fund' }))).toBe(false)
    expect(hasMatchingFacts('fund', toRow('fund', { name: 'New fund', strategy: 'Buyout' }))).toBe(true)
  })

  it("a company's sectors", () => {
    expect(matchingFactsChanged('company', company, edited('company', company, { secondary_industries: ['Technology'] }))).toBe(true)
  })

  it("the firm's own location, for the geopolitical re-check", () => {
    expect(firmLocationChanged(firm, edited('firm', firm, { hq: { country: 'United States', state: 'Massachusetts', city: 'Boston' } }))).toBe(true)
    expect(firmLocationChanged(firm, edited('firm', firm, { strategies: ['Credit'] }))).toBe(false)
  })
})
