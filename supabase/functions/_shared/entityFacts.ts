// What is recorded about a firm, fund or portfolio company, as one line of
// prompt text. Shared by the impact analysis (_shared/impact.ts) and the
// RegWay AI chat, so both describe an entity from the same facts: the
// row's own columns plus the questionnaire answers stored in `profile`.

// A fact not confirmed for this long is marked: the same constant the
// Profile forms use, so the app and the AI agree on which facts are old.
import { STALE_AFTER_DAYS } from '../../../src/lib/questionnaire.ts'

// {country, state, city} objects (the questionnaire's LocationValue shape,
// stored raw in `profile` for fields with no legacy string-column mirror)
// get formatted like an address instead of dumped as JSON.
const isLocationValue = (v: unknown): v is { city?: string; state?: string; country?: string } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('city' in v || 'state' in v || 'country' in v)

// `notes`: facts in the firm's own words that fit no other question
// (Sidekick §17.6), each quoted.
export const FIRM_FACTS = ['hq_location', 'legal_domicile', 'jurisdictions', 'firm_type', 'adviser_registration', 'strategies', 'industries', 'geographies', 'notes']
// `holds`: the companies a fund holds (fund_holdings), added by the caller.
export const FUND_FACTS = ['structure', 'size', 'jurisdictions', 'status', 'strategy', 'ownership', 'industries', 'geographies', 'holds', 'notes']
export const COMPANY_FACTS = [
  'hq_location', 'sectors', 'regions', 'operating_locations', 'supplier_locations', 'offerings', 'customers', 'consumer_facing',
  'sensitive_data', 'regulated', 'license_types', 'gov_contracts', 'trade', 'outside_us', 'foreign_countries', 'ownership', 'notes',
]

// Facts whose absence changes what can be concluded, so a blank one is
// stated as "not recorded" rather than left out (spec: missing information
// stays visibly unknown; a company with no supplier locations entered
// cannot be said to have no suppliers anywhere). Follow-up answers that
// only exist after a "yes" (license types, foreign countries) are left out.
export const FIRM_UNKNOWNS = ['adviser_registration', 'legal_domicile', 'strategies']
export const FUND_UNKNOWNS = ['status', 'strategy', 'ownership']
// `regions`: where the company operates (the column built from its operating-location answers).
export const COMPANY_UNKNOWNS = ['regions', 'supplier_locations', 'customers', 'consumer_facing', 'sensitive_data', 'regulated', 'gov_contracts', 'trade', 'outside_us']

// How to read the two markers `facts` adds; goes wherever its lines go.
export const FACT_MARKERS =
  'A fact listed under "not recorded" is unknown: never treat it as a "no" or as absent, and where a conclusion would turn on it, say that it is not recorded. A fact marked "last confirmed" with a date has not been confirmed in over a year: where a conclusion rests on it, say it should be re-confirmed.'


// The questionnaire answers a derived column is built from: `profile_meta`
// is keyed by answer, so a column is as old as its oldest answer.
const ANSWERS_BEHIND: Record<string, string[]> = {
  hq_location: ['hq'],
  sectors: ['industry', 'secondary_industries'],
  regions: ['operating_locations', 'foreign_countries'],
  offerings: ['description', 'products'],
  jurisdictions: ['hq', 'legal_domicile', 'domicile', 'geographies', 'key_states'],
}

// The day a fact was last confirmed, if that is over a year ago. A fact
// with no entry (recorded before provenance was kept) has no known date and
// is not marked.
function staleSince(row: Record<string, unknown>, key: string, now: number): string | null {
  const meta = (row.profile_meta ?? {}) as Record<string, { confirmed_at?: string } | undefined>
  const dates = (ANSWERS_BEHIND[key] ?? [key]).map(id => meta[id]?.confirmed_at).filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)))
  if (dates.length === 0) return null
  const oldest = dates.sort()[0]
  return now - Date.parse(oldest) > STALE_AFTER_DAYS * 86_400_000 ? oldest.slice(0, 10) : null
}

// "key: value; key: value" for the keys that have a value, read from the
// row first and its `profile` second. Empty answers are left out, except
// the `unknowns`, which are listed at the end as not recorded.
export const facts = (row: Record<string, unknown> | null | undefined, keys: string[], unknowns: string[] = [], now = Date.now()) => {
  if (!row) return ''
  const profile = (row.profile ?? {}) as Record<string, unknown>
  const recorded = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
  const parts = keys
    .map(k => [k, row[k] ?? profile[k]] as const)
    .filter(([, v]) => recorded(v))
    .map(([k, v]) => {
      const formatted = isLocationValue(v)
        ? [v.city, v.state, v.country].map(x => x?.trim()).filter(Boolean).join(', ')
        : Array.isArray(v)
          ? k === 'notes'
            ? v.map(n => `"${n}"`).join(', ')
            : v.join(', ')
          : typeof v === 'object'
            ? JSON.stringify(v)
            : v
      const stale = staleSince(row, k, now)
      return `${k}: ${formatted}${stale ? ` (last confirmed ${stale})` : ''}`
    })
  const missing = unknowns.filter(k => !recorded(row[k] ?? profile[k]))
  if (missing.length) parts.push(`not recorded: ${missing.join(', ')}`)
  return parts.join('; ')
}
