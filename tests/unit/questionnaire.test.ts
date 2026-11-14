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

  it('leaves other three-part locations unparsed', () => {
    expect(parseLegacyLocation('Paris, Texas, France')).toBeUndefined()
  })
})
