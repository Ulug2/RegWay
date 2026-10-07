import { describe, expect, it } from 'vitest'
import { REGULATOR_FEEDS, geopoliticalSourcesOutside, regionsOf, regulatorySourcesFor, sourcesIn } from '../../supabase/functions/_shared/regulatorFeeds.ts'
import { companies, firm, funds } from './helpers/firm'

// Titles are real ones, read from each feed on 2026-10-06.

const feed = (source: string, urlPart = '') => REGULATOR_FEEDS.find(f => f.source === source && f.url.includes(urlPart))!
const keeps = (source: string, title: string, link = 'https://example.test/x', urlPart = '') => feed(source, urlPart).keep({ title, link, date: '2026-10-01', description: '' })

describe('which feed entries are kept', () => {
  it.each([
    ['sec_news', 'SEC Proposes Amendments to Expand Responsible Retailization of Private Markets', true],
    ['sec_news', 'SEC Grants Exemptive Relief from Certain Inline XBRL Filing or Submission Requirements', true],
    ['sec_news', 'SEC Charges Registered Investment Adviser Zoe Financial for Failure to Disclose Conflict of Interest', false],
    ['sec_news', 'SEC Censures OTC Link LLC for Repeated Compliance Failures Related to Regulation SCI', false],
    ['sec_news', 'SEC to Host Virtual National Compliance Outreach Seminar for Investment Companies and Investment Advisers', false],
    ['ftc_news', 'FTC Seeks Public Comment on Whether to Update Rule on Impersonation of Government and Businesses', true],
    ['ftc_news', 'FTC, States Sue Lens.com for Misrepresenting the Price of Contact Lenses in Search Ads', false],
    ['ftc_news', 'FTC Issues Redress Payments to Consumers Impacted by GOAT’s Deceptive Shipping, Refund Policies', false],
    ['cfpb_news', 'CFPB Announces Joint Final Rule on Adopting Uniform Standards for Reporting Financial Data', true],
    ['cfpb_news', 'CFPB Proud to Support the National Strategy for Financial Literacy', false],
    ['fca_publications', 'CP26/34: Preparing for the new transaction reporting regime', true],
    ['fca_publications', 'PS26/18: Cryptoasset perimeter guidance', true],
    ['fca_publications', 'Retirement income market data 2025/26', false],
    ['pra_publications', 'PS16/26 – PRA rule changes to accommodate HM Treasury’s Overseas Prudential Requirements Regime', true],
    ['pra_publications', 'PRA Regulatory Digest – September 2026', false],
    ['uk_legislation', 'The Employment Rights Act 2025 (Commencement No. 6 and Transitional and Saving Provisions) Regulations 2026', true],
    ['uk_legislation', 'The Air Navigation (Restriction of Flying) (Windsor) Regulations 2026', false],
    ['uk_legislation', 'The Wirral (Electoral Changes) Order 2026', false],
    // Sanctions are geopolitical measures, matched by country elsewhere.
    ['uk_legislation', 'The Russia (Sanctions) (EU Exit) (Amendment) Regulations 2026', false],
    ['esma_news', 'ESMA consults on disclosure requirements and updates guidelines and Q&As under the Prospectus Regulation', true],
    ['esma_news', 'Upcoming changes to the Euribor Panel', false],
    ['uk_sanctions', 'The Russia (Sanctions) (EU Exit) (Amendment) Regulations 2026', true],
    ['uk_sanctions', 'The Employment Rights Act 2025 (Commencement No. 6 and Transitional and Saving Provisions) Regulations 2026', false],
    ['ofsi', 'Guidance: OFSI General licence INT/2025/5635700', true],
    ['ofsi', 'Statutory guidance: Iran sanctions: guidance', true],
    ['ofsi', 'Notice: Imposition of Monetary Penalty – Citibank, N.A., London Branch', true],
    ['ofsi', 'Guidance: UK Financial Sanctions FAQs', false],
    ['ofsi', 'Financial sanctions webinars and events', false],
    ['ofsi', 'Guidance: Check if an email or communication claiming to be from OFSI is genuine', false],
    ['eu_sanctions', 'CELEX:32026R2193: Council Implementing Regulation (EU) 2026/2193 of 28 September 2026 implementing Regulation (EU) 2024/1485 concerning restrictive measures in view of the situation in Russia', true],
    ['eu_sanctions', 'CELEX:32026D2240: Council Decision (EU) 2026/2240 of 24 September 2026 on the position to be adopted', false],
    ['eu_sanctions', 'CELEX:32026R2193R(01): Corrigendum to Council Implementing Regulation (EU) 2026/2193 concerning restrictive measures', false],
  ])('%s: %s', (source, title, kept) => {
    expect(keeps(source, title)).toBe(kept)
  })

  it('EUR-Lex: acts of the Parliament and Council, not decisions, corrigenda, sanctions or untitled entries', () => {
    const acts = (title: string) => keeps('eur_lex', title, undefined, 'rssId=162')
    expect(acts('CELEX:32026R2108: Regulation (EU) 2026/2108 of the European Parliament and of the Council of 16 September 2026 establishing the Union Customs Code')).toBe(true)
    expect(acts('CELEX:32026D2240: Council Decision (EU) 2026/2240 of 24 September 2026 on the position to be adopted')).toBe(false)
    expect(acts('CELEX:32026R1099R(01): Corrigendum to Regulation (EU) 2026/1099')).toBe(false)
    expect(acts('CELEX:32026R2193: Council Implementing Regulation (EU) 2026/2193 implementing Regulation (EU) 2024/1485 concerning restrictive measures in view of the situation in Russia')).toBe(false)
    expect(acts('CELEX:32019R1021R(04)')).toBe(false)
  })

  it('EUR-Lex: the Commission\'s delegated acts, not its implementing ones', () => {
    const commission = (title: string) => keeps('eur_lex', title, undefined, 'rssId=222')
    expect(commission('CELEX:32026R2300: Commission Delegated Regulation (EU) 2026/2300 supplementing Regulation (EU) 2023/1114 with regard to regulatory technical standards')).toBe(true)
    expect(commission('CELEX:32026R2208: Commission Implementing Regulation (EU) 2026/2208 on exceptional market support measures for the pigmeat sector in Italy')).toBe(false)
  })

  it('drops the CELEX prefix from a stored EUR-Lex title', () => {
    expect(feed('eur_lex').cleanTitle?.('CELEX:32026R2108: Regulation (EU) 2026/2108 of the European Parliament')).toBe('Regulation (EU) 2026/2108 of the European Parliament')
  })
})

describe('which regions a firm is connected to', () => {
  const usOnly = { firm, funds, companies: [companies[0]] }

  it('the U.S. only, for a firm with nothing recorded elsewhere', () => {
    expect(regionsOf(usOnly)).toEqual(['US'])
    expect(regulatorySourcesFor(usOnly)).toEqual(['federal_register', ...sourcesIn('US')])
    expect(regulatorySourcesFor(usOnly)).not.toContain('eur_lex')
    // Sanctions feeds go to the geopolitical matcher, not this one.
    expect(regulatorySourcesFor({ firm, funds, companies })).not.toContain('eu_sanctions')
  })

  it('the EU, through a portfolio company headquartered in Italy', () => {
    expect(regionsOf({ firm, funds, companies })).toEqual(['US', 'EU'])
    expect(regulatorySourcesFor({ firm, funds, companies })).toEqual(expect.arrayContaining(['esma_news', 'eur_lex']))
    expect(regulatorySourcesFor({ firm, funds, companies })).not.toContain('fca_publications')
  })

  it('the UK, through a fund domiciled there or a company operating there', () => {
    expect(regionsOf({ ...usOnly, funds: [{ ...funds[0], jurisdictions: ['United Kingdom'] }] })).toEqual(['US', 'UK'])
    expect(regionsOf({ ...usOnly, companies: [{ ...companies[0], profile: { operating_locations: ['United Kingdom'] } }] })).toEqual(['US', 'UK'])
  })

  it('skips UK and EU sanctions for a firm not connected there', () => {
    expect(geopoliticalSourcesOutside(usOnly)).toEqual(['eu_sanctions', 'uk_sanctions', 'ofsi'])
    expect(geopoliticalSourcesOutside({ firm, funds, companies })).toEqual(['uk_sanctions', 'ofsi'])
    expect(geopoliticalSourcesOutside({ ...usOnly, firm: { ...firm, profile: { geographies: ['Global'] } } })).toEqual([])
  })

  it('both, when the firm says it invests in Europe or globally', () => {
    expect(regionsOf({ ...usOnly, firm: { ...firm, profile: { geographies: ['United States', 'Europe'] } } })).toEqual(['US', 'UK', 'EU'])
    expect(regionsOf({ ...usOnly, firm: { ...firm, profile: { geographies: ['Global'] } } })).toEqual(['US', 'UK', 'EU'])
  })
})
