import { describe, expect, it } from 'vitest'
import { sanctionsProgramCountries } from '../../supabase/functions/_shared/sanctionsPrograms.ts'

describe('sanctionsProgramCountries', () => {
  it("reads the program country from a notice's authority line", () => {
    expect(sanctionsProgramCountries('(Authority: E.O. 13902.)')).toEqual(['Iran'])
    expect(sanctionsProgramCountries('pursuant to Executive Order 14024')).toEqual(['Russia'])
    expect(sanctionsProgramCountries('E.O. No. 13882')).toEqual(['Mali'])
    expect(sanctionsProgramCountries('E. O. 13692')).toEqual(['Venezuela'])
  })

  it('returns each country once, in first-cited order', () => {
    expect(sanctionsProgramCountries('E.O. 13882 and E.O. 13902; see also Executive Order 13846')).toEqual(['Mali', 'Iran'])
  })

  it('leaves program-wide authorities country-less', () => {
    expect(sanctionsProgramCountries('(Authority: E.O. 13224.)')).toEqual([])
    expect(sanctionsProgramCountries('E.O. 13818 (Global Magnitsky)')).toEqual([])
  })

  it('ignores numbers that are not order citations', () => {
    expect(sanctionsProgramCountries('Docket 13902; 31 CFR 13902')).toEqual([])
    expect(sanctionsProgramCountries('E.O. 139020')).toEqual([])
    expect(sanctionsProgramCountries('')).toEqual([])
  })
})
