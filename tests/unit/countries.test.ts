import { describe, expect, it } from 'vitest'
import { countryByName, countryOfLocation, extractCountries } from '../../supabase/functions/_shared/countries.ts'
import { COUNTRIES } from '../../src/lib/questionnaire'

describe('extractCountries', () => {
  it('finds countries by name and by the adjective sanctions programs use', () => {
    expect(extractCountries('Iranian Transactions and Sanctions Regulations')).toEqual(['Iran'])
    expect(extractCountries('Russian Harmful Foreign Activities Sanctions; imports from Vietnam')).toEqual(['Russia', 'Vietnam'])
  })

  it('returns countries in the order they first appear, once each', () => {
    expect(extractCountries('Mali and Iran; Iranian entities operating in Mali')).toEqual(['Mali', 'Iran'])
  })

  it('does not find a shorter country inside a longer one', () => {
    expect(extractCountries('Papua New Guinea')).toEqual(['Papua New Guinea'])
    expect(extractCountries('South Sudan')).toEqual(['South Sudan'])
    expect(extractCountries('South Sudan and Sudan')).toEqual(['South Sudan', 'Sudan'])
  })

  it('ignores common nouns and words that only contain a country name', () => {
    expect(extractCountries('roast turkey and fine china')).toEqual([])
    expect(extractCountries('Omani')).not.toContain('Mali')
    expect(extractCountries('Indiana and Nigeria')).toEqual(['Nigeria'])
  })

  it('skips names that are ambiguous in free text', () => {
    expect(extractCountries('Georgia Power; Michael Jordan; Chad Smith; the US')).toEqual([])
  })

  it('never tags the United States, the default jurisdiction of every document', () => {
    expect(extractCountries('United States imports from Canada')).toEqual(['Canada'])
  })

  it('handles empty input', () => {
    expect(extractCountries(null)).toEqual([])
    expect(extractCountries(undefined)).toEqual([])
    expect(extractCountries('')).toEqual([])
  })
})

describe('countryOfLocation', () => {
  it('reads the most specific part of a comma-separated location', () => {
    expect(countryOfLocation('Naples, Italy')).toBe('Italy')
    expect(countryOfLocation('Austin, Texas, United States')).toBe('United States')
    expect(countryOfLocation('Germany')).toBe('Germany')
  })

  it('treats U.S. states and postal codes as the United States', () => {
    expect(countryOfLocation('Texas')).toBe('United States')
    expect(countryOfLocation('Austin, TX')).toBe('United States')
    expect(countryOfLocation('Wilmington, DE')).toBe('United States')
    expect(countryOfLocation('Georgia')).toBe('United States')
  })

  it("accepts the questionnaire's location object", () => {
    expect(countryOfLocation({ city: 'Turin', state: '', country: 'Italy' })).toBe('Italy')
    expect(countryOfLocation({ city: 'Miami', state: 'Florida', country: '' })).toBe('United States')
    expect(countryOfLocation({ city: 'Miami' })).toBeNull()
  })

  it('returns null for anything that names no country', () => {
    for (const value of ['International', 'Europe', 'Turin', '', null, undefined, 42, ['Italy']]) {
      expect(countryOfLocation(value)).toBeNull()
    }
  })
})

describe('countryByName', () => {
  it('resolves names the free-text extractor skips', () => {
    expect(countryByName('Georgia')).toBe('Georgia')
    expect(countryByName(' jordan ')).toBe('Jordan')
    expect(countryByName('Chad')).toBe('Chad')
    expect(countryByName('Myanmar')).toBe('Burma')
  })

  it('returns null for a non-country', () => {
    expect(countryByName('Atlantis')).toBeNull()
  })
})

describe('gazetteer', () => {
  // A profile stores the name picked in the questionnaire; if the matcher
  // can't place it, that location silently drops out of the footprint.
  it('places every country the questionnaire offers', () => {
    const unplaced = COUNTRIES.filter(name => countryOfLocation(name) === null)
    expect(unplaced).toEqual([])
  })

  // "Georgia (country)" is the one deliberate exception: the picker spells
  // it out so it can't be read as the U.S. state.
  it('maps each questionnaire country to itself', () => {
    const renamed = COUNTRIES.filter(name => countryOfLocation(name) !== name)
    expect(renamed).toEqual(['Georgia (country)'])
    expect(countryOfLocation('Georgia (country)')).toBe('Georgia')
  })
})
