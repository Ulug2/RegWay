import type { Page } from '@playwright/test'
import { expect, signIn, test } from './mockBackend'

// Roadmap 16b.3: light and dark themes. The page follows the device unless
// the user picks one in Profile → Account, which this browser remembers.

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const LIGHT = 'rgb(255, 255, 255)'
const DARK = 'rgb(13, 13, 13)'

async function openAccount(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByTitle('Profile', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
}

test.describe('on a device set to dark', () => {
  test.use({ colorScheme: 'dark' })

  test('the app is dark from the first paint, signed out or in', async ({ page }) => {
    await page.goto('/')
    expect(await theme(page)).toBe('dark')
    expect(await canvas(page)).toBe(DARK)
    await signIn(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'General Partners' })).toBeVisible()
    expect(await canvas(page)).toBe(DARK)
    // Text is light on the dark canvas.
    const heading = await page.getByRole('heading', { level: 1 }).evaluate(el => getComputedStyle(el).color)
    expect(heading).toBe('rgb(255, 255, 255)')
  })

  test('choosing Light overrides the device, and is remembered', async ({ page }) => {
    await openAccount(page)
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    expect(await theme(page)).toBe('light')
    expect(await canvas(page)).toBe(LIGHT)

    await page.reload()
    expect(await theme(page)).toBe('light')
    expect(await canvas(page)).toBe(LIGHT)
  })
})

test.describe('on a device set to light', () => {
  test.use({ colorScheme: 'light' })

  test('the app is light, and choosing Dark switches at once and survives a reload', async ({ page }) => {
    await openAccount(page)
    expect(await canvas(page)).toBe(LIGHT)
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    expect(await canvas(page)).toBe(DARK)

    await page.reload()
    expect(await theme(page)).toBe('dark')
  })

  test('"Match device" goes back to following the device, live', async ({ page }) => {
    await openAccount(page)
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await page.getByRole('button', { name: 'Match device' }).click()
    expect(await theme(page)).toBe('light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => theme(page)).toBe('dark')
  })
})
