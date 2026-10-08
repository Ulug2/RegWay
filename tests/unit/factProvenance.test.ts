import { describe, expect, it } from 'vitest'
import { isFact, isStale, questionsFor, toRow, type ProfileMeta } from '../../src/lib/questionnaire'

const T0 = '2026-01-10T09:00:00.000Z'
const T1 = '2026-10-08T12:00:00.000Z'
const metaOf = (row: Record<string, unknown>) => row.profile_meta as ProfileMeta

const COMPANY = { name: 'GetixHealth', website: 'https://getix.test', hq: { country: 'United States', state: 'Texas', city: 'Houston' }, industry: 'Healthcare', description: 'Revenue cycle management' }

describe('where an answer came from and when it was last confirmed', () => {
  it('stamps every answer of a new entity as entered by the user now, and nothing for blanks', () => {
    const row = toRow('company', { ...COMPANY, supplier_locations: [], customers: undefined }, { now: T0 })
    expect(metaOf(row)).toEqual({
      name: { source: 'user', confirmed_at: T0 },
      website: { source: 'user', confirmed_at: T0 },
      hq: { source: 'user', confirmed_at: T0 },
      industry: { source: 'user', confirmed_at: T0 },
      description: { source: 'user', confirmed_at: T0 },
    })
  })

  it('re-stamps only the answers a save changed', () => {
    const stored = toRow('company', COMPANY, { now: T0 })
    const row = toRow('company', { ...COMPANY, industry: 'Insurance', customers: ['Consumers'] }, { previous: stored, now: T1 })
    const meta = metaOf(row)
    expect(meta.industry.confirmed_at).toBe(T1)
    expect(meta.customers.confirmed_at).toBe(T1)
    expect(meta.name.confirmed_at).toBe(T0)
    expect(meta.hq.confirmed_at).toBe(T0)
  })

  it('does not date an answer recorded before provenance was kept just because something else was saved', () => {
    // A row from before `profile_meta` existed.
    const legacy = { ...toRow('company', COMPANY, { now: T0 }), profile_meta: {} }
    const row = toRow('company', { ...COMPANY, customers: ['Consumers'] }, { previous: legacy, now: T1 })
    expect(metaOf(row)).toEqual({ customers: { source: 'user', confirmed_at: T1 } })
  })

  it('keeps a confirmation or a named document made in the form, for answers that did not change', () => {
    const stored = toRow('company', COMPANY, { now: T0 })
    const form: ProfileMeta = {
      ...metaOf(stored),
      industry: { source: 'user', confirmed_at: T1 },
      hq: { source: 'document', document: ' Certificate of formation ', confirmed_at: T1 },
    }
    const meta = metaOf(toRow('company', COMPANY, { previous: stored, meta: form, now: '2026-10-09T00:00:00.000Z' }))
    expect(meta.industry).toEqual({ source: 'user', confirmed_at: T1 })
    expect(meta.hq).toEqual({ source: 'document', document: 'Certificate of formation', confirmed_at: T1 })
    expect(meta.name.confirmed_at).toBe(T0)
  })

  it('records a changed answer from the document named for it in the same edit, and drops one the form removed', () => {
    const stored = toRow('company', COMPANY, { meta: { industry: { source: 'document', document: 'Old deck', confirmed_at: T0 } }, now: T0 })
    expect(metaOf(stored).industry).toEqual({ source: 'document', document: 'Old deck', confirmed_at: T0 })

    const withNewDocument = toRow('company', { ...COMPANY, industry: 'Insurance' }, { previous: stored, meta: { ...metaOf(stored), industry: { source: 'document', document: 'State licence', confirmed_at: T1 } }, now: T1 })
    expect(metaOf(withNewDocument).industry).toEqual({ source: 'document', document: 'State licence', confirmed_at: T1 })

    // The form cleared the document when the answer was edited.
    const withoutDocument = toRow('company', { ...COMPANY, industry: 'Insurance' }, { previous: stored, meta: { ...metaOf(stored), industry: { source: 'user', confirmed_at: T0 } }, now: T1 })
    expect(metaOf(withoutDocument).industry).toEqual({ source: 'user', confirmed_at: T1 })
  })

  it('forgets the entry of an answer that was cleared', () => {
    const stored = toRow('company', { ...COMPANY, customers: ['Consumers'] }, { now: T0 })
    expect(metaOf(toRow('company', { ...COMPANY, customers: [] }, { previous: stored, now: T1 })).customers).toBeUndefined()
  })

  it('keeps no provenance for settings and preferences', () => {
    const row = toRow('fund', { name: 'Fund I', notifications: ['Weekly summary'], ai_diligence: 'yes' }, { now: T0 })
    expect(Object.keys(metaOf(row))).toEqual(['name'])
    expect(questionsFor('firm').filter(q => !isFact(q)).map(q => q.id)).toEqual(['teams', 'goals'])
  })

  it('is due for a look once it has gone a year unconfirmed', () => {
    const now = Date.parse(T1)
    expect(isStale({ source: 'user', confirmed_at: '2025-10-01T00:00:00Z' }, now)).toBe(true)
    expect(isStale({ source: 'user', confirmed_at: '2025-10-20T00:00:00Z' }, now)).toBe(false)
    // No entry: the date isn't known, so nothing is claimed about it.
    expect(isStale(undefined, now)).toBe(false)
  })
})
