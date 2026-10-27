import { expect, test } from './mockBackend'

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { name: 'Regulatory intelligence that actually knows your firm.' })

test.describe('landing page', () => {
  test('sign-in opens beside the hero, on the same page, with the email field ready', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 })
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()

    const form = page.getByRole('region', { name: 'Sign in' })
    await expect(form.getByText('Welcome back')).toBeVisible()
    await expect(heading(page)).toBeVisible()
    await expect(page.getByPlaceholder('you@firm.com')).toBeFocused()
    // Side by side once the slide has finished: the hero text on the left.
    await expect.poll(async () => (await form.boundingBox())!.x - (await heading(page).boundingBox())!.x).toBeGreaterThan(400)
  })

  test('switches between sign-in and sign-up, and closes with × or Escape', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Get Started' }).first().click()
    await expect(page.getByText('Create your account')).toBeVisible()
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Welcome back')).toHaveCount(0)
    await expect(heading(page)).toBeVisible()

    await page.getByRole('banner').getByRole('button', { name: 'Get Started' }).click()
    await expect(page.getByText('Create your account')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Create your account')).toHaveCount(0)
  })

  test('on a phone the form opens below the hero text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Get Started' }).first().click()
    const form = page.getByRole('region', { name: 'Create your account' })
    await expect(form).toBeInViewport()
    const formBox = (await form.boundingBox())!
    const headingBox = (await heading(page).boundingBox())!
    expect(formBox.y).toBeGreaterThan(headingBox.y + headingBox.height)
    // Nothing wider than the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('sections slide in as they scroll into view', async ({ page }) => {
    await page.goto('/')
    const steps = page.getByText('How it works').locator('xpath=ancestor::div[contains(@class,"reveal")][1]')
    await expect(steps).not.toHaveClass(/is-visible/)
    await page.getByText('How it works').scrollIntoViewIfNeeded()
    await expect(steps).toHaveClass(/is-visible/)
    await expect(page.getByText('Tell RegWay about your firm')).toBeVisible()
  })

  test('with reduced motion everything is simply there', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const card = page.getByText('What RegWay watches').locator('xpath=ancestor::div[contains(@class,"reveal")][1]')
    await expect(card).toHaveCSS('opacity', '1')
    await expect(card).toHaveCSS('transform', 'none')
  })

  test('the closing call to action opens sign-up at the top', async ({ page }) => {
    await page.goto('/')
    await page.getByText('See what affects your firm today.').scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Get Started' }).last().click()
    await expect(page.getByText('Create your account')).toBeInViewport()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the product picture is the phone-width one, readable at that size', async ({ page }) => {
    await page.goto('/')
    const picture = page.locator('.shot-frame img.shot-light')
    await expect.poll(() => picture.evaluate(img => (img as HTMLImageElement).currentSrc)).toContain('/landing/company-phone-light.jpg')
  })
})

test('on a laptop the product picture is the laptop one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const picture = page.locator('.shot-frame img.shot-light')
  await expect.poll(() => picture.evaluate(img => (img as HTMLImageElement).currentSrc)).toMatch(/\/landing\/company-light\.jpg$/)
})
