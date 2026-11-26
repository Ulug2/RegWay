import { expect, regulation, relevance, signIn, test } from './mockBackend'

// Profile → Questions: developments that apply only if one fact RegWay
// doesn't have is true (supabase/functions/_shared/possibleMatch.ts), each
// answered with one click (migration 0055).

const itar = regulation('reg-itar', { title: 'International Traffic in Arms Regulations: Amendments', agency: 'State Department' })
const possible = (id: string, reg = itar) =>
  relevance(id, reg, {
    portfolio_company_id: 'co-aero',
    portfolio_companies: { name: 'Aero Logistics' },
    relevance_reason: 'NOT_RELEVANT: Possible: Does Aero Logistics ship defense articles?\nAero Logistics would need export licences for the defense articles it ships.',
  })

test.describe('possible matches', () => {
  test.beforeEach(async ({ page, backend }) => {
    backend.tables.regulation_relevance.push(possible('rel-possible'))
    await signIn(page)
  })

  test('the dashboard says one is waiting and opens the questions', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /1 development may apply to/ })).toBeVisible()
    // It is not listed as a match.
    await expect(page.getByText('International Traffic in Arms Regulations: Amendments')).toHaveCount(0)
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page).toHaveURL(/\/profile\/questions$/)
    await expect(page.getByText('Does Aero Logistics ship defense articles?')).toBeVisible()
  })

  test('lists the question, the entity and the reason, and leaves out other rejections', async ({ page }) => {
    await page.goto('/profile/questions')
    await expect(page.getByRole('button', { name: 'Questions', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: 'International Traffic in Arms Regulations: Amendments' })).toBeVisible()
    await expect(page.getByText('For Aero Logistics:')).toBeVisible()
    await expect(page.getByText('Aero Logistics would need export licences for the defense articles it ships.')).toBeVisible()
    await expect(page.getByText('A rule judged not relevant')).toHaveCount(0)
  })

  test('Yes sends the answer to the database, and the item leaves the list', async ({ page, backend }) => {
    await page.goto('/profile/questions')
    await page.getByRole('button', { name: 'Yes' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'is now on your dashboard' })).toBeVisible()
    await expect(page.getByText(/No open questions/)).toBeVisible()
    expect(backend.called('POST', 'rest/v1/rpc/answer_possible_match').map(c => c.body)).toEqual([{ p_relevance_id: 'rel-possible', p_yes: true }])
  })

  test('No is sent too', async ({ page, backend }) => {
    await page.goto('/profile/questions')
    await page.getByRole('button', { name: 'No', exact: true }).click()
    await expect(page.getByText(/No open questions/)).toBeVisible()
    expect(backend.called('POST', 'rest/v1/rpc/answer_possible_match').map(c => c.body)).toEqual([{ p_relevance_id: 'rel-possible', p_yes: false }])
  })

  test('a failed answer says so and keeps the item', async ({ page, backend }) => {
    backend.rpcStatus.answer_possible_match = 400
    await page.goto('/profile/questions')
    await page.getByRole('button', { name: 'Yes' }).click()
    await expect(page.getByText("Couldn't save your answer. Try again.")).toBeVisible()
    await expect(page.getByText('Does Aero Logistics ship defense articles?')).toBeVisible()
  })
})
