// Which portfolio companies the dashboard lists when a fund is chosen (issue
// #11; the owner's decisions of 2026-11-22). A company can sit in several
// funds (`fund_holdings`), and one with no fund recorded must stay
// reachable, so it has a choice of its own. The choice lives in the address
// (`/?fund=<id>`, or `?fund=none`), so a reload or a shared link keeps it.

import type { Fund, FundHolding, PortfolioCompany } from './types'

// The choice for companies no fund holds.
export const NO_FUND = 'none'

// null = all funds; a fund's id; or NO_FUND.
export type FundChoice = string | null

export interface FundOption {
  key: FundChoice
  label: string
  count: number
}

export function companiesInFund(companies: PortfolioCompany[], holdings: FundHolding[], fund: FundChoice): PortfolioCompany[] {
  if (fund === null) return companies
  if (fund === NO_FUND) {
    const held = new Set(holdings.map(h => h.portfolio_company_id))
    return companies.filter(c => !held.has(c.id))
  }
  const inFund = new Set(holdings.filter(h => h.fund_id === fund).map(h => h.portfolio_company_id))
  return companies.filter(c => inFund.has(c.id))
}

// The fund menu: "All funds", each fund in the order given, then "No fund
// recorded" only when some company has none. Counts are of the companies
// each would list.
export function fundOptions(funds: Fund[], companies: PortfolioCompany[], holdings: FundHolding[]): FundOption[] {
  const options: FundOption[] = [
    { key: null, label: 'All funds', count: companies.length },
    ...funds.map(f => ({ key: f.id, label: f.name, count: companiesInFund(companies, holdings, f.id).length })),
  ]
  const unheld = companiesInFund(companies, holdings, NO_FUND).length
  if (unheld > 0) options.push({ key: NO_FUND, label: 'No fund recorded', count: unheld })
  return options
}

// The choice written in an address's query (`?fund=`), or null.
export function fundFromSearch(search: string): FundChoice {
  return new URLSearchParams(search).get('fund') || null
}

// The same query with the choice written in, or removed for "All funds".
// Other parameters are kept.
export function searchWithFund(search: string, fund: FundChoice): string {
  const params = new URLSearchParams(search)
  if (fund === null) params.delete('fund')
  else params.set('fund', fund)
  const query = params.toString()
  return query ? `?${query}` : ''
}

// A choice that names a fund that no longer exists (a stale link) means all
// funds. Unknown until the funds have loaded, so kept as given meanwhile.
export function validChoice(fund: FundChoice, funds: Fund[] | null): FundChoice {
  if (fund === null || fund === NO_FUND || !funds) return fund
  return funds.some(f => f.id === fund) ? fund : null
}
