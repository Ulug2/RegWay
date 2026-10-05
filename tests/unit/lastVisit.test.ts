import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isNewSince, markVisit } from '../../src/lib/lastVisit'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem = (k: string) => this.values.get(k) ?? null
  setItem = (k: string, v: string) => void this.values.set(k, v)
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
  vi.useFakeTimers()
  return () => vi.useRealTimers()
})

describe('markVisit', () => {
  it('returns null on a first visit, so nothing is flagged as new', () => {
    expect(markVisit('u1', 'f1')).toBeNull()
  })

  it('keeps one cut-off for the whole browser session', () => {
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
    markVisit('u1', 'f1')

    // A new browser session the next day.
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.setSystemTime(new Date('2026-10-02T09:00:00Z'))
    expect(markVisit('u1', 'f1')).toBe('2026-10-01T10:00:00.000Z')

    // Coming back to the dashboard later in the same session.
    vi.setSystemTime(new Date('2026-10-02T15:00:00Z'))
    expect(markVisit('u1', 'f1')).toBe('2026-10-01T10:00:00.000Z')

    // The next session starts from the last view of the previous one.
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    vi.setSystemTime(new Date('2026-10-03T09:00:00Z'))
    expect(markVisit('u1', 'f1')).toBe('2026-10-02T15:00:00.000Z')
  })

  it('keeps visits separate per user and per firm', () => {
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
    markVisit('u1', 'f1')
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    expect(markVisit('u2', 'f1')).toBeNull()
    expect(markVisit('u1', 'f2')).toBeNull()
  })

  it('returns null instead of throwing when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    vi.stubGlobal('localStorage', broken)
    vi.stubGlobal('sessionStorage', broken)
    expect(markVisit('u1', 'f1')).toBeNull()
  })
})

describe('isNewSince', () => {
  const since = '2026-10-02T09:00:00.000Z'

  it('compares instants, not strings (Postgres and JavaScript format timestamps differently)', () => {
    expect(isNewSince('2026-10-02T09:00:00.000001+00:00', since)).toBe(false) // same millisecond
    expect(isNewSince('2026-10-02T09:00:01.123456+00:00', since)).toBe(true)
    expect(isNewSince('2026-10-02T11:30:00+02:00', since)).toBe(true) // 09:30 UTC
    expect(isNewSince('2026-10-02T10:30:00+02:00', since)).toBe(false) // 08:30 UTC
  })

  it('is false without a cut-off or a match time', () => {
    expect(isNewSince('2026-10-03T00:00:00Z', null)).toBe(false)
    expect(isNewSince(null, since)).toBe(false)
    expect(isNewSince(undefined, since)).toBe(false)
  })
})
