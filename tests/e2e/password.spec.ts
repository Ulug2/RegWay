import type { Page } from '@playwright/test'
import { RECOVERY_LINK, expect, signIn, test } from './mockBackend'

const STRONG = 'Harbor!Capital9'
const rule = (page: Page, label: string) => page.getByRole('list', { name: 'Password requirements' }).getByText(label)

test.describe('password reset link', () => {
  // The bug: the form appeared for a moment, then the dashboard replaced it.
  test('opens the new-password form and stays on it', async ({ page }) => {
    await page.goto(RECOVERY_LINK)
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    // Long enough for the firm lookup that used to take the screen over.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Good morning|Good afternoon|Good evening/ })).toHaveCount(0)
  })

  test('still works for someone already signed in on this browser', async ({ page }) => {
    await signIn(page)
    await page.goto(RECOVERY_LINK)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  })

  test('saves a password that meets the rules, signs out, and asks for a fresh sign-in', async ({ page, backend }) => {
    await page.goto(RECOVERY_LINK)
    await page.getByPlaceholder('Create a password').fill(STRONG)
    await page.getByPlaceholder('Re-enter password').fill(STRONG)
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.getByRole('status')).toHaveText('Password updated. Sign in with your new password.')
    await expect(page.getByText('Welcome back')).toBeVisible()
    expect(backend.called('PUT', 'auth/v1/user').map(c => c.body.password)).toEqual([STRONG])
    // Every session is ended, not just this browser's.
    expect(backend.called('POST', 'auth/v1/logout').map(c => c.query.get('scope'))).toEqual(['global'])
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith('auth-token')))).toEqual([])

    // The new password signs in; the notice doesn't follow the user around.
    await page.getByPlaceholder('you@firm.com').fill('dana@harbor.test')
    await page.getByPlaceholder('Your password').fill(STRONG)
    await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText("Here's what's moving across Harbor Capital today.")).toBeVisible()
  })

  test('refuses a password that breaks the rules without sending it', async ({ page, backend }) => {
    await page.goto(RECOVERY_LINK)
    await page.getByPlaceholder('Create a password').fill('short')
    await page.getByPlaceholder('Re-enter password').fill('short')
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.getByText(/^Password needs: at least 8 characters/)).toBeVisible()
    expect(backend.called('PUT', 'auth/v1/user')).toEqual([])
  })

  test('refuses mismatched passwords', async ({ page, backend }) => {
    await page.goto(RECOVERY_LINK)
    await page.getByPlaceholder('Create a password').fill(STRONG)
    await page.getByPlaceholder('Re-enter password').fill(`${STRONG}x`)
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()
    expect(backend.called('PUT', 'auth/v1/user')).toEqual([])
  })

  test('explains when the password is in a known breach', async ({ page, backend }) => {
    backend.weakPasswordReasons = ['pwned']
    await page.goto(RECOVERY_LINK)
    await page.getByPlaceholder('Create a password').fill(STRONG)
    await page.getByPlaceholder('Re-enter password').fill(STRONG)
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.getByText('This password has appeared in a known data breach. Choose a different one.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  })
})

test.describe('creating an account', () => {
  async function openSignUp(page: Page) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Get Started', exact: true }).click()
    await expect(page.getByText('Create your account')).toBeVisible()
  }

  test('shows the password rules and ticks them off while typing', async ({ page }) => {
    await openSignUp(page)
    await expect(rule(page, 'At least 8 characters')).toHaveAttribute('data-met', 'false')

    await page.getByPlaceholder('Create a password').fill('harbor')
    await expect(rule(page, 'A lowercase letter')).toHaveAttribute('data-met', 'true')
    await expect(rule(page, 'An uppercase letter')).toHaveAttribute('data-met', 'false')

    await page.getByPlaceholder('Create a password').fill(STRONG)
    for (const label of ['At least 8 characters', 'A lowercase letter', 'An uppercase letter', 'A number', 'A symbol']) {
      await expect(rule(page, label)).toHaveAttribute('data-met', 'true')
    }
  })

  test('does not create an account with a weak password', async ({ page, backend }) => {
    await openSignUp(page)
    await page.getByPlaceholder('you@firm.com').fill('new@harbor.test')
    await page.getByPlaceholder('Create a password').fill('password')
    await page.getByRole('button', { name: 'Create Account' }).click()
    await expect(page.getByText(/^Password needs: an uppercase letter, a number, a symbol/)).toBeVisible()
    expect(backend.called('POST', 'auth/v1/signup')).toEqual([])
  })

  test('signing in to an existing account is not held to the new rules', async ({ page, backend }) => {
    backend.password = 'old123'
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByRole('list', { name: 'Password requirements' })).toHaveCount(0)
    await page.getByPlaceholder('you@firm.com').fill('dana@harbor.test')
    await page.getByPlaceholder('Your password').fill('old123')
    await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText("Here's what's moving across Harbor Capital today.")).toBeVisible()
  })
})

test.describe('changing the password from Profile', () => {
  const NOTICE = "We sent a link to dana@harbor.test. Open it to set your new password; you'll then be asked to sign in again."

  async function openAccount(page: Page) {
    await signIn(page)
    await page.goto('/')
    await page.getByTitle('Profile', { exact: true }).click()
    await expect(page.getByPlaceholder('Current password')).toBeVisible()
  }

  test('"Update Password" asks for the current password', async ({ page, backend }) => {
    await openAccount(page)
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.getByText('Enter your current password', { exact: true })).toBeVisible()
    expect(backend.called('POST', 'auth/v1/recover')).toEqual([])
  })

  test('a wrong current password sends no link', async ({ page, backend }) => {
    await openAccount(page)
    await page.getByPlaceholder('Current password').fill('not-my-password')
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.getByText('Your current password is incorrect')).toBeVisible()
    expect(backend.called('POST', 'auth/v1/recover')).toEqual([])
    await expect(page.getByRole('status')).toHaveCount(0)
  })

  test('the right current password emails the link, without changing the password or signing out', async ({ page, backend }) => {
    await openAccount(page)
    await page.getByPlaceholder('Current password').fill('correct-password')
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.getByRole('status')).toHaveText(NOTICE)
    expect(backend.called('POST', 'auth/v1/recover').map(c => c.body.email)).toEqual(['dana@harbor.test'])
    expect(backend.called('PUT', 'auth/v1/user')).toEqual([])
    expect(backend.called('POST', 'auth/v1/logout')).toEqual([])
    await expect(page.getByPlaceholder('Current password')).toHaveValue('')
  })

  test('the password cannot be typed into Profile itself', async ({ page }) => {
    await openAccount(page)
    await expect(page.locator('input[type="password"]')).toHaveCount(1)
  })

  test('"Forgot password?" emails the same link without the current password', async ({ page, backend }) => {
    await openAccount(page)
    await page.getByRole('button', { name: 'Forgot password?' }).click()

    await expect(page.getByRole('status')).toHaveText(NOTICE)
    expect(backend.called('POST', 'auth/v1/recover').map(c => c.body.email)).toEqual(['dana@harbor.test'])
    expect(backend.called('POST', 'auth/v1/logout')).toEqual([])
    // No sign-in attempt was needed.
    expect(backend.called('POST', 'auth/v1/token')).toEqual([])
  })

  test('says why if the email cannot be sent', async ({ page }) => {
    await openAccount(page)
    await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 429, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 60 seconds.' }) }))
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await expect(page.getByText('For security purposes, you can only request this after 60 seconds.')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
  })

  test('the whole way round: link, new password, signed out, sign in with it', async ({ page, backend }) => {
    await openAccount(page)
    await page.getByPlaceholder('Current password').fill('correct-password')
    await page.getByRole('button', { name: 'Update Password' }).click()
    await expect(page.getByRole('status')).toHaveText(NOTICE)

    // The link opens the app afresh (from the mail client).
    await page.goto('about:blank')
    await page.goto(RECOVERY_LINK)
    await page.getByPlaceholder('Create a password').fill(STRONG)
    await page.getByPlaceholder('Re-enter password').fill(STRONG)
    await page.getByRole('button', { name: 'Update Password' }).click()

    await expect(page.getByRole('status')).toHaveText('Password updated. Sign in with your new password.')
    expect(backend.called('POST', 'auth/v1/logout').map(c => c.query.get('scope'))).toEqual(['global'])
    expect(backend.password).toBe(STRONG)
  })
})
