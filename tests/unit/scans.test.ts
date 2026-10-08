import { describe, expect, it } from 'vitest'
import { QUIET_MS, needsScan, scanDueAt } from '../../src/lib/scans'
import { RESCAN_REQUESTED, rescanRequested } from '../../src/lib/data'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const DAY = 24 * 60 * MIN

describe('when a company is researched', () => {
  it('scans a company just added at once', () => {
    const added = { last_scanned_at: null, created_at: ago(2000), profile_updated_at: ago(1900) }
    expect(needsScan(added, NOW)).toBe(true)
    // Older rows have neither date.
    expect(needsScan({ last_scanned_at: null }, NOW)).toBe(true)
  })

  it('leaves a recently scanned company alone and re-scans one after a week', () => {
    expect(needsScan({ last_scanned_at: ago(2 * DAY), profile_updated_at: ago(30 * DAY), created_at: ago(60 * DAY) }, NOW)).toBe(false)
    expect(needsScan({ last_scanned_at: ago(8 * DAY), profile_updated_at: ago(30 * DAY), created_at: ago(60 * DAY) }, NOW)).toBe(true)
  })

  it('holds a scan asked for by an edit until five minutes after the last save', () => {
    const edited = (minutes: number) => ({ last_scanned_at: RESCAN_REQUESTED, created_at: ago(60 * DAY), profile_updated_at: ago(minutes * MIN) })
    expect(needsScan(edited(2), NOW)).toBe(false)
    expect(scanDueAt(edited(2), NOW)).toBe(NOW - 2 * MIN + QUIET_MS)
    expect(needsScan(edited(4.9), NOW)).toBe(false)
    expect(needsScan(edited(5), NOW)).toBe(true)
    expect(scanDueAt(edited(5), NOW)).toBe(0)
  })

  it('tells a requested re-scan (old results to replace) from a company never scanned', () => {
    expect(rescanRequested({ last_scanned_at: RESCAN_REQUESTED })).toBe(true)
    expect(rescanRequested({ last_scanned_at: null })).toBe(false)
    expect(rescanRequested({ last_scanned_at: ago(DAY) })).toBe(false)
  })
})
