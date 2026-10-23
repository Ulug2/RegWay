import type { Page } from '@playwright/test'
import { FIRM_ID, REGS, expect, signIn, test } from './mockBackend'

const ANALYSIS = {
  overview: 'CMS is updating hospital outpatient payment rates for 2027.',
  scope: 'Hospitals paid under the outpatient system.',
  status: 'Final rule.',
  key_provisions: ['Rates rise 2.6%.'],
  key_dates: [],
  impacts: [{ entity_type: 'company', entity_name: 'GetixHealth', headline: 'Billing rates change', how_it_applies: 'GetixHealth bills these codes.', obligations: [], timeline: '', operational_areas: [], open_questions: [] }],
  considerations: [],
  limitations: 'Based on the published text.',
}

async function openCompanyItem(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Portfolio Companies' }).click()
  await page.getByRole('button', { name: 'GetixHealth Healthcare' }).click()
  await page.getByText(REGS.medicare.title).click()
}

test.describe('a development’s page', () => {
  test('shows the stored analysis without asking for a new one', async ({ page, backend }) => {
    backend.tables.regulation_impacts.push({ regulation_id: REGS.medicare.id, firm_id: FIRM_ID, content: ANALYSIS })
    await openCompanyItem(page)

    await expect(page.getByRole('heading', { name: REGS.medicare.title })).toBeVisible()
    await expect(page.getByText(ANALYSIS.overview)).toBeVisible()
    await expect(page.getByText('Final rule.')).toBeVisible()
    expect(backend.called('POST', 'functions/v1/regulation-impact')).toEqual([])
  })

  test('writes the analysis on first open when none is stored', async ({ page, backend }) => {
    backend.functions['regulation-impact'] = () => ({ json: { status: 'created', content: ANALYSIS } })
    await openCompanyItem(page)

    await expect(page.getByText(ANALYSIS.overview)).toBeVisible()
    expect(backend.called('POST', 'functions/v1/regulation-impact').map(c => c.body)).toContainEqual({ regulationId: REGS.medicare.id })
  })

  test('offers a retry when the analysis cannot be prepared', async ({ page, backend }) => {
    backend.functions['regulation-impact'] = () => ({ status: 500, json: { error: 'Anthropic API error: 400 credit balance is too low' } })
    await openCompanyItem(page)
    await expect(page.getByText("The detailed analysis couldn't be prepared right now.")).toBeVisible()
    // The official summary still shows.
    await expect(page.getByText('Updates payment rates.')).toBeVisible()

    backend.functions['regulation-impact'] = () => ({ json: { status: 'created', content: ANALYSIS } })
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(ANALYSIS.overview)).toBeVisible()
  })

  test('explains that a not-yet-published document is analysed once it publishes', async ({ page, backend }) => {
    backend.functions['regulation-impact'] = () => ({ json: { status: 'awaiting_publication', content: null } })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'General Partners' }).click()
    await page.getByText(REGS.formPf.title).click()

    await expect(page.getByText(/^Publishes /)).toBeVisible()
    await expect(page.getByText(/This document is on Federal Register public inspection, scheduled for publication on/)).toBeVisible()
    await expect(page.getByText('Amends Form PF reporting.')).toBeVisible()
  })

  test('re-checking a disputed match sends the note and shows the new verdict', async ({ page, backend }) => {
    backend.tables.regulation_impacts.push({ regulation_id: REGS.medicare.id, firm_id: FIRM_ID, content: ANALYSIS })
    backend.functions['rematch-regulation'] = () => ({ json: { relevant: false, reason: 'GetixHealth no longer bills Medicare, so the rule creates no obligation.', verdicts: [{ entity: 'GetixHealth', relevant: false, reason: 'GetixHealth no longer bills Medicare, so the rule creates no obligation.' }] } })
    await openCompanyItem(page)

    await page.getByRole('button', { name: 'This match looks wrong?' }).click()
    await page.getByPlaceholder(/what's wrong with this match/).fill('We stopped billing Medicare in 2025.')
    await page.getByRole('button', { name: 'Re-check this match' }).click()

    await expect(page.getByText('Re-checked: no longer considered relevant.')).toBeVisible()
    await expect(page.getByText('GetixHealth no longer bills Medicare, so the rule creates no obligation.')).toBeVisible()
    expect(backend.called('POST', 'functions/v1/rematch-regulation')[0].body).toEqual({ regulationId: REGS.medicare.id, note: 'We stopped billing Medicare in 2025.' })
  })

  test('re-check is offered for geopolitical items and lists each entity’s verdict', async ({ page, backend }) => {
    backend.functions['regulation-impact'] = () => ({ json: { status: 'created', content: ANALYSIS } })
    backend.functions['rematch-regulation'] = () => ({
      json: {
        relevant: true,
        reason: 'Direct: Aero Logistics is headquartered in Italy.',
        verdicts: [
          { entity: 'Aero Logistics', relevant: true, reason: 'Direct: Aero Logistics is headquartered in Italy.' },
          { entity: 'Harbor Capital', relevant: false, reason: 'The firm itself has no recorded location in Italy.' },
        ],
      },
    })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'General Partners' }).click()
    await page.getByText(REGS.tariff.title).click()

    await page.getByRole('button', { name: 'This match looks wrong?' }).click()
    await page.getByRole('button', { name: 'Re-check this match' }).click()
    await expect(page.getByText('Re-checked: still considered relevant.')).toBeVisible()
    await expect(page.getByText('Aero Logistics · relevant')).toBeVisible()
    await expect(page.getByText('Harbor Capital · not relevant')).toBeVisible()
  })

  test('re-check is not offered for enforcement items', async ({ page, backend }) => {
    backend.functions['regulation-impact'] = () => ({ json: { status: 'created', content: ANALYSIS } })
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'General Partners' }).click()
    await page.getByText(REGS.adviserCase.title).click()
    await expect(page.getByRole('heading', { name: REGS.adviserCase.title })).toBeVisible()
    await expect(page.getByRole('button', { name: 'This match looks wrong?' })).toHaveCount(0)
  })
})
