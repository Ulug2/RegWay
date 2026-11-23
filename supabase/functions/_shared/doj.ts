// DOJ press releases (issue #41): False Claims Act settlements, antitrust
// decisions, FCPA, sanctions and export cases, and the big environmental
// settlements EPA announces through DOJ. Read from the Justice Department's
// JSON API, which lists every release from every office (about 70 a day,
// most of them drug, firearms and violent-crime cases against individuals).
//
// The API's topic filter does not work, so the filtering is done here, in
// code, before anything is stored or judged (the AI never sees what is
// dropped, so dropping costs nothing):
//
//   1. a topic about companies (`COMPANY_TOPICS`), or the Antitrust Division;
//   2. and a sign the case is about a company, not a person: a settlement
//      ("agrees to pay", "to resolve", a deferred-prosecution agreement), a
//      merger, a company name ("Inc.", "LLC", "Bank"), or any Antitrust
//      Division release, and no sign it is about a person ("sentenced",
//      "man", "former employee"), unless it is a settlement;
//   3. the same release posted by two offices kept once (by its title).
//
// Measured on 400 releases from 16–21 Nov 2026: 5 kept (the InnovAge False
// Claims Act settlement, a bank's Bank Secrecy Act plea, two contractor
// settlements, the closing of the NextEra–Dominion merger review).

import { decodeEntities } from './rss.ts'
import { stripHtml } from './text.ts'

export const DOJ_API = 'https://www.justice.gov/api/v1/press_releases.json'
// Two pages of the newest releases: about 1.5 days at the usual volume,
// plenty for an hourly sync with room for a missed day.
export const DOJ_PAGES = 2
export const DOJ_PAGE_SIZE = 50

export interface DojRelease {
  uuid: string
  title: string
  url: string
  // Unix seconds, as a string.
  date: string
  body?: string
  teaser?: string
  number?: string
  // A list, or "" when a release has none (about 1 in 6).
  topic?: { name: string }[] | string | null
  component?: { name: string }[] | string | null
}

// The API's topic names, as they appear on releases.
const COMPANY_TOPICS = new Set([
  'False Claims Act',
  'Healthcare Fraud',
  'Antitrust',
  'Foreign Corruption',
  'Securities, Commodities, & Investment Fraud',
  'Financial Fraud',
  'Export Control',
  'Sanctions',
  'Environment',
  'Consumer Protection',
  'Tax',
  'Procurement Fraud',
  'Labor & Employment',
  'Prescription Drugs',
  'Fair Housing',
  'Cybercrime',
])

const SETTLEMENT = /\b(agrees? to pay|pays?|to resolve|to settle|settles?|settlement|deferred prosecution|non-prosecution|consent decree)\b/i
const MERGER = /\b(merger|acquisition|divest\w*)\b/i
const COMPANY = /\b(Inc\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Compan(y|ies)|Co\.|Ltd\.?|L\.P\.|LLP|PLLC|Bank(?! fraud)|Holdings|Pharmaceuticals?|Health ?System|Laborator(y|ies))(?=\W|$)/i
const PERSON = /\b(sentenced|man|men|woman|women|owner|founder|executive|president|CEO|doctor|physician|nurse|employee|member|national|former|resident|felon|charged|indicted|arrested|extradited|convicts?|convicted|husband|wife|spouse|individuals?)\b/i

const names = (list: unknown): string[] =>
  Array.isArray(list) ? list.map(x => (x && typeof x === 'object' ? (x as { name?: unknown }).name : null)).filter((n): n is string => typeof n === 'string') : []

export const releaseTitle = (r: DojRelease) => decodeEntities(r.title).replace(/\s+/g, ' ').trim()

const isAntitrustDivision = (r: DojRelease) => names(r.component).some(n => /^Antitrust Division$/i.test(n))

export function keepRelease(r: DojRelease): boolean {
  const title = releaseTitle(r)
  const topical = names(r.topic).some(t => COMPANY_TOPICS.has(t)) || isAntitrustDivision(r)
  if (!topical) return false
  if (SETTLEMENT.test(title) || MERGER.test(title)) return true
  if (PERSON.test(title)) return false
  return COMPANY.test(title) || isAntitrustDivision(r) || names(r.topic).includes('Antitrust')
}

const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// The releases worth judging, newest first, each title once.
export function selectReleases(releases: DojRelease[]): DojRelease[] {
  const seen = new Set<string>()
  const kept: DojRelease[] = []
  for (const r of releases) {
    if (!r?.uuid || !r.title || !r.url || !keepRelease(r)) continue
    const key = titleKey(releaseTitle(r))
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(r)
  }
  return kept
}

// The release date. The API gives noon UTC of the release day.
export const releaseDate = (r: DojRelease): string | null => {
  const seconds = Number(r.date)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString().slice(0, 10) : null
}

// Enough of the release for the matcher (it reads 1,200 characters) and the
// impact summary, without storing whole attachments' worth of text.
const NARRATIVE_CHARS = 8000

export function releaseRow(r: DojRelease) {
  const title = releaseTitle(r)
  const narrative = decodeEntities(stripHtml(r.body ?? '')).slice(0, NARRATIVE_CHARS)
  const teaser = decodeEntities(stripHtml(r.teaser ?? '')).trim()
  const office = names(r.component)[0] ?? null
  return {
    source: 'doj_press' as const,
    category: 'enforcement' as const,
    external_id: r.uuid,
    title,
    agency: office ? `Department of Justice (${office})` : 'Department of Justice',
    jurisdiction: 'Federal',
    summary: teaser && teaser !== title ? teaser.slice(0, 600) : null,
    published_date: releaseDate(r),
    effective_date: null,
    source_url: r.url,
    raw: { release_number: r.number || null, topics: names(r.topic), office, narrative_text: narrative || null },
  }
}
