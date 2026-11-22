import { describe, expect, it } from 'vitest'
import { FIRM_FACTS, facts } from '../../supabase/functions/_shared/entityFacts'
import { isStale, STALE_AFTER_DAYS } from '../../src/lib/questionnaire'

// The browser (Profile's "re-confirm" prompts) and the server (what the AI
// is told) must agree on which facts are old (issue #37).
const DAY = 86_400_000
const now = Date.parse('2026-11-21T12:00:00Z')
const confirmedDaysAgo = (days: number) => new Date(now - days * DAY).toISOString()

const browserSaysStale = (days: number) => isStale({ source: 'user', confirmed_at: confirmedDaysAgo(days) }, now)
const serverSaysStale = (days: number) =>
  facts({ hq_location: 'New York, NY', profile_meta: { hq: { source: 'user', confirmed_at: confirmedDaysAgo(days) } } }, FIRM_FACTS, [], now).includes('last confirmed')

describe('one age for a stale fact', () => {
  it('is one year', () => {
    expect(STALE_AFTER_DAYS).toBe(365)
  })

  it.each([1, 364, 366, 800])('a fact confirmed %i days ago reads the same in the browser and to the AI', days => {
    expect(serverSaysStale(days)).toBe(browserSaysStale(days))
  })

  it('marks a fact just over the age and not one just under it', () => {
    expect([browserSaysStale(364), serverSaysStale(364)]).toEqual([false, false])
    expect([browserSaysStale(366), serverSaysStale(366)]).toEqual([true, true])
  })
})
