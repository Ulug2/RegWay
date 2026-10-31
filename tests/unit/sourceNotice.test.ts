import { describe, expect, it } from 'vitest'
import { sourceNotice } from '../../src/lib/sourceNotice'

describe('sourceNotice', () => {
  it('uses singular grammar for one source', () => {
    expect(sourceNotice(['FCA'])).toBe("FCA hasn't updated successfully recently. Recent items from this source may be missing.")
  })
  it('joins two sources', () => {
    expect(sourceNotice(['FCA', 'ESMA'])).toBe("FCA and ESMA haven't updated successfully recently. Recent items from these sources may be missing.")
  })
  it('joins three sources', () => {
    expect(sourceNotice(['FCA', 'ESMA', 'EUR-Lex'])).toBe("FCA, ESMA, and EUR-Lex haven't updated successfully recently. Recent items from these sources may be missing.")
  })
  it('uses plural grammar for the fallback label', () => {
    expect(sourceNotice(['Regulator feeds (U.S., UK and EU)'])).toBe("Regulator feeds (U.S., UK and EU) haven't updated successfully recently. Recent items from these sources may be missing.")
  })
})
