import { expect, signIn, test } from './mockBackend'

// A screen's file: /src/components/Dashboard.tsx under the dev server the
// tests run on, assets/Dashboard-<hash>.js in a build.
const screenFile = (name: string) => new RegExp(`/(?:src/components/)?${name}(?:-[\\w-]+\\.js|\\.tsx)(?:\\?.*)?$`)

const delayChunk = async (route: import('@playwright/test').Route) => {
  await new Promise(resolve => setTimeout(resolve, 400))
  await route.continue()
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`lazy screen loading in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('shows the themed skeleton while the dashboard loads', async ({ page }) => {
      await signIn(page)
      await page.route(screenFile('Dashboard'), delayChunk)
      await page.goto('/')

      const fallback = page.getByRole('status', { name: 'Loading screen' })
      await expect(fallback).toBeVisible()
      expect(await fallback.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(
        scheme === 'dark' ? 'rgb(13, 13, 13)' : 'rgb(255, 255, 255)',
      )
      await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Dana\.$/ })).toBeVisible()
    })
  })
}

test.describe('lazy chat loading in dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('shows the themed skeleton while the chat loads', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Dana\.$/ })).toBeVisible()

    await page.route(screenFile('RegWayAICopilot'), delayChunk)
    await page.getByPlaceholder(/Ask RegWay AI about/).first().click()

    const fallback = page.getByRole('status', { name: 'Loading chat' })
    await expect(fallback).toBeVisible()
    expect(await fallback.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(13, 13, 13)')
    await expect(page.getByText('RegWay AI Copilot')).toBeVisible()
  })
})

// After a deploy, an open tab asks for the old build's files. A screen that
// fails to load reloads the page once instead of leaving it blank.
test('a screen whose file fails to load reloads the page once and then opens', async ({ page }) => {
  await signIn(page)
  let failures = 0
  await page.route(screenFile('Dashboard'), async route => {
    if (failures++ === 0) return route.abort()
    return route.continue()
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Dana\.$/ })).toBeVisible()
  expect(failures).toBeGreaterThanOrEqual(2)
})
