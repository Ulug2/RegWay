import { describe, expect, it } from 'vitest'
import { addedTo, groupFindings, showValue, type Finding } from '../../src/lib/research'
import { toRow } from '../../src/lib/questionnaire'

// The review of web research in Profile (roadmap item 18).

const finding = (over: Partial<Finding>): Finding => ({ id: 'f', scope: 'firm', entity_id: null, field: 'aum', value: '$25B+', recorded: null, source_url: 'https://example.com', quote: '', ...over })

describe('showing a finding', () => {
  it('reads like an answer', () => {
    expect(showValue({ city: 'Miami', state: 'Florida', country: 'United States' })).toBe('Miami, Florida, United States')
    expect(showValue(['Europe', 'Asia-Pacific'])).toBe('Europe, Asia-Pacific')
    expect(showValue('yes')).toBe('Yes')
  })

  it('shows only what it adds to a list the profile already had', () => {
    expect(addedTo(finding({ field: 'geographies', value: ['United States', 'Europe'], recorded: ['United States'] }))).toEqual(['Europe'])
    expect(addedTo(finding({}))).toBeNull()
  })

  it('groups by the firm, then each fund and company, leaving out new ones and entities no longer there', () => {
    const groups = groupFindings(
      [
        finding({ id: '1', scope: 'company', entity_id: 'co-1', field: 'employees' }),
        finding({ id: '2' }),
        finding({ id: '3', scope: 'fund', entity_id: 'fund-gone', field: 'size' }),
        finding({ id: '4', scope: 'company', field: 'new_entity', value: { name: 'Acme' } }),
      ],
      'H.I.G. Capital',
      [{ id: 'fund-1', name: 'Fund I' }],
      [{ id: 'co-1', name: 'GetixHealth' }],
    )
    expect(groups.map(g => [g.name, g.findings.map(f => f.id)])).toEqual([
      ['H.I.G. Capital', ['2']],
      ['GetixHealth', ['1']],
    ])
  })
})

describe('a confirmed finding in the profile', () => {
  const previous = { name: 'H.I.G. Capital', profile: { aum: '$5B-$25B' }, profile_meta: { aum: { source: 'user', confirmed_at: '2026-01-01T00:00:00Z' } } }

  it('is recorded as from the web, with its page', () => {
    const row = toRow('firm', { name: 'H.I.G. Capital', aum: '$25B+' }, { previous, meta: { aum: { source: 'web', url: 'https://adviserinfo.sec.gov/firm/1', confirmed_at: '2026-10-18T00:00:00Z' } }, now: '2026-10-18T12:00:00Z' })
    expect((row.profile_meta as Record<string, unknown>).aum).toEqual({ source: 'web', url: 'https://adviserinfo.sec.gov/firm/1', confirmed_at: '2026-10-18T12:00:00Z' })
  })

  it('keeps its page when something else is saved, and loses it when the user changes the answer', () => {
    const confirmed = { ...previous, profile: { aum: '$25B+' }, profile_meta: { aum: { source: 'web', url: 'https://adviserinfo.sec.gov/firm/1', confirmed_at: '2026-10-18T12:00:00Z' } } }
    const kept = toRow('firm', { name: 'H.I.G. Capital', aum: '$25B+', offices: ['London'] }, { previous: confirmed })
    expect((kept.profile_meta as Record<string, { source: string }>).aum).toMatchObject({ source: 'web', url: 'https://adviserinfo.sec.gov/firm/1' })
    // The form drops the web source on an edit (EntityCard), so the change is the user's.
    const edited = toRow('firm', { name: 'H.I.G. Capital', aum: '$1B-$5B' }, { previous: confirmed, meta: { aum: { source: 'user', confirmed_at: '2026-10-18T12:00:00Z' } } })
    expect((edited.profile_meta as Record<string, { source: string }>).aum.source).toBe('user')
  })
})
