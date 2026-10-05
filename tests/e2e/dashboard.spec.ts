import type { Page } from '@playwright/test'
import { FIRM_ID, REGS, USER, expect, signIn, test } from './mockBackend'

const titles = (page: Page) => page.locator('.glass-card-light .font-semibold.mb-2')

async function openFirmList(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'PE Firm' }).click()
  await expect(page.getByText(REGS.formPf.title)).toBeVisible()
}

test.describe('firm page', () => {
  test('lists what was matched to the firm, newest first, with the reason for each', async ({ page }) => {
    await openFirmList(page)
    await expect(titles(page)).toHaveText([REGS.formPf.title, REGS.adviserCase.title, REGS.tariff.title])
    await expect(page.getByText("Why it's here: The firm is a registered adviser that files Form PF.")).toBeVisible()
    // Evaluated-but-not-relevant items and other entities' matches stay off the firm page.
    await expect(page.getByText('A rule judged not relevant')).toHaveCount(0)
    await expect(page.getByText(REGS.medicare.title)).toHaveCount(0)
  })

  test('marks a document that is scheduled but not yet published', async ({ page }) => {
    await openFirmList(page)
    const card = page.locator('.glass-card-light', { hasText: REGS.formPf.title })
    await expect(card.getByText('Pre-publication')).toBeVisible()
    await expect(page.locator('.glass-card-light', { hasText: REGS.adviserCase.title }).getByText('Pre-publication')).toHaveCount(0)
  })

  test('category chips show counts and narrow the list', async ({ page }) => {
    await openFirmList(page)
    await expect(page.getByRole('button', { name: 'All 3' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Regulatory 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Geopolitical 1' })).toBeVisible()

    await page.getByRole('button', { name: 'Enforcement 1' }).click()
    await expect(titles(page)).toHaveText([REGS.adviserCase.title])

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(titles(page)).toHaveCount(3)
  })

  test('search, date and location filters work together and update the counts', async ({ page }) => {
    await openFirmList(page)

    await page.getByLabel('Search developments').fill('form pf registered adviser')
    await expect(titles(page)).toHaveText([REGS.formPf.title])
    await expect(page.getByRole('button', { name: 'Enforcement 0' })).toBeVisible()

    await page.getByLabel('Search developments').fill('')
    await page.getByLabel('Published').selectOption({ label: 'Past 30 days' })
    await expect(titles(page)).toHaveText([REGS.formPf.title, REGS.adviserCase.title])

    await page.getByLabel('Published').selectOption({ label: 'Any date' })
    await page.getByLabel('Location').selectOption({ label: 'Italy' })
    await expect(titles(page)).toHaveText([REGS.tariff.title])

    await page.getByLabel('Search developments').fill('nothing matches this')
    await expect(page.getByText('Nothing on this page matches these filters.')).toBeVisible()
  })

  test('badges only what was matched since the previous visit', async ({ page, backend }) => {
    const lastVisit = '2026-10-01T09:00:00.000Z'
    backend.tables.regulation_relevance.find(r => r.id === 'rel-2')!.created_at = '2026-10-02T10:00:00.123456+00:00'
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`regway:lastVisit:v1:${USER.id}:${FIRM_ID}`, lastVisit] as const)
    await openFirmList(page)

    await expect(page.locator('.glass-card-light', { hasText: REGS.adviserCase.title }).getByText('New', { exact: true })).toBeVisible()
    await expect(page.getByText('New', { exact: true })).toHaveCount(1)
  })

  test('shows no "New" badges on a first visit', async ({ page }) => {
    await openFirmList(page)
    await expect(page.getByText('New', { exact: true })).toHaveCount(0)
  })

  test('dismissing an item removes it and records the dismissal', async ({ page, backend }) => {
    await openFirmList(page)
    const card = page.locator('.group', { hasText: REGS.adviserCase.title })
    await card.hover()
    await card.getByRole('button', { name: 'Dismiss' }).click()

    await expect(titles(page)).toHaveText([REGS.formPf.title, REGS.tariff.title])
    const [patch] = backend.called('PATCH', 'rest/v1/regulation_relevance')
    expect(patch.query.get('regulation_id')).toBe(`eq.${REGS.adviserCase.id}`)
    expect(patch.query.get('firm_id')).toBe(`eq.${FIRM_ID}`)
    expect(patch.body.dismissed_at).toBeTruthy()
  })

  test('dismissing still works after a fund page has been opened', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Fund Structure' }).click()
    await page.getByRole('button', { name: 'HF Harbor Fund I Delaware LP' }).click()
    await expect(page.getByText(REGS.tariff.title)).toBeVisible()

    await page.getByRole('button', { name: 'PE Firm' }).click()
    const card = page.locator('.group', { hasText: REGS.adviserCase.title })
    await card.hover()
    await card.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText(REGS.adviserCase.title)).toHaveCount(0)
  })

  test('says so when a data source or the automatic matching is failing', async ({ page, backend }) => {
    backend.tables.sync_runs.push({ source: 'matching', ok: false, ran_at: new Date().toISOString() })
    await signIn(page)
    await page.goto('/')
    await expect(page.getByText("Automatic matching hasn't updated successfully recently")).toBeVisible()
  })

  test('loading the dashboard makes no call that costs AI money', async ({ page, backend }) => {
    await openFirmList(page)
    await page.waitForLoadState('networkidle')
    const functions = backend.calls.filter(c => c.path.startsWith('functions/v1/')).map(c => c.path.slice('functions/v1/'.length))
    // The geopolitical matcher is called on load, and returns without an AI
    // call when nothing new touches the firm's countries.
    expect([...new Set(functions)]).toEqual(['match-geopolitical-relevance'])
  })
})

test.describe('fund and company pages', () => {
  test('a fund shows what reaches it through a company it holds', async ({ page, backend }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Fund Structure' }).click()
    await page.getByRole('button', { name: 'HF Harbor Fund I Delaware LP' }).click()

    await expect(titles(page)).toHaveText([REGS.tariff.title])
    await expect(page.getByText('Indirect: Harbor Fund I holds Aero Logistics, which has a direct connection')).toBeVisible()
    const query = backend.called('GET', 'rest/v1/regulation_relevance').find(c => c.query.get('fund_id') === 'eq.fund-1')
    expect(query?.query.get('firm_id')).toBe(`eq.${FIRM_ID}`)
  })

  test('a fund with no matches says so', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Fund Structure' }).click()
    await page.getByRole('button', { name: 'HF Harbor Fund II Cayman LP' }).click()
    await expect(page.getByText('No developments have been confirmed relevant to this fund yet.')).toBeVisible()
  })

  test("a company shows its own matches with its own reason, without re-scanning a recently scanned company", async ({ page, backend }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'G GetixHealth Healthcare' }).click()

    await expect(titles(page)).toHaveText([REGS.medicare.title])
    await expect(page.getByText("Why it's here: GetixHealth bills Medicare for hospital clients.")).toBeVisible()
    expect(backend.called('POST', 'functions/v1/company-regulations')).toEqual([])
  })

  test('a company never scanned is researched once, and its results shown', async ({ page, backend }) => {
    backend.tables.portfolio_companies.find(c => c.id === 'co-getix')!.last_scanned_at = null
    // The real function stamps the company once its scan is stored.
    backend.functions['company-regulations'] = ({ companyId }) => {
      backend.tables.portfolio_companies.find(c => c.id === companyId)!.last_scanned_at = new Date().toISOString()
      return { json: { found: 1 } }
    }
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'G GetixHealth Healthcare' }).click()

    await expect(titles(page)).toHaveText([REGS.medicare.title])
    const scans = backend.called('POST', 'functions/v1/company-regulations')
    expect(scans.map(c => c.body)).toEqual([{ companyId: 'co-getix' }])
  })
})
