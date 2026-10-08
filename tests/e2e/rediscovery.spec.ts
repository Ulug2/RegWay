import type { Page } from '@playwright/test'
import { FIRM_ID, expect, signIn, test, type MockBackend } from './mockBackend'

// Roadmap items 11 and 16b.2: editing a fact the matchers use asks for the
// recent items they rejected to be re-checked, and for the analyses to be
// rewritten. None of that AI work runs at the save: the request is
// recorded, and the server does it once the edits have stopped.

const AI_FUNCTIONS = ['match-relevance', 'match-enforcement-relevance', 'match-geopolitical-relevance', 'refresh-entity-impacts', 'company-regulations', 'regulation-impact']
const aiCalls = (backend: MockBackend) => backend.calls.filter(c => c.method === 'POST' && AI_FUNCTIONS.some(fn => c.path === `functions/v1/${fn}`) && c.body?.reevaluate !== undefined)
const requested = (backend: MockBackend) => backend.called('POST', 'rest/v1/profile_changes').map(c => c.body)

async function openProfile(page: Page, tab?: string) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Firm', exact: true }).click()
  if (tab) return page.getByRole('button', { name: tab, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
}

async function save(page: Page, backend: MockBackend, table = 'firms') {
  const before = backend.called('PATCH', `rest/v1/${table}`).length
  await page.getByRole('button', { name: 'Save changes' }).first().click()
  await expect.poll(() => backend.called('PATCH', `rest/v1/${table}`).length).toBeGreaterThan(before)
  await expect.poll(() => requested(backend).length).toBeGreaterThan(0)
}

test.describe('AI work after a profile edit', () => {
  test('a changed strategy asks for a re-check and new analyses, and spends nothing at the save', async ({ page, backend }) => {
    await openProfile(page)
    await page.getByRole('button', { name: 'Growth Equity', exact: true }).click()
    await save(page, backend)

    expect(requested(backend)).toEqual([{ firm_id: FIRM_ID, scope: 'firm', entity_id: null, refresh_impacts: true, rediscover: true, geopolitical: false }])
    await expect(page.getByText('Matches and analyses update a few minutes after your last change.')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(aiCalls(backend)).toEqual([])
    expect(backend.called('POST', 'functions/v1/refresh-entity-impacts')).toEqual([])
  })

  test('several edits in a row each record a request and still spend nothing', async ({ page, backend }) => {
    await openProfile(page)
    await page.getByRole('button', { name: 'Growth Equity', exact: true }).click()
    await save(page, backend)
    await page.getByRole('button', { name: 'Buyout', exact: true }).click()
    await save(page, backend)
    await expect.poll(() => requested(backend).length).toBe(2)
    await page.waitForLoadState('networkidle')
    expect(aiCalls(backend)).toEqual([])
    expect(backend.called('POST', 'functions/v1/refresh-entity-impacts')).toEqual([])
  })

  test('a changed website asks only for the analyses to be rewritten', async ({ page, backend }) => {
    await openProfile(page)
    await page.getByPlaceholder('https://').first().fill('https://harbor.example')
    await save(page, backend)
    expect(requested(backend)).toEqual([{ firm_id: FIRM_ID, scope: 'firm', entity_id: null, refresh_impacts: true, rediscover: false, geopolitical: false }])
  })

  test("a company's changed industry asks for a re-check and marks it for a new scan, which waits", async ({ page, backend }) => {
    await openProfile(page, 'Portfolio Companies')
    await page.getByRole('button', { name: /Aero Logistics/ }).click()
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Defense / Aerospace' }) }).first().selectOption('Defense / Aerospace')
    await save(page, backend, 'portfolio_companies')

    const patch = backend.called('PATCH', 'rest/v1/portfolio_companies').at(-1)!
    // Marked, not cleared: the old results stay until the new scan starts.
    expect(patch.body.last_scanned_at).toBe('1970-01-01T00:00:00.000Z')
    expect(backend.called('DELETE', 'rest/v1/regulation_relevance')).toEqual([])
    expect(requested(backend).at(-1)).toMatchObject({ scope: 'company', entity_id: 'co-aero', refresh_impacts: true, rediscover: true })

    await page.waitForLoadState('networkidle')
    expect(backend.called('POST', 'functions/v1/company-regulations')).toEqual([])
  })
})
