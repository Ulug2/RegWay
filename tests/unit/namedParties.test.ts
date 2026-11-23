import { describe, expect, it } from 'vitest'
import { coreName, namedPartyReason, namedParties, releaseText } from '../../supabase/functions/_shared/namedParties'

const entities = {
  firm: { name: 'H.I.G. Capital' },
  funds: [{ id: 'fund-6', name: 'H.I.G. Capital Partners VI, L.P.' }],
  companies: [
    { id: 'co-innovage', name: 'InnovAge Holding Corporation' },
    { id: 'co-apex', name: 'Apex' },
    { id: 'co-health', name: 'Health' },
    { id: 'co-blue', name: 'Blue Ocean International Bank' },
  ],
}

describe('coreName', () => {
  it('drops the endings a headline leaves off', () => {
    expect(coreName('InnovAge Holding Corporation')).toBe('innovage')
    expect(coreName('Adelphi Technology, LLC')).toBe('adelphi technology')
    expect(coreName('H.I.G. Capital Partners VI, L.P.')).toBe('h i g capital partners vi')
    expect(coreName('The Smith & Wesson Company')).toBe('smith and wesson')
  })

  it('refuses names too short or too ordinary to search for', () => {
    expect(coreName('ABC Inc.')).toBeNull()
    expect(coreName('Health')).toBeNull()
    expect(coreName('Capital Group')).toBeNull()
    expect(coreName('')).toBeNull()
  })
})

describe('namedParties', () => {
  it('finds a portfolio company named in a headline by its short name', () => {
    const text = 'PACE Organization InnovAge Agrees to Pay $36M to Resolve False Claims Act Allegations'
    expect(namedParties(text, entities)).toEqual([{ scope: 'company', id: 'co-innovage', name: 'InnovAge Holding Corporation' }])
  })

  it('finds the firm and a fund, whatever the punctuation', () => {
    const found = namedParties('The SEC settled with H.I.G. Capital Partners VI L.P. over fee allocation.', entities)
    expect(found.map(p => p.scope)).toEqual(['firm', 'fund'])
  })

  it('matches whole words only', () => {
    expect(namedParties('Apexion Corp. pleads guilty', entities)).toEqual([])
    expect(namedParties('The Apex Group settles', entities).map(p => p.id)).toEqual(['co-apex'])
  })

  it('never matches a name that is an ordinary word', () => {
    expect(namedParties('Healthcare Fraud: Home Health agency owner sentenced', entities)).toEqual([])
  })

  it('reads the title, summary and narrative', () => {
    const release = { title: 'Bank Pleads Guilty', summary: null, raw: { narrative_text: 'Blue Ocean International Bank, LLC pleaded guilty.' } }
    expect(namedParties(releaseText(release), entities).map(p => p.id)).toEqual(['co-blue'])
  })

  it('handles a firm with nothing recorded', () => {
    expect(namedParties('InnovAge settles', { firm: null, funds: null, companies: null })).toEqual([])
  })
})

describe('namedPartyReason', () => {
  it('says what was named and asks the reader to check', () => {
    expect(namedPartyReason({ scope: 'fund', id: 'f', name: 'Fund VI' })).toBe('This release names Fund VI, one of your funds. Check that it is the same fund.')
  })
})
