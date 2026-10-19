import type { Page } from '@playwright/test'
import { expect, FIRM_ID, signIn, test, type MockBackend } from './mockBackend'

// Roadmap item 18: what web research found about the firm, shown on the
// dashboard and reviewed in Profile. Nothing enters the profile unconfirmed.

const run = (over: Record<string, unknown> = {}) => ({ id: 'run-1', firm_id: FIRM_ID, status: 'done', note: null, found: 3, started_at: new Date(Date.now() - 3_600_000).toISOString(), finished_at: new Date().toISOString(), ...over })
const finding = (id: string, over: Record<string, unknown>) => ({ id, firm_id: FIRM_ID, run_id: 'run-1', scope: 'firm', entity_id: null, recorded: null, quote: '', status: 'pending', created_at: new Date().toISOString(), ...over })

function seedResearch(backend: MockBackend) {
  backend.tables.firm_research_runs.push(run())
  backend.tables.firm_findings.push(
    finding('f-aum', { field: 'aum', value: '$25B+', source_url: 'https://adviserinfo.sec.gov/firm/summary/1', quote: 'Regulatory assets under management: $68 billion' }),
    finding('f-offices', { field: 'offices', value: ['London, UK'], source_url: 'https://harborcap.example/offices', quote: 'Our London office' }),
    finding('f-new', { scope: 'company', field: 'new_entity', value: { name: 'Bay Clinics', website: 'https://bayclinics.example', description: 'Runs outpatient clinics in Florida.' }, source_url: 'https://harborcap.example/portfolio' }),
  )
}

async function openReview(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Found on the Web', exact: true })).toHaveAttribute('aria-pressed', 'true')
}

test.describe('web research on the firm', () => {
  test('the dashboard says it is running, then what it found', async ({ page, backend }) => {
    backend.tables.firm_research_runs.push(run({ status: 'running', finished_at: null }))
    await signIn(page)
    await page.goto('/')
    await expect(page.getByText('Researching Harbor Capital on the web')).toBeVisible()

    backend.tables.firm_research_runs.length = 0
    seedResearch(backend)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'RegWay found 2 facts about Harbor Capital on the web' })).toBeVisible()
    await expect(page.getByText("It also found a fund or company you haven't added.")).toBeVisible()
  })

  test('says why when it could not tell which firm it found', async ({ page, backend }) => {
    backend.tables.firm_research_runs.push(run({ status: 'unsure', note: 'Two firms share the name.' }))
    await signIn(page)
    await page.goto('/')
    await expect(page.getByText("RegWay couldn't research Harbor Capital on the web: Two firms share the name.")).toBeVisible()
  })

  test('each finding shows its source; confirming one saves it as from the web', async ({ page, backend }) => {
    seedResearch(backend)
    await openReview(page)
    await expect(page.getByText('Approximately how much does your firm manage?')).toBeVisible()
    await expect(page.getByText('“Regulatory assets under management: $68 billion”')).toBeVisible()
    await expect(page.getByRole('link', { name: 'adviserinfo.sec.gov' })).toHaveAttribute('href', 'https://adviserinfo.sec.gov/firm/summary/1')

    await page.getByRole('button', { name: 'Confirm Approximately how much does your firm manage?' }).click()
    await expect(page.getByText('Approximately how much does your firm manage?')).toHaveCount(0)
    const saved = backend.called('PATCH', 'rest/v1/firms').at(-1)!.body
    expect(saved.profile.aum).toBe('$25B+')
    expect(saved.profile_meta.aum).toMatchObject({ source: 'web', url: 'https://adviserinfo.sec.gov/firm/summary/1' })
    expect(backend.tables.firm_findings.find(f => f.id === 'f-aum')!.status).toBe('confirmed')

    // In the Firm form, the answer says where it came from.
    await page.getByRole('button', { name: 'Firm', exact: true }).click()
    await expect(page.locator('[data-fact-line]', { hasText: 'From the web: adviserinfo.sec.gov' })).toBeVisible()
  })

  test('Not Right sets a finding aside without touching the profile', async ({ page, backend }) => {
    seedResearch(backend)
    await openReview(page)
    await page.getByRole('button', { name: 'Not right: Other office locations' }).click()
    await expect(page.getByText('Other office locations')).toHaveCount(0)
    expect(backend.tables.firm_findings.find(f => f.id === 'f-offices')!.status).toBe('rejected')
    expect(backend.called('PATCH', 'rest/v1/firms')).toHaveLength(0)
  })

  test('a company the firm has not entered can be added from what was found', async ({ page, backend }) => {
    seedResearch(backend)
    await openReview(page)
    const card = page.getByRole('region', { name: 'Also found' })
    await expect(card.getByText('Runs outpatient clinics in Florida.')).toBeVisible()
    await card.getByRole('button', { name: 'Add' }).click()
    await expect(card).toHaveCount(0)
    const added = backend.tables.portfolio_companies.find(c => c.name === 'Bay Clinics')!
    expect(added.website).toBe('https://bayclinics.example')
    expect((added.profile_meta as Record<string, { source: string }>).name.source).toBe('web')
  })

  test('Research Again starts a run', async ({ page, backend }) => {
    seedResearch(backend)
    await openReview(page)
    await page.getByRole('button', { name: 'Research Again' }).click()
    await expect.poll(() => backend.called('POST', 'functions/v1/research-firm').length).toBe(1)
  })
})
