// The regulator feeds RegWay polls beyond the Federal Register (roadmap item
// 12, Phase 2): U.S. agencies' own announcements, which run days or weeks
// ahead of Federal Register publication, and the first non-U.S. sources (UK
// and EU). Each feed was fetched and read before it was added (2026-10-06,
// prompts/live-monitoring-phase-2.md); the ones that turned out dead or
// unusable are listed there.
//
// A feed is a news stream, not a rule list, so each one says which entries
// to keep. What survives is judged per firm by match-relevance like any
// Federal Register document. `regulatorySourcesFor` is the free pre-filter:
// a firm with no UK or EU connection is never shown (or billed for) UK or EU
// items.

import { countryOfLocation } from './countries.ts'
import { companyFootprint, firmFootprint } from './footprint.ts'
import type { FeedEntry } from './rss.ts'
import type { FirmEntities } from './relevance.ts'

export type Region = 'US' | 'UK' | 'EU'

export interface RegulatorFeed {
  // `regulations.source` (also names the feed in sync results).
  source: string
  url: string
  agency: string
  region: Region
  category: 'regulatory' | 'enforcement'
  keep: (entry: FeedEntry) => boolean
  // Where the publisher prefixes every title with an identifier.
  cleanTitle?: (title: string) => string
}

export const JURISDICTION: Record<Region, string> = { US: 'Federal', UK: 'United Kingdom', EU: 'European Union' }

// A rule, a proposal, guidance or relief: something that can change what a
// firm must do. Press feeds also carry speeches, events, appointments and
// enforcement cases (enforcement has its own sources).
const RULEMAKING = /\b(propos\w*|adopt\w*|finali[sz]\w*|final rules?|amend\w*|rules?|rulemaking|regulations?|guidance|exempt\w*|no-action|comment|consult\w*|interpret\w*|FAQs?|polic(y|ies) statement|supervisory statement|handbook|risk alert|compliance dates?|extends?|regime|requirements?|standards?|framework|advisory)\b/i
const NOT_RULEMAKING = /\b(charges?|charged|sues?|sued|settles?|settled|obtains?|judgments?|redress|refunds?|fined|fines|bans?|banned|sentenced|convicted|indict\w*|court orders?|penalt(y|ies)|censures?|censured|bankruptcy|appoint\w*|speech|remarks|seminar|webinar|roundtable|conference|annual report|minutes)\b/i
const rulemaking = (e: FeedEntry) => RULEMAKING.test(e.title) && !NOT_RULEMAKING.test(e.title)

// Statutory instruments on subjects a private-equity firm or its portfolio
// companies can be bound by. The feed is every instrument made in the UK:
// most are flight restrictions, road orders and electoral changes.
const UK_BUSINESS_LAW = /\b(financial|markets?|money laundering|economic crime|compan(y|ies)|partnerships?|data protection|employment|tax(es|ation)?|insolvency|competition|consumer|pensions?|investment|securit(y|ies)|bank(s|ing)?|insurance|payments?|audit|export|trade|customs|medic(al|ines)|health|energy|environment\w*|batteries|product safety|online safety|digital|procurement|subsid(y|ies)|payroll|minimum wage|corporate|limited liability)\b/i
// Sanctions instruments are geopolitical measures, matched by country, not
// regulatory ones: left to the geopolitical sources (roadmap item 13).
const SANCTIONS = /\b(sanctions?|restrictive measures)\b/i

// EUR-Lex prefixes every title with "CELEX:32026R2202: ".
const withoutCelex = (title: string) => title.replace(/^CELEX:\S+:\s*/, '')
const isEuAct = (e: FeedEntry, kinds: RegExp) => kinds.test(withoutCelex(e.title)) && !SANCTIONS.test(e.title) && !/^CELEX:\S+$/.test(e.title.trim())

export const REGULATOR_FEEDS: RegulatorFeed[] = [
  {
    source: 'sec_news',
    url: 'https://www.sec.gov/news/pressreleases.rss',
    agency: 'Securities and Exchange Commission (SEC)',
    region: 'US',
    category: 'regulatory',
    keep: rulemaking,
  },
  // Not here: the CFTC's two feeds (cftc.gov/RSS/RSSGP and RSSENF). They
  // read fine from a desktop but answer 403 to every request from the edge
  // functions' cloud addresses. CFTC rules still arrive through the Federal
  // Register.
  {
    source: 'ftc_news',
    url: 'https://www.ftc.gov/feeds/press-release.xml',
    agency: 'Federal Trade Commission (FTC)',
    region: 'US',
    category: 'regulatory',
    keep: rulemaking,
  },
  {
    source: 'cfpb_news',
    url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/',
    agency: 'Consumer Financial Protection Bureau (CFPB)',
    region: 'US',
    category: 'regulatory',
    keep: rulemaking,
  },
  {
    // The FCA's publications feed, not its news feed (press, speeches,
    // warnings): consultation papers (CP), policy statements (PS), guidance
    // consultations (GC), finalised guidance (FG) and Dear CEO letters.
    source: 'fca_publications',
    url: 'https://www.fca.org.uk/publications/rss.xml',
    agency: 'Financial Conduct Authority (FCA)',
    region: 'UK',
    category: 'regulatory',
    keep: e => /^(CP|PS|GC|FG)\d+\/\d+\b/.test(e.title) || /\bdear (CEO|chair)\b/i.test(e.title),
  },
  {
    source: 'pra_publications',
    url: 'https://www.bankofengland.co.uk/rss/prudential-regulation-publications',
    agency: 'Prudential Regulation Authority (PRA)',
    region: 'UK',
    category: 'regulatory',
    keep: e => /\b(policy statement|consultation paper|supervisory statement|statement of policy|[PC]S\d+\/\d+|SS\d+\/\d+|rules?|amendments?)\b/i.test(e.title) && !/\b(digest|roundtable|speech)\b/i.test(e.title),
  },
  {
    source: 'uk_legislation',
    url: 'https://www.legislation.gov.uk/new/uksi/data.feed',
    agency: 'UK Parliament (statutory instruments)',
    region: 'UK',
    category: 'regulatory',
    keep: e => UK_BUSINESS_LAW.test(e.title) && !SANCTIONS.test(e.title) && !/\b(correction slip|air navigation|electoral changes|development consent)\b/i.test(e.title),
  },
  {
    source: 'esma_news',
    url: 'https://www.esma.europa.eu/rss.xml',
    agency: 'European Securities and Markets Authority (ESMA)',
    region: 'EU',
    category: 'regulatory',
    keep: rulemaking,
  },
  {
    // Regulations and directives of the Parliament and the Council.
    source: 'eur_lex',
    url: 'https://eur-lex.europa.eu/EN/display-feed.rss?rssId=162',
    agency: 'European Parliament and Council',
    region: 'EU',
    category: 'regulatory',
    keep: e => isEuAct(e, /^(Regulation|Directive) \((EU|EU, Euratom)\)/),
    cleanTitle: withoutCelex,
  },
  {
    // The Commission's delegated acts (where the technical standards for
    // financial-services law are made). Its implementing acts, the bulk of
    // the Official Journal, are product authorisations and farm-market
    // measures and are left out.
    source: 'eur_lex',
    url: 'https://eur-lex.europa.eu/EN/display-feed.rss?rssId=222',
    agency: 'European Commission',
    region: 'EU',
    category: 'regulatory',
    keep: e => isEuAct(e, /^Commission Delegated (Regulation|Directive)/),
    cleanTitle: withoutCelex,
  },
]

export const sourcesIn = (region: Region, category: RegulatorFeed['category'] = 'regulatory'): string[] => [
  ...new Set(REGULATOR_FEEDS.filter(f => f.region === region && f.category === category).map(f => f.source)),
]

const EU_MEMBERS = new Set([
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
])

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])

// Which regions a firm is connected to, from what it recorded: where the
// firm, its funds and its companies are, and the geographies it invests in.
// Every firm is treated as U.S.-connected (the product's home market).
export function regionsOf(entities: FirmEntities): Region[] {
  const { firm, funds, companies } = entities
  const countries = new Set<string>()
  const named = new Set<string>()
  const place = (value: unknown) => {
    if (typeof value !== 'string') return
    named.add(value.trim().toLowerCase())
    const country = countryOfLocation(value)
    if (country) countries.add(country)
  }
  if (firm) {
    for (const fact of firmFootprint(firm).facts) countries.add(fact.country)
    for (const value of [...asList(firm.profile?.geographies), ...(firm.jurisdictions ?? [])]) place(value)
  }
  for (const fund of funds ?? []) for (const value of fund.jurisdictions ?? []) place(value)
  for (const company of companies ?? []) for (const fact of companyFootprint(company).facts) countries.add(fact.country)

  // "Europe" covers both; "Global" / "International" everything.
  const everywhere = ['global', 'international', 'worldwide'].some(n => named.has(n))
  const europe = everywhere || named.has('europe') || named.has('emea')
  const regions: Region[] = ['US']
  if (europe || countries.has('United Kingdom')) regions.push('UK')
  if (europe || named.has('european union') || [...countries].some(c => EU_MEMBERS.has(c))) regions.push('EU')
  return regions
}

// The `regulations.source` values whose regulatory items a firm's matcher
// reads: the Federal Register plus the feeds of each region it's connected to.
export const regulatorySourcesFor = (entities: FirmEntities): string[] => ['federal_register', ...regionsOf(entities).flatMap(region => sourcesIn(region))]
