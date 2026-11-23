import { describe, expect, it } from 'vitest'
import { companiesInFund, fundFromSearch, fundOptions, NO_FUND, searchWithFund, validChoice } from '../../src/lib/fundFilter'
import type { Fund, FundHolding, PortfolioCompany } from '../../src/lib/types'

const fund = (id: string, name: string) => ({ id, name }) as Fund
const company = (id: string) => ({ id, name: id }) as PortfolioCompany
const hold = (fund_id: string, portfolio_company_id: string): FundHolding => ({ fund_id, portfolio_company_id })

const FUNDS = [fund('f1', 'Fund I'), fund('f2', 'Fund II'), fund('f3', 'Fund III')]
const COMPANIES = ['acme', 'beta', 'gamma', 'delta'].map(company)
// beta sits in two funds; delta in none; Fund III holds nothing.
const HOLDINGS = [hold('f1', 'acme'), hold('f1', 'beta'), hold('f2', 'beta'), hold('f2', 'gamma')]

const ids = (list: PortfolioCompany[]) => list.map(c => c.id)

describe('companies in a fund', () => {
  it('all funds lists every company', () => {
    expect(ids(companiesInFund(COMPANIES, HOLDINGS, null))).toEqual(['acme', 'beta', 'gamma', 'delta'])
  })

  it("a fund lists only what it holds, and a company in two funds shows under both, in the list's order", () => {
    expect(ids(companiesInFund(COMPANIES, HOLDINGS, 'f1'))).toEqual(['acme', 'beta'])
    expect(ids(companiesInFund(COMPANIES, HOLDINGS, 'f2'))).toEqual(['beta', 'gamma'])
    expect(ids(companiesInFund(COMPANIES, HOLDINGS, 'f3'))).toEqual([])
  })

  it('"no fund recorded" lists the companies no fund holds', () => {
    expect(ids(companiesInFund(COMPANIES, HOLDINGS, NO_FUND))).toEqual(['delta'])
    expect(ids(companiesInFund(COMPANIES, [], NO_FUND))).toEqual(['acme', 'beta', 'gamma', 'delta'])
  })
})

describe('the choices', () => {
  it('all funds first, each fund with its count, then "No fund recorded"', () => {
    expect(fundOptions(FUNDS, COMPANIES, HOLDINGS)).toEqual([
      { key: null, label: 'All funds', count: 4 },
      { key: 'f1', label: 'Fund I', count: 2 },
      { key: 'f2', label: 'Fund II', count: 2 },
      { key: 'f3', label: 'Fund III', count: 0 },
      { key: NO_FUND, label: 'No fund recorded', count: 1 },
    ])
  })

  it('offers "No fund recorded" only when some company has no fund', () => {
    const options = fundOptions(FUNDS, COMPANIES, [...HOLDINGS, hold('f3', 'delta')])
    expect(options.map(o => o.key)).toEqual([null, 'f1', 'f2', 'f3'])
  })
})

describe('the address', () => {
  it('reads the fund from the query', () => {
    expect(fundFromSearch('?fund=f2')).toBe('f2')
    expect(fundFromSearch('?fund=none')).toBe(NO_FUND)
    expect(fundFromSearch('')).toBeNull()
    expect(fundFromSearch('?fund=')).toBeNull()
  })

  it('writes the fund in, and takes it out for all funds, keeping other parameters', () => {
    expect(searchWithFund('', 'f1')).toBe('?fund=f1')
    expect(searchWithFund('?fund=f1', null)).toBe('')
    expect(searchWithFund('?x=1&fund=f1', 'f2')).toBe('?x=1&fund=f2')
    expect(searchWithFund('?x=1&fund=f1', null)).toBe('?x=1')
  })

  it('a link to a fund that no longer exists means all funds, once the funds are known', () => {
    expect(validChoice('gone', FUNDS)).toBeNull()
    expect(validChoice('gone', null)).toBe('gone')
    expect(validChoice('f2', FUNDS)).toBe('f2')
    expect(validChoice(NO_FUND, FUNDS)).toBe(NO_FUND)
  })
})
