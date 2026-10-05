import { describe, expect, it } from 'vitest'
import { dayLabel, dayOf, firstDay, itemsOnDay, localDay, previousDayWithFindings, resolveDay, shiftDay } from '../../src/lib/feedDays'
import type { MatchedRegulation } from '../../src/lib/types'

// Matched at local noon on the given day, so the test doesn't depend on the
// machine's time zone.
const found = (id: string, day: string) => ({ id, matched_at: new Date(`${day}T12:00:00`).toISOString() }) as MatchedRegulation

describe('feed days', () => {
  it('reads a timestamp as the local day it falls on', () => {
    expect(dayOf(new Date(2026, 9, 5, 23, 59).toISOString())).toBe('2026-10-05')
    expect(dayOf(new Date(2026, 9, 6, 0, 1).toISOString())).toBe('2026-10-06')
    expect(dayOf(null)).toBeNull()
    expect(dayOf('not a date')).toBeNull()
    expect(localDay(new Date(2026, 0, 3))).toBe('2026-01-03')
  })

  it('steps across month and year ends', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('says Today and Yesterday, then the date', () => {
    expect(dayLabel('2026-10-05', '2026-10-05')).toBe('Today')
    expect(dayLabel('2026-10-04', '2026-10-05')).toBe('Yesterday')
    expect(dayLabel('2026-10-02', '2026-10-05')).toBe('Fri, Oct 2')
  })

  it('opens on today unless a day or all days was chosen', () => {
    expect(resolveDay(null, '2026-10-05')).toBe('2026-10-05')
    expect(resolveDay('2026-10-03', '2026-10-05')).toBe('2026-10-03')
    expect(resolveDay('all', '2026-10-05')).toBeNull()
  })

  const items = [found('a', '2026-10-04'), found('b', '2026-10-04'), found('c', '2026-10-01')]

  it("lists what was found on a day, and points an empty day at the last day with findings", () => {
    expect(itemsOnDay(items, '2026-10-04').map(i => i.id)).toEqual(['a', 'b'])
    expect(itemsOnDay(items, '2026-10-05')).toEqual([])
    expect(previousDayWithFindings(items, '2026-10-05')).toBe('2026-10-04')
    expect(previousDayWithFindings(items, '2026-10-04')).toBe('2026-10-01')
    expect(previousDayWithFindings(items, '2026-10-01')).toBeNull()
  })

  it('goes back to the day the firm started, or an earlier finding', () => {
    const created = new Date('2026-09-30T12:00:00').toISOString()
    expect(firstDay(items, created, '2026-10-05')).toBe('2026-09-30')
    expect(firstDay([found('old', '2026-09-20')], created, '2026-10-05')).toBe('2026-09-20')
    expect(firstDay([], null, '2026-10-05')).toBe('2026-10-05')
  })
})
