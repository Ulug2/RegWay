import { REGS, expect, relevance, signIn, test } from './mockBackend'

// Each screen has its own address: it survives a reload, can be opened
// directly, and the browser's Back and Forward move between screens.

const path = (page: import('@playwright/test').Page) => new URL(page.url()).pathname

test.describe('signed out', () => {
  test('the footer links open real pages, each with its own address and title', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
    expect(path(page)).toBe('/privacy')
    await expect(page).toHaveTitle(/Privacy/)

    await page.getByRole('navigation', { name: 'About RegWay' }).getByRole('link', { name: 'Sources' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible()
    await expect(page.getByText('UK sanctions (OFSI)')).toBeVisible()

    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Regulatory intelligence')
    expect(path(page)).toBe('/')
  })

  for (const [address, heading] of [['/about', 'About RegWay'], ['/sources', 'Sources'], ['/legal', 'Legal disclaimers'], ['/privacy', 'Privacy']] as const) {
    test(`${address} opens directly`, async ({ page }) => {
      await page.goto(address)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    })
  }

  test('sign-in has an address, and Back closes the form', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    expect(path(page)).toBe('/sign-in')
    await expect(page.getByLabel('Email')).toBeVisible()
    await page.goBack()
    await expect(page.getByLabel('Email')).toHaveCount(0)

    await page.goto('/sign-up')
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('a signed-in address asks for sign-in instead of showing the page', async ({ page }) => {
    await page.goto('/profile/firm')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  })
})

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test('a fund page keeps its address through a reload, and Back returns to the dashboard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Fund Structure' }).click()
    await page.getByRole('button', { name: /Harbor Fund I Delaware LP/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Fund I' })).toBeVisible()
    expect(path(page)).toBe('/funds/fund-1')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Fund I' })).toBeVisible()

    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dana')
    expect(path(page)).toBe('/')
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Fund I' })).toBeVisible()
  })

  test('a development opens from its address alone', async ({ page, backend }) => {
    backend.tables.regulation_relevance = [relevance('rel-1', REGS.formPf)]
    await page.goto('/')
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await page.getByText(REGS.formPf.title).click()
    await expect(page.getByRole('heading', { level: 1, name: REGS.formPf.title })).toBeVisible()
    const address = path(page)
    expect(address).toBe(`/developments/${REGS.formPf.id}`)

    // As if the link had been pasted into a new tab.
    await page.goto(address)
    await expect(page.getByRole('heading', { level: 1, name: REGS.formPf.title })).toBeVisible()
    // With no previous screen, Back goes up to the dashboard.
    await page.getByRole('button', { name: /Back/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dana')
    expect(path(page)).toBe('/')
  })

  test('profile tabs have addresses', async ({ page }) => {
    await page.goto('/profile/funds')
    await expect(page.getByRole('button', { name: 'Funds', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Firm', exact: true }).click()
    expect(path(page)).toBe('/profile/firm')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
  })

  test('an address that does not exist goes to the dashboard', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dana')
    expect(path(page)).toBe('/')
  })

  test('the public pages are reachable while signed in, and lead back to the dashboard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'About' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'About RegWay' })).toBeVisible()
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dana')
  })
})
