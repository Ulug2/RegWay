import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTER, GLOBAL, US_FEDERAL, applyFeedFilter, categoryCounts, isFiltered, locationOptions, locationsOf } from '../../src/lib/feedFilter'
import type { MatchedRegulation } from '../../src/lib/types'

const TODAY = new Date('2026-10-04T12:00:00')

const item = (over: Partial<MatchedRegulation>): MatchedRegulation => ({
  id: over.id ?? 'r',
  source: 'federal_register',
  category: 'regulatory',
  countries: [],
  title: 'A rule',
  agency: 'Securities and Exchange Commission',
  jurisdiction: 'Securities and Exchange Commission · Federal',
  summary: null,
  published_date: '2026-10-01',
  effective_date: null,
  source_url: 'https://example.test',
  match_reason: null,
  matched_at: null,
  ...over,
})

const medicare = item({ id: 'medicare', title: 'Medicare payment update', summary: 'Hospital outpatient rates', match_reason: 'GetixHealth bills Medicare', published_date: '2026-09-30' })
const sanctions = item({ id: 'sanctions', category: 'geopolitical', title: 'Iran sanctions designations', countries: ['Iran', 'Mali'], jurisdiction: 'Foreign Assets Control Office · Federal', published_date: '2026-08-01' })
const tariff = item({ id: 'tariff', category: 'geopolitical', title: 'Tariff on all imports', countries: [], published_date: '2026-10-02' })
const enforcement = item({ id: 'case', category: 'enforcement', source: 'sec_enforcement', title: 'SEC charges adviser', jurisdiction: 'Federal', published_date: '2025-06-01' })
const ukRule = item({ id: 'uk', source: 'ai_search', title: 'Defence Cyber Certification', jurisdiction: 'United Kingdom', published_date: null })
const all = [medicare, sanctions, tariff, enforcement, ukRule]

const ids = (items: MatchedRegulation[]) => items.map(i => i.id)

describe('locationsOf', () => {
  it('places a geopolitical item by the countries it names', () => {
    expect(locationsOf(sanctions)).toEqual(['Iran', 'Mali'])
  })

  it('files a geopolitical item naming no country under the global option', () => {
    expect(locationsOf(tariff)).toEqual([GLOBAL])
  })

  it('collapses every way of writing U.S. federal into one option', () => {
    const written = ['Securities and Exchange Commission · Federal', 'Federal', 'Federal (United States)', 'federal', 'Federal - United States', 'United States', 'United States (Federal)', 'United States (Federal - Government Contractors)']
    for (const jurisdiction of written) {
      expect(locationsOf(item({ jurisdiction }))).toEqual([US_FEDERAL])
    }
  })

  it('keeps a non-federal jurisdiction as written', () => {
    expect(locationsOf(ukRule)).toEqual(['United Kingdom'])
    expect(locationsOf(item({ jurisdiction: 'California' }))).toEqual(['California'])
    expect(locationsOf(item({ jurisdiction: 'State of Texas' }))).toEqual(['State of Texas'])
    expect(locationsOf(item({ jurisdiction: 'European Union' }))).toEqual(['European Union'])
  })

  it('gives a non-geopolitical item with no jurisdiction no location', () => {
    expect(locationsOf(item({ jurisdiction: null }))).toEqual([])
    expect(locationsOf(item({ jurisdiction: '   ' }))).toEqual([])
  })
})

describe('locationOptions', () => {
  it('lists locations most common first, ties alphabetical', () => {
    expect(locationOptions(all)).toEqual([US_FEDERAL, GLOBAL, 'Iran', 'Mali', 'United Kingdom'])
  })
})

describe('applyFeedFilter', () => {
  it('returns everything under the default filter', () => {
    expect(ids(applyFeedFilter(all, DEFAULT_FILTER, TODAY))).toEqual(ids(all))
  })

  it('narrows to one category', () => {
    expect(ids(applyFeedFilter(all, { ...DEFAULT_FILTER, category: 'geopolitical' }, TODAY))).toEqual(['sanctions', 'tariff'])
    expect(ids(applyFeedFilter(all, { ...DEFAULT_FILTER, category: 'enforcement' }, TODAY))).toEqual(['case'])
  })

  it('requires every search term, across title, summary, issuer, reason and countries', () => {
    const search = (query: string) => ids(applyFeedFilter(all, { ...DEFAULT_FILTER, query }, TODAY))
    expect(search('medicare')).toEqual(['medicare'])
    expect(search('HOSPITAL getixhealth')).toEqual(['medicare'])
    expect(search('medicare tariff')).toEqual([])
    expect(search('mali')).toEqual(['sanctions'])
    expect(search('foreign assets')).toEqual(['sanctions'])
    expect(search('   ')).toEqual(ids(all))
  })

  it('applies the date window and drops undated items from a dated window', () => {
    const within = (date: 'any' | '30d' | '90d' | '12m') => ids(applyFeedFilter(all, { ...DEFAULT_FILTER, date }, TODAY))
    expect(within('30d')).toEqual(['medicare', 'tariff'])
    expect(within('90d')).toEqual(['medicare', 'sanctions', 'tariff'])
    expect(within('12m')).toEqual(['medicare', 'sanctions', 'tariff'])
    expect(within('any')).toEqual(ids(all))
  })

  it('cuts the window off by calendar day', () => {
    const inside = item({ id: 'edge', published_date: '2026-09-05' })
    expect(ids(applyFeedFilter([inside], { ...DEFAULT_FILTER, date: '30d' }, TODAY))).toEqual(['edge'])
    const before = item({ id: 'old', published_date: '2026-09-03' })
    expect(applyFeedFilter([before], { ...DEFAULT_FILTER, date: '30d' }, TODAY)).toEqual([])
  })

  it('filters by location', () => {
    expect(ids(applyFeedFilter(all, { ...DEFAULT_FILTER, location: 'Mali' }, TODAY))).toEqual(['sanctions'])
    expect(ids(applyFeedFilter(all, { ...DEFAULT_FILTER, location: GLOBAL }, TODAY))).toEqual(['tariff'])
    expect(ids(applyFeedFilter(all, { ...DEFAULT_FILTER, location: US_FEDERAL }, TODAY))).toEqual(['medicare', 'case'])
  })

  it('combines filters', () => {
    expect(ids(applyFeedFilter(all, { category: 'geopolitical', query: 'iran', date: '90d', location: 'Iran' }, TODAY))).toEqual(['sanctions'])
    expect(applyFeedFilter(all, { category: 'regulatory', query: 'iran', date: 'any', location: null }, TODAY)).toEqual([])
  })
})

describe('categoryCounts', () => {
  it('counts each category under the other filters, ignoring the selected category', () => {
    expect(categoryCounts(all, DEFAULT_FILTER, TODAY)).toEqual({ all: 5, regulatory: 2, enforcement: 1, geopolitical: 2 })
    expect(categoryCounts(all, { ...DEFAULT_FILTER, category: 'enforcement', date: '30d' }, TODAY)).toEqual({ all: 2, regulatory: 1, enforcement: 0, geopolitical: 1 })
  })
})

describe('isFiltered', () => {
  it('is false only for the default filter (whitespace search counts as none)', () => {
    expect(isFiltered(DEFAULT_FILTER)).toBe(false)
    expect(isFiltered({ ...DEFAULT_FILTER, query: '  ' })).toBe(false)
    expect(isFiltered({ ...DEFAULT_FILTER, query: 'x' })).toBe(true)
    expect(isFiltered({ ...DEFAULT_FILTER, category: 'regulatory' })).toBe(true)
    expect(isFiltered({ ...DEFAULT_FILTER, date: '30d' })).toBe(true)
    expect(isFiltered({ ...DEFAULT_FILTER, location: 'Iran' })).toBe(true)
  })
})
