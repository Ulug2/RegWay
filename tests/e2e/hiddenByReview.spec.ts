import { expect, regulation, relevance, signIn, test } from './mockBackend'

// Profile → Hidden: matches the Skeptic took off the dashboard
// (roadmap item 17a.1), with its reason, and a way to put one back.

const customs = regulation('reg-customs', { title: 'Union Customs Code: Amendments', jurisdiction: 'European Union' })

test.describe('matches hidden by review', () => {
  test.beforeEach(async ({ page, backend }) => {
    backend.tables.regulation_relevance.push(
      relevance('rel-hidden', customs, {
        portfolio_company_id: 'co-aero',
        portfolio_companies: { name: 'Aero Logistics' },
        relevance_reason: 'NOT_RELEVANT: Reviewed: Imports and exports are not recorded for Aero Logistics.',
      }),
    )
    await signIn(page)
  })

  test('lists each with the entity and the reason, and leaves out other rejections', async ({ page }) => {
    await page.goto('/profile/hidden')
    await expect(page.getByRole('button', { name: 'Hidden', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: 'Union Customs Code: Amendments' })).toBeVisible()
    await expect(page.getByText('Hidden for Aero Logistics:')).toBeVisible()
    await expect(page.getByText('Imports and exports are not recorded for Aero Logistics.')).toBeVisible()
    // A matcher's own "not relevant" (no review) is not listed.
    await expect(page.getByText('A rule judged not relevant')).toHaveCount(0)
  })

  test('Restore asks the database to put the match back, and the item leaves the list', async ({ page, backend }) => {
    await page.goto('/profile/hidden')
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('Nothing hidden by review.')).toBeVisible()
    expect(backend.called('POST', 'rest/v1/rpc/restore_reviewed_match').map(c => c.body)).toEqual([{ p_relevance_id: 'rel-hidden' }])
  })

  test('a failed restore says so and keeps the item', async ({ page, backend }) => {
    backend.rpcStatus.restore_reviewed_match = 400
    await page.goto('/profile/hidden')
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText("Couldn't restore it. Try again.")).toBeVisible()
    await expect(page.getByText('Union Customs Code: Amendments')).toBeVisible()
  })
})
