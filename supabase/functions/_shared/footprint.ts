// An entity's geographic footprint: which countries it is connected to, and
// *how* (its headquarters, where it operates, where its suppliers are).
// Spec §3 requires those to stay distinguishable and §9 requires every
// geopolitical match to name the connection, so the kind is carried with
// every country instead of flattening everything into one location list.
//
// Used by match-geopolitical-relevance for the free pre-filter (which
// countries does this firm touch at all?) and to hand the model the exact
// overlapping facts per development, so it explains a connection the code
// already found instead of inventing one.

import { countryOfLocation } from './countries.ts'
import type { CompanyRow, FirmRow } from './relevance.ts'

export type ConnectionKind = 'headquarters' | 'legal domicile' | 'facilities' | 'operations' | 'suppliers'

export interface LocationFact {
  kind: ConnectionKind
  country: string
}

export interface EntityFootprint {
  scope: 'firm' | 'company'
  name: string
  facts: LocationFact[]
  // A location was recorded that names no country ("International",
  // "Europe", a bare city name): the footprint may reach countries we can't
  // place, so country-less (global) measures stay candidates.
  unplacedLocations: boolean
  // Spec §3: missing supplier data stays visibly unknown, never "none".
  suppliersRecorded: boolean
  // What the entity does (sectors, one-line description). Location alone
  // can't decide a product- or sector-specific measure (a tariff on aircraft
  // parts reaches an aerospace company, not a software firm in the same
  // country), so the matcher needs this alongside the places.
  activities: string[]
}

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])

function collect(facts: LocationFact[], kind: ConnectionKind, values: unknown[]): boolean {
  let unplaced = false
  for (const value of values) {
    const country = countryOfLocation(value)
    if (!country) {
      unplaced = true
      continue
    }
    if (!facts.some(f => f.kind === kind && f.country === country)) facts.push({ kind, country })
  }
  return unplaced
}

export function firmFootprint(firm: FirmRow): EntityFootprint {
  const profile = firm.profile ?? {}
  const facts: LocationFact[] = []
  const unplaced = [
    collect(facts, 'headquarters', asList(profile.hq ?? firm.hq_location)),
    collect(facts, 'legal domicile', asList(profile.legal_domicile)),
  ].some(Boolean)
  const activities = [...asList(profile.firm_type), ...asList(profile.strategies)].filter((a): a is string => typeof a === 'string')
  return { scope: 'firm', name: firm.name, facts, unplacedLocations: unplaced, suppliersRecorded: false, activities }
}

export function companyFootprint(company: CompanyRow): EntityFootprint {
  const profile = company.profile ?? {}
  const facts: LocationFact[] = []
  // `regions` is the legacy mirror of operating_locations, only consulted
  // for companies created before the questionnaire existed.
  const operations = asList(profile.operating_locations).length ? asList(profile.operating_locations) : asList(company.regions)
  const suppliers = asList(profile.supplier_locations)
  const unplaced = [
    collect(facts, 'headquarters', asList(profile.hq ?? company.hq_location)),
    // Free-text tags ("Turin", "Austin, TX"): placed where they name a
    // country or U.S. state, otherwise counted as unplaced.
    collect(facts, 'facilities', asList(profile.facility_locations)),
    collect(facts, 'operations', [...operations, ...asList(profile.foreign_countries)]),
    collect(facts, 'suppliers', suppliers),
  ].some(Boolean)
  const activities = [...(company.sectors ?? []), ...asList(company.offerings)].filter((a): a is string => typeof a === 'string' && a.trim() !== '')
  return { scope: 'company', name: company.name, facts, unplacedLocations: unplaced, suppliersRecorded: suppliers.length > 0, activities }
}

// Every non-U.S. country any of these entities is connected to. The U.S. is
// excluded because development countries never include it (see
// NOT_A_DEVELOPMENT_LOCATION in countries.ts): every entity is U.S.-linked.
export function foreignCountries(footprints: EntityFootprint[]): string[] {
  return [...new Set(footprints.flatMap(fp => fp.facts.map(f => f.country)))].filter(c => c !== 'United States')
}

// Whether any entity could plausibly be touched by a development that names
// no specific country (a tariff on all imports, a program-wide rule change).
export const hasForeignExposure = (footprints: EntityFootprint[]) =>
  footprints.some(fp => fp.unplacedLocations || fp.suppliersRecorded || fp.facts.some(f => f.country !== 'United States'))

// "A.L.A. S.p.A. — headquarters: Italy" for each entity fact in `countries`.
export function overlaps(footprints: EntityFootprint[], countries: string[]): string[] {
  const wanted = new Set(countries)
  return footprints.flatMap(fp =>
    fp.facts.filter(f => wanted.has(f.country)).map(f => `${fp.name} (${fp.scope}) — ${f.kind}: ${f.country}`),
  )
}

// One prompt line per entity, stating unknowns explicitly.
export function describeFootprint(fp: EntityFootprint): string {
  const byKind = (kind: ConnectionKind) => fp.facts.filter(f => f.kind === kind).map(f => f.country)
  const part = (label: string, kind: ConnectionKind) => (byKind(kind).length ? `${label}: ${byKind(kind).join(', ')}` : '')
  const parts = [
    fp.activities.length ? `does: ${fp.activities.join(', ')}` : 'activity: NOT RECORDED',
    part('headquarters', 'headquarters'),
    part('legal domicile', 'legal domicile'),
    part('facilities in', 'facilities'),
    part('operates in', 'operations'),
    fp.scope === 'company' ? (fp.suppliersRecorded ? part('key suppliers in', 'suppliers') || 'key suppliers: recorded but not placed in a specific country' : 'key suppliers: NOT RECORDED') : '',
    fp.unplacedLocations ? 'also has locations recorded without a country (e.g. "International" or a bare city name)' : '',
  ].filter(Boolean)
  return `- ${fp.name} (${fp.scope}): ${parts.join('; ') || 'no locations recorded'}`
}
