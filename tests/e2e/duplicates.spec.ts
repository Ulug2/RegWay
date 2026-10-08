import type { Page } from '@playwright/test'
import { FIRM_ID, REGS, expect, regulation, relevance, signIn, test, type MockBackend } from './mockBackend'

// One development stored three times: the SEC's announcement, then the
// Federal Register document for it, then a second document from the package.
const NEWS = regulation('reg-news', { source: 'sec_news', title: 'SEC Proposes Crypto Custody Rules for Advisers', source_url: 'https://www.sec.gov/newsroom/press-releases/2026-100', duplicate_of: null })
const DOCUMENT = regulation('reg-doc', { title: 'Adviser and Regulated Fund Custody Rules; Crypto Custody Rules', source_url: 'https://www.federalregister.gov/documents/2026/10/06/2026-20466/custody', duplicate_of: NEWS.id })
const SECOND_DOCUMENT = regulation('reg-doc-2', { title: 'Custody Recordkeeping Amendments', source_url: 'https://www.federalregister.gov/documents/2026/10/07/2026-20500/recordkeeping', duplicate_of: NEWS.id })
// One FCA bulletin listed twice by its feed.
const BULLETIN = regulation('reg-gc', { source: 'fca_publications', title: 'GC26/6: Primary Market Bulletin No. 66', agency: 'Financial Conduct Authority (FCA)', source_url: 'https://www.fca.org.uk/publications/gc26-6', duplicate_of: null })
const BULLETIN_AGAIN = regulation('reg-fg', { source: 'fca_publications', title: 'FG26/8: Primary Market Bulletin No. 66', agency: 'Financial Conduct Authority (FCA)', source_url: 'https://www.fca.org.uk/publications/fg26-8', duplicate_of: BULLETIN.id })

const titles = (page: Page) => page.locator('.glass-card-light .font-semibold.mb-2')
const card = (page: Page, title: string) => page.locator('.group', { hasText: title })

const announced = (backend: MockBackend) =>
  backend.tables.regulation_relevance.push(relevance('rel-news', NEWS, { relevance_reason: 'The firm is a registered adviser with custody of client assets.' }))
const published = (backend: MockBackend) =>
  backend.tables.regulation_relevance.push(relevance('rel-doc', DOCUMENT, { relevance_reason: 'The firm is a registered adviser (from the rule text).' }))

async function openFirmList(page: Page) {
  await signIn(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'PE Firm' }).click()
  await expect(page.getByText(REGS.formPf.title)).toBeVisible()
}

test.describe('one publication listed twice', () => {
  test.beforeEach(({ backend }) => {
    backend.tables.regulation_relevance.push(relevance('rel-gc', BULLETIN, {}), relevance('rel-fg', BULLETIN_AGAIN, {}))
  })

  test('is one card, the first version, with the other as a link', async ({ page }) => {
    await openFirmList(page)
    await expect(titles(page).filter({ hasText: 'Primary Market Bulletin No. 66' })).toHaveText([BULLETIN.title])
    // The count is of developments, not documents.
    await expect(page.getByRole('button', { name: 'All 4' })).toBeVisible()

    await expect(card(page, BULLETIN.title).getByText('Also published as:')).toBeVisible()
    const link = card(page, BULLETIN.title).getByRole('link', { name: /FCA/ })
    await expect(link).toHaveAttribute('href', BULLETIN_AGAIN.source_url)
    await expect(link).toHaveAttribute('target', '_blank')
    // A card with no other version says nothing about it.
    await expect(card(page, REGS.formPf.title).getByText('Also published as:')).toHaveCount(0)
  })

  test('opening a link does not open the card', async ({ page }) => {
    await openFirmList(page)
    const popup = page.waitForEvent('popup')
    await card(page, BULLETIN.title).getByRole('link', { name: /FCA/ }).click()
    await (await popup).close()
    await expect(page.getByRole('button', { name: 'PE Firm' })).toBeVisible()
    await expect(page.getByRole('heading', { name: BULLETIN.title })).toHaveCount(0)
  })

  test('dismissing the card dismisses every version, so the other does not take its place', async ({ page, backend }) => {
    await openFirmList(page)
    await card(page, BULLETIN.title).hover()
    await card(page, BULLETIN.title).getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText('Primary Market Bulletin No. 66')).toHaveCount(0)

    const [patch] = backend.called('PATCH', 'rest/v1/regulation_relevance')
    expect(patch.query.get('firm_id')).toBe(`eq.${FIRM_ID}`)
    expect(patch.query.get('regulation_id')!.slice(4, -1).split(',').sort()).toEqual([BULLETIN_AGAIN.id, BULLETIN.id].sort())

    await page.reload()
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await expect(page.getByText(REGS.formPf.title)).toBeVisible()
    await expect(page.getByText('Primary Market Bulletin No. 66')).toHaveCount(0)
  })

  test('a version that arrives after the development was dismissed stays hidden', async ({ page, backend }) => {
    backend.tables.regulation_relevance.find(r => r.id === 'rel-gc')!.dismissed_at = new Date().toISOString()
    await openFirmList(page)
    await expect(page.getByText('Primary Market Bulletin No. 66')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All 3' })).toBeVisible()
  })
})

test.describe('an announcement and the official document for it', () => {
  test('the announcement is the card until the document is matched, and links to what was published', async ({ page, backend }) => {
    announced(backend)
    // Published for it, but matched to no one yet.
    backend.tables.regulations.push(DOCUMENT, SECOND_DOCUMENT)
    await openFirmList(page)

    await expect(titles(page).filter({ hasText: NEWS.title })).toHaveCount(1)
    const links = card(page, NEWS.title).getByRole('link', { name: /Federal Register/ })
    await expect(links).toHaveCount(2)
    await expect(links.first()).toHaveAttribute('href', DOCUMENT.source_url)
    await expect(links.nth(1)).toHaveAttribute('href', SECOND_DOCUMENT.source_url)
  })

  test('once the document is matched it is the card, with the announcement as its link', async ({ page, backend }) => {
    announced(backend)
    published(backend)
    await openFirmList(page)

    await expect(titles(page).filter({ hasText: DOCUMENT.title })).toHaveCount(1)
    await expect(titles(page).filter({ hasText: NEWS.title })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All 4' })).toBeVisible()
    await expect(card(page, DOCUMENT.title).getByText("Why it's here: The firm is a registered adviser (from the rule text).")).toBeVisible()
    await expect(card(page, DOCUMENT.title).getByRole('link', { name: /SEC announcement/ })).toHaveAttribute('href', NEWS.source_url)
  })

  test('an announcement of two rules becomes two cards, each linking back to it', async ({ page, backend }) => {
    announced(backend)
    published(backend)
    backend.tables.regulation_relevance.push(relevance('rel-doc-2', SECOND_DOCUMENT, {}))
    await openFirmList(page)

    await expect(titles(page).filter({ hasText: NEWS.title })).toHaveCount(0)
    for (const document of [DOCUMENT, SECOND_DOCUMENT]) {
      await expect(card(page, document.title).getByRole('link', { name: /SEC announcement/ })).toHaveAttribute('href', NEWS.source_url)
    }
    await expect(page.getByRole('button', { name: 'All 5' })).toBeVisible()
  })

  test("the document's page lists the announcement", async ({ page, backend }) => {
    announced(backend)
    published(backend)
    backend.functions['regulation-impact'] = () => ({ json: { status: 'created', content: null } })
    await openFirmList(page)
    await page.getByText(DOCUMENT.title).click()

    await expect(page.getByRole('heading', { name: DOCUMENT.title })).toBeVisible()
    await expect(page.getByText('Also published as', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(NEWS.title) })).toHaveAttribute('href', NEWS.source_url)
  })

  test('dismissing one rule leaves the other, and does not bring the announcement back', async ({ page, backend }) => {
    announced(backend)
    published(backend)
    backend.tables.regulation_relevance.push(relevance('rel-doc-2', SECOND_DOCUMENT, {}))
    await openFirmList(page)
    await card(page, DOCUMENT.title).hover()
    await card(page, DOCUMENT.title).getByRole('button', { name: 'Dismiss' }).click()

    await expect(page.getByText(DOCUMENT.title)).toHaveCount(0)
    const [patch] = backend.called('PATCH', 'rest/v1/regulation_relevance')
    expect(patch.query.get('regulation_id')).toBe(`in.(${DOCUMENT.id})`)

    await page.reload()
    await page.getByRole('button', { name: 'PE Firm' }).click()
    await expect(page.getByText(SECOND_DOCUMENT.title)).toBeVisible()
    await expect(page.getByText(DOCUMENT.title)).toHaveCount(0)
    await expect(titles(page).filter({ hasText: NEWS.title })).toHaveCount(0)
  })

  test('dismissing the only rule does not bring the announcement back either', async ({ page, backend }) => {
    announced(backend)
    published(backend)
    backend.tables.regulation_relevance.find(r => r.id === 'rel-doc')!.dismissed_at = new Date().toISOString()
    await openFirmList(page)
    await expect(page.getByText(NEWS.title)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All 3' })).toBeVisible()
  })

  test('a document that arrives after the announcement was dismissed stays hidden', async ({ page, backend }) => {
    announced(backend)
    published(backend)
    backend.tables.regulation_relevance.find(r => r.id === 'rel-news')!.dismissed_at = new Date().toISOString()
    await openFirmList(page)
    await expect(page.getByText(DOCUMENT.title)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All 3' })).toBeVisible()
  })
})
