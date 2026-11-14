import { expect, signIn, test } from './mockBackend'

// Profile → Account → Email alerts (migration 0043): on unless turned off.

test.describe('email alerts setting', () => {
  test('is on by default and can be turned off and on again', async ({ page, backend }) => {
    await signIn(page)
    await page.goto('/profile')
    const group = page.getByRole('radiogroup', { name: 'Email alerts' })
    await expect(group.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true')

    await group.getByRole('button', { name: 'Off' }).click()
    await expect(page.getByText('Saved. No alert emails.')).toBeVisible()
    expect(backend.tables.email_preferences).toEqual([expect.objectContaining({ match_alerts: false })])
    expect(backend.tables.email_preferences[0].alerts_since).toBeUndefined()

    await group.getByRole('button', { name: 'On' }).click()
    await expect(page.getByText('Saved. You’ll get an email when something new applies.')).toBeVisible()
    // One row, updated in place; turning on starts from now.
    expect(backend.tables.email_preferences).toHaveLength(1)
    expect(backend.tables.email_preferences[0]).toMatchObject({ match_alerts: true, alerts_since: expect.any(String) })
  })

  test('shows a saved "off"', async ({ page, backend }) => {
    backend.tables.email_preferences.push({ user_id: 'user-1', match_alerts: false })
    await signIn(page)
    await page.goto('/profile')
    await expect(page.getByRole('radiogroup', { name: 'Email alerts' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true')
  })
})
