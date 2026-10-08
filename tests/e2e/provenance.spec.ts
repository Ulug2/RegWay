import type { Page } from '@playwright/test'
import { expect, signIn, test, type MockBackend } from './mockBackend'

// Roadmap item 16: each recorded fact shows where it came from and when it
// was last confirmed; a blank one shows as unknown.

const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const factLines = (page: Page) => page.locator('[data-fact-line]')
// The firm's name is the first question on its form.
const nameLine = (page: Page) => factLines(page).first()

async function openFirmProfile(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Firm', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
}

async function save(page: Page, backend: MockBackend) {
  const before = backend.called('PATCH', 'rest/v1/firms').length
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(() => backend.called('PATCH', 'rest/v1/firms').length).toBe(before + 1)
  await expect(page.getByText('Saved.')).toBeVisible()
  return backend.called('PATCH', 'rest/v1/firms').at(-1)!.body.profile_meta as Record<string, { source: string; document?: string; confirmed_at: string }>
}

const isToday = (iso: string) => Date.now() - Date.parse(iso) < 60_000

test.describe('where a profile fact came from', () => {
  test('an answer from before dates were kept says so, and a blank optional one shows as unknown', async ({ page }) => {
    await openFirmProfile(page)
    await expect(nameLine(page)).toContainText('Recorded earlier · not confirmed since')
    await expect(page.getByText('A blank answer is treated as unknown, never as “no”.')).toBeVisible()
    // "Legal name of your management company" is optional and blank.
    await expect(page.getByText('Unknown', { exact: true }).first()).toBeVisible()
    // A blank required one keeps its "Needed" badge instead.
    await expect(page.getByText('Needed', { exact: true }).first()).toBeVisible()
  })

  test('confirming an answer records it as confirmed today, and leaves the others undated', async ({ page, backend }) => {
    await openFirmProfile(page)
    await page.getByRole('button', { name: 'Confirm Firm name is still correct' }).click()
    await expect(nameLine(page)).toContainText(`Entered by you · confirmed ${today()}`)

    const meta = await save(page, backend)
    expect(meta.name.source).toBe('user')
    expect(isToday(meta.name.confirmed_at)).toBe(true)
    // Saving doesn't confirm what the user didn't look at.
    expect(Object.keys(meta)).toEqual(['name'])
    await expect(nameLine(page)).toContainText(`Entered by you · confirmed ${today()}`)
    await expect(page.getByRole('button', { name: 'Confirm Firm name is still correct' })).toHaveCount(0)
  })

  test('an edited answer is recorded as entered today', async ({ page, backend }) => {
    await openFirmProfile(page)
    await page.getByPlaceholder('https://').first().fill('https://harbor.example')
    await expect(page.getByText('Edited: recorded as entered by you today when you save')).toBeVisible()

    const meta = await save(page, backend)
    expect(meta.website.source).toBe('user')
    expect(isToday(meta.website.confirmed_at)).toBe(true)
    expect(meta.name).toBeUndefined()
    await expect(page.getByText('Edited: recorded as entered by you today when you save')).toHaveCount(0)
  })

  test('a supporting document can be named for an answer', async ({ page, backend }) => {
    await openFirmProfile(page)
    await page.getByRole('button', { name: 'Supporting document for Firm name' }).click()
    await page.getByLabel('Document name or link for Firm name').fill('Form ADV, March 2026')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(nameLine(page)).toContainText(`From a document: Form ADV, March 2026 · confirmed ${today()}`)

    const meta = await save(page, backend)
    expect(meta.name).toMatchObject({ source: 'document', document: 'Form ADV, March 2026' })
    await expect(nameLine(page).getByRole('button', { name: 'Supporting document for Firm name' })).toHaveText('Change document')
  })

  test('an answer not confirmed in over a year is flagged, and "confirm all" clears it', async ({ page, backend }) => {
    backend.tables.firms[0].profile_meta = { name: { source: 'user', confirmed_at: '2024-03-01T12:00:00Z' } }
    await openFirmProfile(page)
    await expect(nameLine(page)).toContainText('Entered by you · last confirmed Mar 1, 2024, over a year ago')
    await expect(page.getByText('1 answer not confirmed in over a year')).toBeVisible()

    await page.getByRole('button', { name: 'Confirm all answers are current' }).click()
    const meta = await save(page, backend)
    // Every answered fact, including the ones that had no date.
    expect(Object.keys(meta).sort()).toEqual(['hq', 'name'])
    for (const entry of Object.values(meta)) expect(isToday(entry.confirmed_at)).toBe(true)
    await expect(page.getByText('not confirmed in over a year')).toHaveCount(0)
    await expect(factLines(page).filter({ hasText: 'not confirmed since' })).toHaveCount(0)
  })

  test('signup and "add" forms show no provenance: nothing is recorded yet', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await page.getByRole('button', { name: 'Firm', exact: true }).click()
    await page.getByRole('button', { name: /Funds/ }).first().click()
    await expect(page.getByRole('button', { name: 'Add Fund' })).toBeVisible()
    const addCard = page.locator('.glass-card', { has: page.getByRole('button', { name: 'Add Fund' }) })
    await expect(addCard.locator('[data-fact-line]')).toHaveCount(0)
    await expect(addCard.getByText('Unknown', { exact: true })).toHaveCount(0)
  })
})
