import type { Page } from '@playwright/test'
import { FIRM_ID, REGS, USER, daysAgoAt, expect, signIn, test, todayAt, type MockBackend } from './mockBackend'

const titles = (page: Page) => page.locator('.glass-card-light .font-semibold.mb-2')

async function openFundPage(page: Page, card: string) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Fund Structure' }).click()
  await page.getByRole('button', { name: card }).click()
}

async function openCompanyPage(page: Page, card: string) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Portfolio Companies' }).click()
  await page.getByRole('button', { name: card }).click()
}

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
    await page.getByLabel('Published').selectOption({ label: 'Published past 30 days' })
    await expect(titles(page)).toHaveText([REGS.formPf.title, REGS.adviserCase.title])

    await page.getByLabel('Published').selectOption({ label: 'Any publish date' })
    await page.getByLabel('Location').selectOption({ label: 'Italy' })
    await expect(titles(page)).toHaveText([REGS.tariff.title])

    await page.getByLabel('Search developments').fill('nothing matches this')
    await expect(page.getByText('Nothing here matches these filters.')).toBeVisible()
  })

  test('badges only what was matched since the previous visit', async ({ page, backend }) => {
    const lastVisit = todayAt(0, 2)
    backend.tables.regulation_relevance.find(r => r.id === 'rel-2')!.created_at = todayAt(0, 10).replace('Z', '123+00:00')
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
    await openFundPage(page, 'HF Harbor Fund I Delaware LP')
    await expect(page.getByText(REGS.tariff.title)).toBeVisible()

    await page.getByRole('button', { name: 'Dashboard' }).click()
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
  test('a fund opens its own page: who it is, what it holds, and what reaches it through a company it holds', async ({ page, backend }) => {
    backend.tables.fund_holdings.push({ firm_id: FIRM_ID, fund_id: 'fund-1', portfolio_company_id: 'co-aero' })
    await openFundPage(page, 'HF Harbor Fund I Delaware LP')

    await expect(page.getByRole('heading', { name: 'Harbor Fund I' })).toBeVisible()
    await expect(page.getByText('Delaware LP · $1B · United States')).toBeVisible()
    await expect(page.getByText('Holds: Aero Logistics')).toBeVisible()
    await expect(page.getByPlaceholder('Ask RegWay AI about Harbor Fund I...')).toBeVisible()

    await expect(titles(page)).toHaveText([REGS.tariff.title])
    await expect(page.getByText('Indirect: Harbor Fund I holds Aero Logistics, which has a direct connection')).toBeVisible()
    const query = backend.called('GET', 'rest/v1/regulation_relevance').find(c => c.query.get('fund_id') === 'eq.fund-1')
    expect(query?.query.get('firm_id')).toBe(`eq.${FIRM_ID}`)
  })

  test('a fund with no matches says so', async ({ page }) => {
    await openFundPage(page, 'HF Harbor Fund II Cayman LP')
    await expect(page.getByText('Portfolio companies held: not recorded')).toBeVisible()
    await expect(page.getByText('No developments have been confirmed relevant to this fund yet.')).toBeVisible()
  })

  test("a company shows its own matches with its own reason, without re-scanning a recently scanned company", async ({ page, backend }) => {
    await openCompanyPage(page, 'G GetixHealth Healthcare')

    await expect(page.getByRole('heading', { name: 'GetixHealth' })).toBeVisible()
    await expect(page.getByText('Held by: not recorded')).toBeVisible()
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
    await openCompanyPage(page, 'G GetixHealth Healthcare')

    await expect(titles(page)).toHaveText([REGS.medicare.title])
    const scans = backend.called('POST', 'functions/v1/company-regulations')
    expect(scans.map(c => c.body)).toEqual([{ companyId: 'co-getix' }])
  })
})

test('opening a development from a company page and going back returns to that page', async ({ page }) => {
  await openCompanyPage(page, 'G GetixHealth Healthcare')
  await page.getByText(REGS.medicare.title).click()
  await page.getByRole('button', { name: /Back/ }).first().click()
  await expect(page.getByRole('heading', { name: 'GetixHealth' })).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(page.getByRole('button', { name: 'Portfolio Companies' })).toBeVisible()
})

test.describe('day by day', () => {
  // Today: Form PF. Yesterday: the adviser case. Five days ago: the tariff.
  const spreadOverDays = (backend: MockBackend) => {
    backend.tables.regulation_relevance.find(r => r.id === 'rel-2')!.created_at = daysAgoAt(1)
    backend.tables.regulation_relevance.find(r => r.id === 'rel-3')!.created_at = daysAgoAt(5)
  }

  test("opens on what was found today, and steps back one day at a time", async ({ page, backend }) => {
    spreadOverDays(backend)
    await openFirmList(page)
    await expect(page.getByText(/^Today · /)).toBeVisible()
    await expect(page.getByText('1 found by RegWay')).toBeVisible()
    await expect(titles(page)).toHaveText([REGS.formPf.title])
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()

    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText(/^Yesterday · /)).toBeVisible()
    await expect(titles(page)).toHaveText([REGS.adviserCase.title])

    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText('Nothing new was found for')).toBeVisible()
    await page.getByRole('button', { name: /^See .* \(1\)$/ }).click()
    await expect(titles(page)).toHaveText([REGS.tariff.title])

    await page.getByRole('button', { name: 'All days' }).click()
    await expect(titles(page)).toHaveCount(3)
    await page.getByRole('button', { name: 'Back to today' }).click()
    await expect(titles(page)).toHaveText([REGS.formPf.title])
  })

  test('an empty today points at the most recent day with findings', async ({ page, backend }) => {
    for (const r of backend.tables.regulation_relevance) r.created_at = daysAgoAt(2)
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await expect(page.getByText('Nothing new was found for today.')).toBeVisible()
    await page.getByRole('button', { name: /^See .* \(3\)$/ }).click()
    await expect(titles(page)).toHaveCount(3)
  })

  test("goes back no further than the firm's first day", async ({ page, backend }) => {
    backend.tables.firms[0].created_at = daysAgoAt(1)
    await openFirmList(page)
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText(/^Yesterday · /)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous day' })).toBeDisabled()
  })

  test("keeps the day while a development is open, and a page opened again starts on today", async ({ page, backend }) => {
    spreadOverDays(backend)
    await openFirmList(page)
    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.getByText(REGS.adviserCase.title).click()
    await page.getByRole('button', { name: /Back/ }).first().click()
    await expect(page.getByText(/^Yesterday · /)).toBeVisible()

    await page.getByRole('button', { name: 'PE Firm' }).click()
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await expect(page.getByText(/^Today · /)).toBeVisible()
  })
})

test.describe('dashboard chrome', () => {
  // 40 more firm-level matches, so the list runs far past one screen.
  const longList = (backend: MockBackend) => {
    const template = backend.tables.regulation_relevance[0]
    for (let i = 0; i < 40; i++) {
      backend.tables.regulation_relevance.push({ ...template, id: `rel-extra-${i}`, regulation_id: `reg-extra-${i}`, regulations: { ...template.regulations, id: `reg-extra-${i}`, title: `Additional rule ${i}`, on_public_inspection: false } })
    }
  }
  const aiInput = (page: Page) => page.getByPlaceholder(/Ask RegWay AI about/).first()

  test('the RegWay AI input stays in view under a long list, wherever the page is scrolled', async ({ page, backend }) => {
    longList(backend)
    await openFirmList(page)
    await expect(page.getByText('Additional rule 39')).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight * 3)).toBe(true)

    await expect(aiInput(page)).toBeInViewport()
    await page.mouse.wheel(0, 2500)
    await expect(aiInput(page)).toBeInViewport()
    // The page header stays put as well.
    await expect(page.getByRole('button', { name: 'Settings' })).toBeInViewport()

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(aiInput(page)).toBeInViewport()
    // At the very end it rests above the footer rather than covering it.
    const input = await aiInput(page).boundingBox()
    const footer = await page.locator('footer').boundingBox()
    expect(input!.y + input!.height).toBeLessThanOrEqual(footer!.y)
  })

  test('the input still opens the chat from the middle of a long list', async ({ page, backend }) => {
    longList(backend)
    await openFirmList(page)
    await page.mouse.wheel(0, 2500)
    await aiInput(page).click()
    await expect(page.getByText('RegWay AI Copilot')).toBeVisible()
  })

  for (const [time, words] of [['08:30', 'Good morning'], ['14:00', 'Good afternoon'], ['20:15', 'Good evening']] as const) {
    test(`greets by time of day: ${words.toLowerCase()} at ${time}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(`2026-10-05T${time}:00`))
      await signIn(page)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: `${words}, Dana.` })).toBeVisible()
    })
  }
})

test.describe('profile opened from a company page', () => {
  test('its back button says where it goes: the page, not the dashboard', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'G GetixHealth Healthcare' }).click()
    await page.getByRole('button', { name: 'Edit profile' }).click()

    await expect(page.getByRole('button', { name: 'Back to Dashboard' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'GetixHealth' })).toBeVisible()
  })
})
