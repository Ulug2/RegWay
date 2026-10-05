// What is recorded about a firm, fund or portfolio company, as one line of
// prompt text. Shared by the impact analysis (_shared/impact.ts) and the
// RegWay AI chat, so both describe an entity from the same facts: the
// row's own columns plus the questionnaire answers stored in `profile`.

// {country, state, city} objects (the questionnaire's LocationValue shape,
// stored raw in `profile` for fields with no legacy string-column mirror)
// get formatted like an address instead of dumped as JSON.
const isLocationValue = (v: unknown): v is { city?: string; state?: string; country?: string } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('city' in v || 'state' in v || 'country' in v)

export const FIRM_FACTS = ['hq_location', 'legal_domicile', 'jurisdictions', 'firm_type', 'adviser_registration', 'strategies', 'industries', 'geographies']
// `holds`: the companies a fund holds (fund_holdings), added by the caller.
export const FUND_FACTS = ['structure', 'size', 'jurisdictions', 'status', 'strategy', 'ownership', 'industries', 'geographies', 'holds']
export const COMPANY_FACTS = [
  'hq_location', 'sectors', 'regions', 'operating_locations', 'supplier_locations', 'offerings', 'customers', 'consumer_facing',
  'sensitive_data', 'regulated', 'license_types', 'gov_contracts', 'trade', 'outside_us', 'foreign_countries', 'ownership',
]

// "key: value; key: value" for the keys that have a value, read from the
// row first and its `profile` second. Empty answers are left out.
export const facts = (row: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!row) return ''
  const profile = (row.profile ?? {}) as Record<string, unknown>
  const parts = keys
    .map(k => [k, row[k] ?? profile[k]] as const)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => {
      const formatted = isLocationValue(v)
        ? [v.city, v.state, v.country].map(x => x?.trim()).filter(Boolean).join(', ')
        : Array.isArray(v)
          ? v.join(', ')
          : typeof v === 'object'
            ? JSON.stringify(v)
            : v
      return `${k}: ${formatted}`
    })
  return parts.join('; ')
}
