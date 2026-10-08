import { FIRM_ID, REGS, daysAgoAt, expect, regulation, relevance, signIn, test } from './mockBackend'

// Behaviour the redesign added or changed (prompts/redesign.md). How things
// look is checked by eye, with `CAPTURE=screens` (see capture.spec.ts).

test.describe('landing page', () => {
  test('shows one product picture, for the theme in use, and the form takes its place', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const pictures = page.getByRole('img', { name: /A portfolio company's page in RegWay/ })
    await expect(pictures).toHaveCount(1)
    await expect(pictures).toHaveAttribute('src', '/landing/company-light.jpg')
    await expect(pictures).toHaveJSProperty('complete', true)
    expect(await pictures.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByRole('region', { name: 'Sign in' })).toBeVisible()
    await expect(pictures).toHaveCount(0)
  })

  test('the dark theme has its own picture', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.getByRole('img', { name: /A portfolio company's page in RegWay/ })).toHaveAttribute('src', '/landing/company-dark.jpg')
  })

  test('nothing is wider than a phone screen, and no link goes nowhere', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.locator('a[href="#"]')).toHaveCount(0)
  })
})

test.describe('signed in', () => {
  test('the keyboard can skip to the content, and focus is visible', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'PE Firm' })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
    expect(outline).toBe('solid')
  })

  test('the open level is marked as pressed', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    const firm = page.getByRole('button', { name: 'PE Firm' })
    await expect(firm).toHaveAttribute('aria-pressed', 'false')
    await firm.click()
    await expect(firm).toHaveAttribute('aria-pressed', 'true')
  })

  test('a development opens at its top, and going back returns to the place in the list', async ({ page, backend }) => {
    for (let i = 0; i < 14; i++) {
      const reg = regulation(`reg-long-${i}`, { title: `Long list rule ${i}`, summary: 'A rule in a long list.' })
      backend.tables.regulation_relevance.push(relevance(`rel-long-${i}`, reg, { relevance_reason: 'Relevant to the firm.', created_at: daysAgoAt(1) }))
    }
    await page.setViewportSize({ width: 1280, height: 700 })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await page.getByRole('button', { name: 'All days' }).click()
    await page.getByText('Long list rule 2', { exact: true }).scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 900)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600)
    const before = await page.evaluate(() => window.scrollY)

    await page.locator('.glass-card-light:visible', { hasText: /Long list rule/ }).last().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Long list rule')
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await page.getByRole('button', { name: 'Back to Dashboard' }).click()
    await expect(page.getByRole('button', { name: 'PE Firm' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 200)
  })

  test('a development names its source in words, gives dates as dates, and has no control that does nothing', async ({ page, backend }) => {
    backend.tables.regulation_impacts.push({
      regulation_id: REGS.medicare.id,
      firm_id: FIRM_ID,
      content: { overview: 'Overview.', scope: 'Scope.', status: 'Final rule.', key_provisions: [], key_dates: [{ date: '2027-01-01', label: 'Rates take effect', note: '' }, { date: 'Mid-2027', label: 'Review', note: '' }], impacts: [], considerations: [], limitations: 'Limits.' },
    })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'GetixHealth Healthcare' }).click()
    await page.getByText(REGS.medicare.title).click()

    const details = page.getByRole('complementary')
    await expect(details.getByText('Federal Register', { exact: true })).toBeVisible()
    await expect(page.getByText('federal_register')).toHaveCount(0)
    await expect(page.getByText('Jan 1, 2027')).toBeVisible()
    await expect(page.getByText('Mid-2027')).toBeVisible()
    await expect(page.getByText('Custom Range')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View Official Source' })).toHaveAttribute('href', REGS.medicare.source_url)
  })

  test('each profile question is the label of its own field', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
    const website = page.getByPlaceholder('https://').first()
    const id = await website.getAttribute('id')
    expect(id).toBeTruthy()
    await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1)
  })

  test('the chat has no button that does nothing', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
    await expect(page.getByRole('heading', { name: 'RegWay AI Copilot' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export Memo' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Close RegWay AI' }).click()
    await expect(page.getByRole('heading', { name: 'RegWay AI Copilot' })).toHaveCount(0)
  })
})

test('with reduced motion nothing lifts or slides', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Portfolio Companies' }).click()
  const tile = page.getByRole('button', { name: 'GetixHealth Healthcare' })
  await tile.hover()
  await expect(tile).toHaveCSS('transform', 'none')
})
