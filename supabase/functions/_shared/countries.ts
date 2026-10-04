// Country gazetteer shared by the geopolitical syncs and matcher. Two jobs:
//
// 1. `extractCountries(text)` — which countries a development is about,
//    read from its title/abstract at ingest time and stored on
//    `regulations.countries`. Deterministic and free (no AI call), so the
//    matcher can pre-filter by location before spending anything.
// 2. `countryOfLocation(value)` — which country one of an entity's profile
//    locations is in ("Naples, Italy", "Texas", "Germany"), so the same
//    pre-filter can compare like with like.
//
// Canonical names match `COUNTRIES` in src/lib/questionnaire.ts, which is what
// users pick from, so a stored profile value resolves to itself.

// [canonical name, ...aliases]. Aliases cover official/short forms and the
// adjectival forms sanctions programs are named with ("Iranian Transactions
// and Sanctions Regulations", "Russian Harmful Foreign Activities").
const COUNTRY_TABLE: string[][] = [
  ['Afghanistan', 'Afghan'],
  ['Albania', 'Albanian'],
  ['Algeria', 'Algerian'],
  ['Andorra'],
  ['Angola', 'Angolan'],
  ['Antigua and Barbuda'],
  ['Argentina', 'Argentine', 'Argentinian'],
  ['Armenia', 'Armenian'],
  ['Australia', 'Australian'],
  ['Austria', 'Austrian'],
  ['Azerbaijan', 'Azerbaijani'],
  ['Bahamas', 'The Bahamas'],
  ['Bahrain', 'Bahraini'],
  ['Bangladesh', 'Bangladeshi'],
  ['Barbados'],
  ['Belarus', 'Belarusian', 'Belarusan'],
  ['Belgium', 'Belgian'],
  ['Belize'],
  ['Benin'],
  ['Bermuda'],
  ['Bhutan'],
  ['Bolivia', 'Bolivian'],
  ['Bosnia and Herzegovina', 'Bosnia', 'Bosnian'],
  ['Botswana'],
  ['Brazil', 'Brazilian'],
  ['British Virgin Islands'],
  ['Brunei'],
  ['Bulgaria', 'Bulgarian'],
  ['Burkina Faso'],
  ['Burma', 'Myanmar', 'Burmese', 'Burma (Myanmar)'],
  ['Burundi', 'Burundian'],
  ['Cabo Verde', 'Cape Verde'],
  ['Cambodia', 'Cambodian'],
  ['Cameroon', 'Cameroonian'],
  ['Canada', 'Canadian'],
  ['Cayman Islands'],
  ['Central African Republic'],
  ['Chad'],
  ['Chile', 'Chilean'],
  ['China', "People's Republic of China", 'Mainland China', 'PRC', 'Chinese'],
  ['Colombia', 'Colombian'],
  ['Comoros'],
  ['Costa Rica'],
  ["Cote d'Ivoire", "Côte d'Ivoire", 'Cote d Ivoire', 'Ivory Coast'],
  ['Croatia', 'Croatian'],
  ['Cuba', 'Cuban'],
  ['Cyprus', 'Cypriot'],
  ['Czech Republic', 'Czechia', 'Czech'],
  ['Democratic Republic of the Congo', 'Democratic Republic of Congo', 'DRC', 'Congo-Kinshasa'],
  ['Denmark', 'Danish'],
  ['Djibouti'],
  ['Dominica'],
  ['Dominican Republic'],
  ['Ecuador', 'Ecuadorian'],
  ['Egypt', 'Egyptian'],
  ['El Salvador', 'Salvadoran'],
  ['Equatorial Guinea'],
  ['Eritrea', 'Eritrean'],
  ['Estonia', 'Estonian'],
  ['Eswatini', 'Swaziland'],
  ['Ethiopia', 'Ethiopian'],
  ['Fiji'],
  ['Finland', 'Finnish'],
  ['France', 'French'],
  ['Gabon'],
  ['Gambia', 'The Gambia'],
  ['Georgia', 'Georgia (country)'],
  ['Germany', 'German'],
  ['Ghana', 'Ghanaian'],
  ['Greece', 'Greek'],
  ['Grenada'],
  ['Guatemala', 'Guatemalan'],
  ['Guinea'],
  ['Guinea-Bissau'],
  ['Guyana'],
  ['Haiti', 'Haitian'],
  ['Honduras', 'Honduran'],
  ['Hong Kong'],
  ['Hungary', 'Hungarian'],
  ['Iceland', 'Icelandic'],
  ['India', 'Indian'],
  ['Indonesia', 'Indonesian'],
  ['Iran', 'Iranian'],
  ['Iraq', 'Iraqi'],
  ['Ireland', 'Irish'],
  ['Israel', 'Israeli'],
  ['Italy', 'Italian'],
  ['Jamaica', 'Jamaican'],
  ['Japan', 'Japanese'],
  ['Jordan', 'Jordanian'],
  ['Kazakhstan', 'Kazakh'],
  ['Kenya', 'Kenyan'],
  ['Kiribati'],
  ['Kosovo'],
  ['Kuwait', 'Kuwaiti'],
  ['Kyrgyzstan', 'Kyrgyz'],
  ['Laos', 'Lao'],
  ['Latvia', 'Latvian'],
  ['Lebanon', 'Lebanese'],
  ['Lesotho'],
  ['Liberia', 'Liberian'],
  ['Libya', 'Libyan'],
  ['Liechtenstein'],
  ['Lithuania', 'Lithuanian'],
  ['Luxembourg'],
  ['Macau', 'Macao'],
  ['Madagascar'],
  ['Malawi'],
  ['Malaysia', 'Malaysian'],
  ['Maldives'],
  ['Mali', 'Malian'],
  ['Malta', 'Maltese'],
  ['Marshall Islands'],
  ['Mauritania'],
  ['Mauritius'],
  ['Mexico', 'Mexican'],
  ['Micronesia'],
  ['Moldova', 'Moldovan'],
  ['Monaco'],
  ['Mongolia', 'Mongolian'],
  ['Montenegro'],
  ['Morocco', 'Moroccan'],
  ['Mozambique'],
  ['Namibia'],
  ['Nauru'],
  ['Nepal', 'Nepalese'],
  ['Netherlands', 'The Netherlands', 'Dutch'],
  ['New Zealand'],
  ['Nicaragua', 'Nicaraguan'],
  ['Niger'],
  ['Nigeria', 'Nigerian'],
  ['North Korea', "Democratic People's Republic of Korea", 'DPRK', 'North Korean'],
  ['North Macedonia', 'Macedonia'],
  ['Norway', 'Norwegian'],
  ['Oman'],
  ['Pakistan', 'Pakistani'],
  ['Palau'],
  ['Panama', 'Panamanian'],
  ['Papua New Guinea'],
  ['Paraguay'],
  ['Peru', 'Peruvian'],
  ['Philippines', 'Philippine', 'Filipino'],
  ['Poland', 'Polish'],
  ['Portugal', 'Portuguese'],
  ['Qatar', 'Qatari'],
  ['Republic of the Congo', 'Republic of Congo', 'Congo-Brazzaville'],
  ['Romania', 'Romanian'],
  ['Russia', 'Russian Federation', 'Russian'],
  ['Rwanda', 'Rwandan'],
  ['Saint Kitts and Nevis'],
  ['Saint Lucia'],
  ['Saint Vincent and the Grenadines'],
  ['Samoa'],
  ['San Marino'],
  ['Sao Tome and Principe'],
  ['Saudi Arabia', 'Saudi'],
  ['Senegal'],
  ['Serbia', 'Serbian'],
  ['Seychelles'],
  ['Sierra Leone'],
  ['Singapore'],
  ['Slovakia', 'Slovak'],
  ['Slovenia', 'Slovenian'],
  ['Solomon Islands'],
  ['Somalia', 'Somali'],
  ['South Africa', 'South African'],
  ['South Korea', 'Republic of Korea', 'South Korean'],
  ['South Sudan'],
  ['Spain', 'Spanish'],
  ['Sri Lanka', 'Sri Lankan'],
  ['Sudan', 'Sudanese'],
  ['Suriname'],
  ['Sweden', 'Swedish'],
  ['Switzerland', 'Swiss'],
  ['Syria', 'Syrian'],
  ['Taiwan', 'Taiwanese'],
  ['Tajikistan'],
  ['Tanzania', 'Tanzanian'],
  ['Thailand', 'Thai'],
  ['Timor-Leste', 'East Timor'],
  ['Togo'],
  ['Tonga'],
  ['Trinidad and Tobago'],
  ['Tunisia', 'Tunisian'],
  ['Turkey', 'Türkiye', 'Turkiye', 'Turkish'],
  ['Turkmenistan'],
  ['Tuvalu'],
  ['Uganda', 'Ugandan'],
  ['Ukraine', 'Ukrainian'],
  ['United Arab Emirates', 'UAE'],
  ['United Kingdom', 'UK', 'U.K.', 'Great Britain', 'Britain', 'British', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  ['United States', 'USA', 'U.S.', 'US', 'United States of America'],
  ['Uruguay'],
  ['Uzbekistan', 'Uzbek'],
  ['Vanuatu'],
  ['Venezuela', 'Venezuelan'],
  ['Vietnam', 'Viet Nam', 'Vietnamese'],
  ['West Bank and Gaza', 'West Bank', 'Gaza', 'Palestinian Territories'],
  ['Yemen', 'Yemeni'],
  ['Zambia'],
  ['Zimbabwe', 'Zimbabwean'],
]

// Aliases that are too often something else in free text to count as a
// country mention on their own: a U.S. state, a person's name, or (for
// "British"/"US") words that show up in unrelated titles. They still resolve
// in `countryOfLocation`, where the input is known to be a place.
const FREE_TEXT_EXCLUDED = new Set(['Georgia', 'Jordan', 'Chad', 'US', 'U.S.', 'British', 'Indian', 'Lao'])

// Only real geography is recorded on `regulations.countries`. The U.S. is
// the default jurisdiction of nearly every federal document, so tagging it
// would make every item "about" the U.S. and defeat the pre-filter.
const NOT_A_DEVELOPMENT_LOCATION = new Set(['United States'])

const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
  'all united states', 'nationwide', 'federal',
  // Postal abbreviations, for free-text locations like "Austin, TX" (the
  // facilities question's own example). Checked before country aliases, so
  // a code that is also a country's ISO code (CA, DE, CO) reads as the state:
  // the firms are U.S.-based and enter U.S. addresses this way far more often.
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky',
  'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd',
  'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc',
])

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Longest alias first, so "Papua New Guinea" and "South Sudan" are consumed
// before "Guinea" and "Sudan" can match inside them.
const FREE_TEXT_ALIASES: { alias: string; country: string; pattern: RegExp }[] = COUNTRY_TABLE.flatMap(([country, ...aliases]) =>
  [country, ...aliases]
    .filter(alias => !FREE_TEXT_EXCLUDED.has(alias))
    .map(alias => ({
      alias,
      country,
      // Case-sensitive on purpose: country names in official titles are
      // capitalized, and this keeps "turkey" or "china" (the common nouns)
      // from matching. Lookarounds instead of \b so aliases ending in "."
      // or containing apostrophes still anchor correctly.
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(alias)}(?![\\p{L}\\p{N}])`, 'gu'),
    })),
).sort((a, b) => b.alias.length - a.alias.length)

const BY_LOWERCASE_ALIAS = new Map<string, string>(
  COUNTRY_TABLE.flatMap(([country, ...aliases]) => [country, ...aliases].map(a => [a.toLowerCase(), country] as const)),
)

// Canonical names of every country mentioned in `text`, in first-seen order.
export function extractCountries(text: string | null | undefined): string[] {
  if (!text) return []
  let remaining = text
  const firstSeenAt = new Map<string, number>()
  for (const { country, pattern } of FREE_TEXT_ALIASES) {
    pattern.lastIndex = 0
    const match = pattern.exec(remaining)
    if (!match) continue
    // Blank out the matched spans so a shorter alias can't re-match inside them.
    remaining = remaining.replace(pattern, m => ' '.repeat(m.length))
    if (NOT_A_DEVELOPMENT_LOCATION.has(country)) continue
    firstSeenAt.set(country, Math.min(firstSeenAt.get(country) ?? Infinity, match.index))
  }
  return [...firstSeenAt.entries()].sort((a, b) => a[1] - b[1]).map(([country]) => country)
}

// The canonical country for a string known to name a country (a feed's
// country field, a picker value), including the free-text-excluded aliases
// ("Jordan", "Chad", "Georgia") and without treating "Georgia" as the state.
export const countryByName = (name: string): string | null => BY_LOWERCASE_ALIAS.get(name.trim().toLowerCase()) ?? null

// The country one profile location value is in, or null when it doesn't
// name one ("International", "Europe", empty). Accepts a plain string
// ("Germany", "Texas", "Naples, Italy") or the questionnaire's
// {city, state, country} object.
export function countryOfLocation(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const loc = value as { state?: string; country?: string }
    return countryOfLocation(loc.country || loc.state || '')
  }
  if (typeof value !== 'string') return null
  const parts = value.split(',').map(p => p.trim()).filter(Boolean)
  // Most specific last: "Naples, Italy" → Italy, "Austin, Texas, United States" → United States.
  for (const part of parts.reverse()) {
    const key = part.toLowerCase()
    if (US_STATES.has(key)) return 'United States'
    const country = BY_LOWERCASE_ALIAS.get(key)
    if (country) return country
  }
  return null
}
