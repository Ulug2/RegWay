import type { Page } from '@playwright/test'
import { FIRM_ID, REGS, expect, regulation, relevance, signIn, test, type MockBackend } from './mockBackend'

// One development stored three times: the SEC's announcement, then the
// Federal Register document for it, then a second document from the package.
const NEWS = regulation('reg-news', { source: 'sec_news', title: 'SEC Proposes Crypto Custody Rules for Advisers', source_url: 'https://www.sec.gov/newsroom/press-releases/2026-100', duplicate_of: null })
const DOCUMENT = regulation('reg-doc', { title: 'Adviser and Regulated Fund Custody Rules; Crypto Custody Rules', source_url: 'https://www.federalregister.gov/documents/2026/10/06/2026-20466/custody', duplicate_of: NEWS.id })
const SECOND_DOCUMENT = regulation('reg-doc-2', { title: 'Custody Recordkeeping Amendments', source_url: 'https://www.federalregister.gov/documents/2026/10/07/2026-20500/recordkeeping', duplicate_of: NEWS.id })

const titles = (page: Page) => page.locator('.glass-card-light .font-semibold.mb-2')

function seedDuplicates(backend: MockBackend) {
  backend.tables.regulation_relevance.push(
    relevance('rel-news', NEWS, { relevance_reason: 'The firm is a registered adviser with custody of client assets.' }),
    relevance('rel-doc', DOCUMENT, { relevance_reason: 'The firm is a registered adviser (the document).' }),
    // GetixHealth was matched to the document only.
    relevance('rel-doc-co', DOCUMENT, { portfolio_company_id: 'co-getix', portfolio_companies: { name: 'GetixHealth' }, relevance_reason: 'GetixHealth holds client funds.' }),
  )
  // Never matched to anyone, but published for the same announcement.
  backend.tables.regulations.push(SECOND_DOCUMENT)
}

async function openFirmList(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'PE Firm' }).click()
  await expect(page.getByText(REGS.formPf.title)).toBeVisible()
}

test.describe('a development published more than once', () => {
  test('is one card on the firm page, with its other versions as links', async ({ page, backend }) => {
    seedDuplicates(backend)
    await openFirmList(page)

    await expect(titles(page).filter({ hasText: NEWS.title })).toHaveCount(1)
    await expect(titles(page).filter({ hasText: DOCUMENT.title })).toHaveCount(0)
    // The count is of developments, not documents.
    await expect(page.getByRole('button', { name: 'All 4' })).toBeVisible()

    const card = page.locator('.group', { hasText: NEWS.title })
    await expect(card.getByText('Also published as:')).toBeVisible()
    const links = card.getByRole('link', { name: /Federal Register/ })
    await expect(links).toHaveCount(2)
    await expect(links.first()).toHaveAttribute('href', DOCUMENT.source_url)
    await expect(links.first()).toHaveAttribute('target', '_blank')
    await expect(links.nth(1)).toHaveAttribute('href', SECOND_DOCUMENT.source_url)
    // A card with no other version says nothing about it.
    await expect(page.locator('.group', { hasText: REGS.formPf.title }).getByText('Also published as:')).toHaveCount(0)
  })

  test('opening a link does not open the card', async ({ page, backend }) => {
    seedDuplicates(backend)
    await openFirmList(page)
    const popup = page.waitForEvent('popup')
    await page.locator('.group', { hasText: NEWS.title }).getByRole('link', { name: /Federal Register/ }).first().click()
    await (await popup).close()
    await expect(page.getByRole('button', { name: 'PE Firm' })).toBeVisible()
    await expect(page.getByRole('heading', { name: NEWS.title })).toHaveCount(0)
  })

  test('shows the later version as the card where the first one was not matched, linking back to it', async ({ page, backend }) => {
    seedDuplicates(backend)
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Portfolio Companies' }).click()
    await page.getByRole('button', { name: 'G GetixHealth Healthcare' }).click()

    const card = page.locator('.group', { hasText: DOCUMENT.title })
    await expect(card.getByText('Why it\'s here: GetixHealth holds client funds.')).toBeVisible()
    await expect(card.getByRole('link', { name: /SEC announcement/ })).toHaveAttribute('href', NEWS.source_url)
    await expect(card.getByRole('link')).toHaveCount(1)
  })

  test('lists the other versions on the development’s page', async ({ page, backend }) => {
    seedDuplicates(backend)
    backend.functions['regulation-impact'] = () => ({ json: { status: 'created', content: null } })
    await openFirmList(page)
    await page.getByText(NEWS.title).click()

    await expect(page.getByRole('heading', { name: NEWS.title })).toBeVisible()
    await expect(page.getByText('Also published as', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(DOCUMENT.title) })).toHaveAttribute('href', DOCUMENT.source_url)
    await expect(page.getByRole('link', { name: new RegExp(SECOND_DOCUMENT.title) })).toHaveAttribute('href', SECOND_DOCUMENT.source_url)
  })

  test('dismissing the card dismisses every version, so the later one does not take its place', async ({ page, backend }) => {
    seedDuplicates(backend)
    await openFirmList(page)
    const card = page.locator('.group', { hasText: NEWS.title })
    await card.hover()
    await card.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText(NEWS.title)).toHaveCount(0)

    const [patch] = backend.called('PATCH', 'rest/v1/regulation_relevance')
    expect(patch.query.get('firm_id')).toBe(`eq.${FIRM_ID}`)
    expect(patch.query.get('regulation_id')!.slice(4, -1).split(',').sort()).toEqual([DOCUMENT.id, SECOND_DOCUMENT.id, NEWS.id].sort())

    await page.reload()
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await expect(page.getByText(REGS.formPf.title)).toBeVisible()
    await expect(page.getByText(NEWS.title)).toHaveCount(0)
    await expect(page.getByText(DOCUMENT.title)).toHaveCount(0)
  })

  test('a version that arrives after the development was dismissed stays hidden', async ({ page, backend }) => {
    backend.tables.regulation_relevance.push(
      relevance('rel-news', NEWS, { dismissed_at: new Date().toISOString() }),
      relevance('rel-doc', DOCUMENT, {}),
    )
    await openFirmList(page)
    await expect(page.getByText(DOCUMENT.title)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All 3' })).toBeVisible()
  })
})
