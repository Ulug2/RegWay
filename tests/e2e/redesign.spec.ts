import { FIRM_ID, REGS, aiReply, daysAgoAt, expect, regulation, relevance, signIn, test } from './mockBackend'

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
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await page.getByRole('button', { name: 'Firm', exact: true }).click()
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

test.describe('the theme switch in the header', () => {
  test('follows the device until it is used, then remembers the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await signIn(page)
    await page.goto('/')
    const toggle = page.getByRole('switch', { name: 'Dark mode' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'false')
  })
})

test('an answer that resumes after a search keeps a space between its sentences', async ({ page, backend }) => {
  const events = [
    { type: 'content_block_start', content_block: { type: 'text' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Let me check the latest rule.' } },
    { type: 'content_block_start', content_block: { type: 'server_tool_use' } },
    { type: 'content_block_start', content_block: { type: 'web_search_tool_result' } },
    { type: 'content_block_start', content_block: { type: 'text' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'It takes effect' } },
    // A block split only by a citation carries its own spacing.
    { type: 'content_block_start', content_block: { type: 'text' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: ' in January.' } },
    { type: 'message_stop' },
  ]
  backend.functions['regway-ai-chat'] = () => ({ sse: events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') })
  await signIn(page)
  await page.goto('/')
  await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
  const box = page.getByRole('textbox', { name: 'Message RegWay AI' })
  await box.fill('When does it start?')
  await box.press('Enter')
  await expect(page.getByText('Let me check the latest rule. It takes effect in January.')).toBeVisible()
})

test('the dashboard never shows a placeholder name before the real one', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __greetings: string[] }).__greetings = seen
    new MutationObserver(() => {
      const text = document.querySelector('h1')?.textContent
      if (text && seen.at(-1) !== text) seen.push(text)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
  await signIn(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dana')
  await expect(page.getByRole('button', { name: 'Profile', exact: true })).toHaveText('DR')
  const greetings = await page.evaluate(() => (window as unknown as { __greetings: string[] }).__greetings)
  expect(greetings.filter(g => g.includes('there'))).toEqual([])
})

test('in the full-screen chat the header floats over the conversation', async ({ page, backend }) => {
  backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('An answer.') })
  await signIn(page)
  await page.goto('/')
  await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
  const header = page.getByRole('heading', { name: 'RegWay AI Copilot' }).locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await expect(header).toHaveCSS('position', 'static')
  const box = page.getByRole('textbox', { name: 'Message RegWay AI' })
  await box.fill('When does it start?')
  await box.press('Enter')
  await expect(page.getByText('An answer.')).toBeVisible()
  await expect(header).toHaveCSS('position', 'absolute')
  // The first message starts below the header, not hidden under it.
  const headerBottom = (await header.boundingBox())!.y + (await header.boundingBox())!.height
  expect((await page.getByText('When does it start?').boundingBox())!.y).toBeGreaterThan(headerBottom)
})

test.describe('the chat', () => {
  async function openChat(page: import('@playwright/test').Page) {
    await signIn(page)
    await page.goto('/')
    await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
    await expect(page.getByRole('heading', { name: 'RegWay AI Copilot' })).toBeVisible()
  }

  test('every suggestion is fully on screen, and the note under the input goes once a message is sent', async ({ page, backend }) => {
    backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('An answer.') })
    await page.setViewportSize({ width: 1280, height: 800 })
    await openChat(page)
    for (const name of ["Summarize today's changes", 'What fund deadlines are coming up?', 'Any new state rules for my companies?']) {
      await expect(page.getByRole('button', { name })).toBeInViewport({ ratio: 1 })
    }
    // Short enough to sit on one line.
    const tops = await Promise.all(["Summarize today's changes", 'Any new state rules for my companies?'].map(async name => (await page.getByRole('button', { name }).boundingBox())!.y))
    expect(tops[0]).toBe(tops[1])
    await expect(page.getByText('Always verify with qualified legal counsel.')).toBeVisible()
    const box = page.getByRole('textbox', { name: 'Message RegWay AI' })
    await box.fill('When does it start?')
    await box.press('Enter')
    await expect(page.getByText('An answer.')).toBeVisible()
    await expect(page.getByText('Always verify with qualified legal counsel.')).toHaveCount(0)
    // The answer ends above the floating input, not behind it.
    const answer = (await page.getByText('An answer.').boundingBox())!
    expect(answer.y + answer.height).toBeLessThan((await box.boundingBox())!.y)
  })

  test('past conversations show at once when the sidebar is reopened', async ({ page }) => {
    await openChat(page)
    await page.getByRole('button', { name: 'Chats' }).click()
    await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading conversations' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Chats' }).click()
    await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toHaveCount(0)
    await page.evaluate(() => {
      ;(window as unknown as { __sawLoading: boolean }).__sawLoading = false
      new MutationObserver(() => {
        if (document.querySelector('[aria-label="Loading conversations"]')) (window as unknown as { __sawLoading: boolean }).__sawLoading = true
      }).observe(document, { childList: true, subtree: true })
    })
    await page.getByRole('button', { name: 'Chats' }).click()
    await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __sawLoading: boolean }).__sawLoading)).toBe(false)
  })
})
