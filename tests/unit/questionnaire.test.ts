import { describe, expect, it } from 'vitest'
import { parseLegacyLocation } from '../../src/lib/questionnaire'

describe('parseLegacyLocation', () => {
  it.each(['Miami, Florida', 'Miami, FL', 'miami, florida'])(
    'recognizes the U.S. state in %s',
    location => {
      expect(parseLegacyLocation(location)).toEqual({
        country: 'United States',
        state: 'Florida',
        city: location.startsWith('miami') ? 'miami' : 'Miami',
      })
    },
  )

  it('preserves countries in city/country pairs', () => {
    expect(parseLegacyLocation('Paris, France')).toEqual({ country: 'France', state: '', city: 'Paris' })
  })

  it('keeps both the city and state when they share a name', () => {
    expect(parseLegacyLocation('New York, New York')).toEqual({
      country: 'United States', state: 'New York', city: 'New York',
    })
  })

  it('recognizes the District of Columbia by code and full name', () => {
    for (const location of ['Washington, DC', 'Washington, District of Columbia']) {
      expect(parseLegacyLocation(location)).toEqual({
        country: 'United States', state: 'District of Columbia', city: 'Washington',
      })
    }
  })

  it('treats Georgia in a city/state pair as the U.S. state', () => {
    expect(parseLegacyLocation('Atlanta, Georgia')).toEqual({
      country: 'United States', state: 'Georgia', city: 'Atlanta',
    })
  })

  it('accepts an explicit U.S. country after a city and state', () => {
    expect(parseLegacyLocation('Austin, Texas, USA')).toEqual({
      country: 'United States', state: 'Texas', city: 'Austin',
    })
    expect(parseLegacyLocation('Austin, TX, United States')).toEqual({
      country: 'United States', state: 'Texas', city: 'Austin',
    })
  })

  // Found by the review of this parser (2026-11-14).
  it('reads a region and a country in other three-part locations', () => {
    expect(parseLegacyLocation('Toronto, Ontario, Canada')).toEqual({ country: 'Canada', state: 'Ontario', city: 'Toronto' })
    expect(parseLegacyLocation('Paris, Texas, France')).toEqual({ country: 'France', state: 'Texas', city: 'Paris' })
  })

  it('reads the US however it is written', () => {
    for (const us of ['U.S.', 'U.S.A.', 'United States of America', 'usa']) {
      expect(parseLegacyLocation(`Austin, Texas, ${us}`)).toEqual({ country: 'United States', state: 'Texas', city: 'Austin' })
    }
    expect(parseLegacyLocation('Miami, USA')).toEqual({ country: 'United States', state: '', city: 'Miami' })
  })

  it('reads a ZIP after the state, and a dotted D.C.', () => {
    expect(parseLegacyLocation('Miami, FL 33131')).toEqual({ country: 'United States', state: 'Florida', city: 'Miami' })
    expect(parseLegacyLocation('Washington, D.C.')).toEqual({ country: 'United States', state: 'District of Columbia', city: 'Washington' })
  })

  it('gives other countries their names from the list', () => {
    expect(parseLegacyLocation('London, UK')).toEqual({ country: 'United Kingdom', state: '', city: 'London' })
    expect(parseLegacyLocation('Paris, france')).toEqual({ country: 'France', state: '', city: 'Paris' })
  })

  it('leaves four-part locations unparsed', () => {
    expect(parseLegacyLocation('1 Main St, Miami, FL, USA')).toBeUndefined()
  })
})
