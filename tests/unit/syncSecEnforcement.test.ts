import { describe, expect, it } from 'vitest'
import { summaryOf } from '../../supabase/functions/sync-sec-enforcement/index'

const TITLE = 'John Doe; Acme Capital LLC'

describe('sync-sec-enforcement summaryOf', () => {
  it('uses the headline sentence of the release', () => {
    const narrative = 'Securities and Exchange Commission v. John Doe (S.D.N.Y. filed Nov. 3, 2026) SEC Charges Adviser with Hiding Fees from Clients On November 3, 2026, the Securities and Exchange Commission filed…'
    expect(summaryOf(narrative, TITLE)).toBe('SEC Charges Adviser with Hiding Fees from Clients')
  })

  it('falls back to the start of the release, cut at a word, never the title', () => {
    const narrative = `The Securities and Exchange Commission today announced settled charges against an investment adviser for failing to disclose conflicts. ${'More detail follows here. '.repeat(30)}`
    const summary = summaryOf(narrative, TITLE)!
    expect(summary.startsWith('The Securities and Exchange Commission today announced')).toBe(true)
    expect(summary.endsWith('…')).toBe(true)
    expect(summary.length).toBeLessThanOrEqual(401)
  })

  it('gives no summary rather than repeating the title', () => {
    expect(summaryOf('', TITLE)).toBeNull()
    expect(summaryOf(TITLE, TITLE)).toBeNull()
  })
})
