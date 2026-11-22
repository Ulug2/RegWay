import type { Page } from '@playwright/test'
import { FIRM_ID, REGS, aiReply, regulation, relevance, signIn, test, todayAt } from './mockBackend'

// Not a test: takes pictures of the app against the mock backend. Skipped
// unless asked for.
//
//   CAPTURE=landing pnpm exec playwright test capture   the product picture on the landing page (public/landing/)
//   CAPTURE=screens pnpm exec playwright test capture   every screen, light and dark, desktop, tablet and phone, into test-results/screens/
//   CAPTURE=og pnpm exec playwright test capture        the picture shown when a link to the site is shared (public/og.jpg)
//
// Run the first one again whenever the company page changes how it looks.

const MODE = process.env.CAPTURE
const OUT = process.env.CAPTURE_DIR ?? 'test-results/screens'

const settle = (page: Page) => page.waitForTimeout(700)
// CAPTURE=screens takes every screen at each of these widths (issue #17).
const SIZES = [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 768, height: 1024 }],
  ['phone', { width: 390, height: 844 }],
] as const
const shot = async (page: Page, name: string, fullPage = true) => {
  // A page wider than the screen scrolls sideways on a phone: say so.
  const wider = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (wider > 0) console.warn(`WIDER ${name}: ${wider}px wider than the screen`)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
}

const ANALYSIS = {
  overview: 'CMS is updating hospital outpatient payment rates for 2027.',
  scope: 'Hospitals paid under the outpatient system.',
  status: 'Final rule.',
  key_provisions: ['Rates rise 2.6%.', 'Site-neutral payment extends to drug administration.'],
  key_dates: [{ date: '2027-01-01', label: 'Rates take effect', note: 'Applies to services from this date.' }],
  impacts: [{ entity_type: 'company', entity_name: 'GetixHealth', headline: 'Billing rates change', how_it_applies: 'GetixHealth bills these codes.', obligations: ['Update the charge master.'], timeline: 'Before January 2027', operational_areas: ['Billing'], open_questions: ['Which codes are affected?'] }],
  considerations: ['Ask counsel whether existing contracts reprice.'],
  limitations: 'Based on the published text.',
}

test.describe('link preview picture', () => {
  test.skip(MODE !== 'og', 'CAPTURE=og only')
  // 1200x630 is the size link previews expect.
  test.use({ colorScheme: 'light', viewport: { width: 1200, height: 630 } })

  test('landing page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.locator('.hero-shot img').first().evaluate((img: HTMLImageElement) => img.decode())
    await settle(page)
    await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 88 })
  })
})

// The laptop picture, and a phone one (the page at phone width, for screens
// under 640px, where the laptop picture would be too small to read).
const LANDING_SHOTS = [
  { suffix: '', viewport: { width: 720, height: 1100 }, clip: { x: 0, y: 80, width: 720, height: 800 } },
  { suffix: '-phone', viewport: { width: 390, height: 1000 }, clip: { x: 0, y: 72, width: 390, height: 720 } },
]

for (const scheme of ['light', 'dark'] as const) {
  for (const shot of LANDING_SHOTS) test.describe(`landing picture${shot.suffix}, ${scheme}`, () => {
    test.skip(MODE !== 'landing', 'CAPTURE=landing only')
    test.use({ colorScheme: scheme, viewport: shot.viewport, deviceScaleFactor: 2 })

    // Example data: an invented company and invented developments.
    test('company page', async ({ page, backend }) => {
      const controls = regulation('ex-controls', {
        title: 'Export Controls on Advanced Avionics Components; Licence Requirements',
        agency: 'Bureau of Industry and Security',
        jurisdiction: 'Bureau of Industry and Security · Federal',
        summary: 'Adds licence requirements for exports of certain avionics components and the software used to maintain them.',
        published_date: new Date().toISOString().slice(0, 10),
      })
      const tariff = { ...REGS.tariff, summary: 'Imposes an additional duty on aircraft parts and assemblies imported from Italy.', published_date: new Date().toISOString().slice(0, 10) }
      backend.tables.fund_holdings = [{ firm_id: FIRM_ID, fund_id: 'fund-1', portfolio_company_id: 'co-aero' }]
      backend.tables.regulation_relevance = [
        relevance('ex-1', controls, { portfolio_company_id: 'co-aero', portfolio_companies: { name: 'Aero Logistics' }, relevance_reason: 'Aero Logistics ships avionics spares from Naples to U.S. carriers, so the new licence requirement covers part of what it moves.', created_at: todayAt(0, 5) }),
        relevance('ex-2', tariff, { portfolio_company_id: 'co-aero', portfolio_companies: { name: 'Aero Logistics' }, relevance_reason: 'Aero Logistics is headquartered in Italy and exports aircraft parts to the United States.', created_at: todayAt(0, 4) }),
      ]
      backend.tables.regulation_impacts.push({ regulation_id: controls.id, firm_id: FIRM_ID, content: { ...ANALYSIS, status: 'Final rule; effective in 60 days.' } })
      await signIn(page)
      await page.goto('/')
      await page.getByRole('button', { name: 'Portfolio Companies' }).click()
      await page.getByRole('button', { name: 'Aero Logistics Aerospace' }).click()
      await page.getByText(controls.title).waitFor()
      await page.mouse.move(0, 0)
      await settle(page)
      // From the company's name down through its two developments; the page
      // header above and the RegWay AI bar below are left out.
      await page.screenshot({ path: `public/landing/company${shot.suffix}-${scheme}.jpg`, type: 'jpeg', quality: 86, clip: shot.clip })
    })
  })

  // Desktop keeps the names it always had; tablet and phone are prefixed.
  for (const [size, viewport] of SIZES) {
    const prefix = size === 'desktop' ? scheme : `${scheme}-${size}`
    test.describe(`screens, ${scheme}, ${size}`, () => {
      test.skip(MODE !== 'screens', 'CAPTURE=screens only')
      test.use({ colorScheme: scheme, viewport })

      test('landing', async ({ page }) => {
        await page.goto('/')
        await settle(page)
        await shot(page, `${prefix}-landing-fold`, false)
        // Scroll through, so every section has revealed itself.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y)
            await new Promise(r => setTimeout(r, 120))
          }
          window.scrollTo(0, 0)
        })
        await settle(page)
        await shot(page, `${prefix}-landing-full`)
        await page.getByRole('banner').getByRole('button', { name: 'Sign In' }).click()
        await settle(page)
        await shot(page, `${prefix}-landing-signin`, false)
      })

      test('signed in', async ({ page, backend }) => {
        backend.tables.regulation_impacts.push({ regulation_id: REGS.medicare.id, firm_id: FIRM_ID, content: ANALYSIS })
        await signIn(page)
        await page.goto('/')
        await page.getByRole('button', { name: 'General Partners' }).waitFor()
        await settle(page)
        await shot(page, `${prefix}-dashboard`)
        await page.getByRole('button', { name: 'General Partners' }).click()
        await page.getByRole('button', { name: 'All days' }).click()
        await settle(page)
        await shot(page, `${prefix}-dashboard-firm`)

        await page.getByRole('button', { name: 'Portfolio Companies' }).click()
        await settle(page)
        await shot(page, `${prefix}-dashboard-companies`, false)
        await page.getByRole('button', { name: 'GetixHealth Healthcare' }).click()
        await settle(page)
        await shot(page, `${prefix}-company`)
        await page.getByText(REGS.medicare.title).click()
        await settle(page)
        await shot(page, `${prefix}-detail`)
        await page.getByRole('button', { name: 'Impact Cards' }).click()
        await page.getByRole('button', { name: 'Add Note' }).click()
        await settle(page)
        await shot(page, `${prefix}-detail-cards`)

        await page.goto('/')
        await page.getByTitle('Profile', { exact: true }).click()
        await settle(page)
        await shot(page, `${prefix}-account`)
        await page.getByRole('button', { name: 'Firm', exact: true }).click()
        await settle(page)
        await page.getByRole('button', { name: /Harbor Capital/ }).first().click().catch(() => {})
        await settle(page)
        await shot(page, `${prefix}-profile-firm`)
        for (const tab of ['Funds', 'Portfolio Companies', 'Found on the Web', 'Dismissed', 'Hidden']) {
          await page.getByRole('button', { name: tab, exact: true }).click()
          await settle(page)
          await shot(page, `${prefix}-profile-${tab.toLowerCase().replace(/ /g, '-')}`)
        }
      })

      test('public pages', async ({ page }) => {
        for (const slug of ['about', 'sources', 'legal', 'privacy']) {
          await page.goto(`/${slug}`)
          await settle(page)
          await shot(page, `${prefix}-${slug}`)
        }
      })

      test('chat', async ({ page, backend }) => {
        backend.functions['regway-ai-chat'] = () => ({ sse: aiReply('The rule raises outpatient rates by **2.6%**.\n\n- GetixHealth bills these codes\n- Update the charge master before January', [{ url: 'https://example.com/rule', title: 'Federal Register' }]) })
        await signIn(page)
        await page.goto('/')
        await page.getByRole('button', { name: 'General Partners' }).waitFor()
        await page.getByPlaceholder(/Ask RegWay AI about/).first().click()
        await settle(page)
        await shot(page, `${prefix}-chat-empty`, false)
        // The placeholder is shorter on a narrow screen.
        await page.getByPlaceholder(/^Ask RegWay AI( about regulatory| …|…)/).last().fill('What changes for GetixHealth?')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(2500)
        await shot(page, `${prefix}-chat`, false)
      })

      test('onboarding', async ({ page, backend }) => {
        backend.tables.firm_members = []
        await signIn(page)
        await page.goto('/')
        await settle(page)
        await shot(page, `${prefix}-onboarding`, false)
      })
    })
  }
}

test.describe('screens, phone', () => {
  test.skip(MODE !== 'screens', 'CAPTURE=screens only')
  test.use({ colorScheme: 'light', viewport: { width: 390, height: 844 } })

  test('phone', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    await shot(page, 'phone-landing')
    await signIn(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'General Partners' }).click()
    await page.getByRole('button', { name: 'All days' }).click()
    await settle(page)
    await shot(page, 'phone-dashboard')
    await page.locator('.glass-card-light').first().click()
    await settle(page)
    await shot(page, 'phone-detail')
    await page.goto('/')
    await page.getByTitle('Profile', { exact: true }).click()
    await settle(page)
    await shot(page, 'phone-account')
  })
})
