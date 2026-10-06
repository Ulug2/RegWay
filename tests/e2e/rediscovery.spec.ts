import type { Page } from '@playwright/test'
import { expect, signIn, test, type MockBackend } from './mockBackend'

// Roadmap item 11: editing a fact the matchers use re-checks the recent
// items they had rejected; editing anything else costs nothing.

const reevaluations = (backend: MockBackend, fn: string) => backend.called('POST', `functions/v1/${fn}`).filter(c => c.body?.reevaluate === true)

async function openFirmProfile(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
}

async function save(page: Page, backend: MockBackend) {
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => backend.called('PATCH', 'rest/v1/firms').length).toBeGreaterThan(0)
}

test.describe('re-discovery after a profile edit', () => {
  test('a changed strategy re-checks regulatory and enforcement items', async ({ page, backend }) => {
    await openFirmProfile(page)
    await page.getByRole('button', { name: 'Growth Equity', exact: true }).click()
    await save(page, backend)
    await expect.poll(() => reevaluations(backend, 'match-relevance').length).toBe(1)
    await expect.poll(() => reevaluations(backend, 'match-enforcement-relevance').length).toBe(1)
    // The firm's location didn't change: no geopolitical re-check.
    expect(reevaluations(backend, 'match-geopolitical-relevance')).toEqual([])
  })

  test('keeps going until the matcher has no full batch left, without forgetting again', async ({ page, backend }) => {
    const batches = [40, 40, 12]
    backend.functions['match-relevance'] = () => ({ json: { evaluated: batches.shift() ?? 0, relevant: 0 } })
    backend.functions['match-enforcement-relevance'] = () => ({ json: { evaluated: 3, relevant: 0 } })
    await openFirmProfile(page)
    await page.getByRole('button', { name: 'Growth Equity', exact: true }).click()
    await save(page, backend)
    await expect.poll(() => backend.called('POST', 'functions/v1/match-relevance').length).toBe(3)
    await page.waitForLoadState('networkidle')
    expect(backend.called('POST', 'functions/v1/match-relevance')).toHaveLength(3)
    expect(reevaluations(backend, 'match-relevance')).toHaveLength(1)
    expect(backend.called('POST', 'functions/v1/match-enforcement-relevance')).toHaveLength(1)
  })

  test('a changed website re-checks nothing', async ({ page, backend }) => {
    await openFirmProfile(page)
    await page.getByPlaceholder('https://').first().fill('https://harbor.example')
    await save(page, backend)
    await page.waitForLoadState('networkidle')
    expect(reevaluations(backend, 'match-relevance')).toEqual([])
    expect(reevaluations(backend, 'match-enforcement-relevance')).toEqual([])
  })
})
