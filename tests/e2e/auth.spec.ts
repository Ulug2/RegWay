import { expect, signIn, test } from './mockBackend'

test.describe('signing in', () => {
  test('a visitor sees the landing page and can reach sign-in', async ({ page, backend }) => {
    await page.goto('/')
    // In the header on a computer; on a phone the hero's button is right below it.
    await expect(page.getByRole('button', { name: 'Get Started', exact: true }).first()).toBeVisible()
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible()
    // Nothing firm-specific is requested before sign-in.
    expect(backend.calls.filter(c => c.path.startsWith('rest/v1/'))).toEqual([])
  })

  test('a wrong password shows the error and stays on the form', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    await page.getByPlaceholder('you@firm.com').fill('dana@harbor.test')
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.locator('form').getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText('Invalid login credentials')).toBeVisible()
    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('the right password opens the dashboard for the user’s firm', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    await page.getByPlaceholder('you@firm.com').fill('dana@harbor.test')
    await page.locator('input[type="password"]').fill('correct-password')
    await page.locator('form').getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Dana\.$/ })).toBeVisible()
    await expect(page.getByText("Here's what's moving across Harbor Capital today.")).toBeVisible()
  })

  test('a returning user goes straight to the dashboard', async ({ page }) => {
    await signIn(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Dana\.$/ })).toBeVisible()
  })

  test('a signed-in user with no firm yet is sent to onboarding, not the dashboard', async ({ page, backend }) => {
    backend.tables.firm_members = []
    await signIn(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Tell us about your firm' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toHaveCount(0)
  })
})

test.describe('onboarding on a phone', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fills the screen, names only the current step, and keeps Continue in reach', async ({ page, backend }) => {
    backend.tables.firm_members = []
    await signIn(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Tell us about your firm' })).toBeVisible()
    const dialog = (await page.getByRole('dialog').boundingBox())!
    expect(dialog.width).toBe(360)
    expect(dialog.height).toBe(640)
    // The steps are still named for a screen reader.
    await expect(page.getByRole('button', { name: /First Fund/ })).toBeAttached()
    const cont = (await page.getByRole('button', { name: 'Continue →' }).boundingBox())!
    expect(cont.y + cont.height).toBeLessThanOrEqual(640)
  })
})
