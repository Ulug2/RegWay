import type { Page } from '@playwright/test'
import { FIRM_ID, expect, signIn, test } from './mockBackend'

async function openProfile(page: Page, tab: 'Funds' | 'Portfolio Companies') {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: tab, exact: true }).click()
}

const card = (page: Page, name: string) => page.locator('.glass-card', { hasText: name }).first()

test.describe('which fund holds which company', () => {
  test('reads "Not recorded" until the user says, and never guesses', async ({ page }) => {
    await openProfile(page, 'Portfolio Companies')
    await page.getByRole('button', { name: /Aero Logistics/ }).click()
    await expect(page.getByText('Which of your funds hold this company?')).toBeVisible()
    await expect(page.getByText('Not recorded')).toBeVisible()
  })

  test('selecting a fund saves the holding and brings fund matches up to date', async ({ page, backend }) => {
    await openProfile(page, 'Portfolio Companies')
    await page.getByRole('button', { name: /Aero Logistics/ }).click()
    await page.getByRole('button', { name: 'Harbor Fund I', exact: true }).click()

    await expect(page.getByText('Not recorded')).toHaveCount(0)
    await expect.poll(() => backend.called('POST', 'rest/v1/fund_holdings').length).toBe(1)
    expect(backend.called('POST', 'rest/v1/fund_holdings')[0].body).toEqual({ firm_id: FIRM_ID, fund_id: 'fund-1', portfolio_company_id: 'co-aero' })
    // Fund-level matches are re-derived by the matcher; no re-evaluation of
    // rejected items is asked for (that would cost an AI call).
    const matcherCalls = backend.called('POST', 'functions/v1/match-geopolitical-relevance').map(c => c.body)
    expect(matcherCalls.every(body => !body?.reevaluate)).toBe(true)
  })

  test('the fund’s card lists the companies it holds', async ({ page, backend }) => {
    backend.tables.fund_holdings.push({ firm_id: FIRM_ID, fund_id: 'fund-1', portfolio_company_id: 'co-aero' })
    await openProfile(page, 'Funds')
    await page.getByRole('button', { name: /Harbor Fund I\b(?!I)/ }).first().click()
    const fund = card(page, 'Portfolio companies this fund holds')
    await expect(fund.getByText('Aero Logistics')).toBeVisible()
  })

  test('unselecting a fund removes the holding', async ({ page, backend }) => {
    backend.tables.fund_holdings.push({ firm_id: FIRM_ID, fund_id: 'fund-1', portfolio_company_id: 'co-aero' })
    await openProfile(page, 'Portfolio Companies')
    await page.getByRole('button', { name: /Aero Logistics/ }).click()
    await page.getByRole('button', { name: 'Harbor Fund I', exact: true }).click()

    await expect(page.getByText('Not recorded')).toBeVisible()
    const [del] = backend.called('DELETE', 'rest/v1/fund_holdings')
    expect(del.query.get('fund_id')).toBe('eq.fund-1')
    expect(del.query.get('portfolio_company_id')).toBe('eq.co-aero')
  })
})
