// Duplicate coverage (roadmap item 15): the same development often reaches
// `regulations` more than once. An SEC proposal arrives as the agency's
// announcement and, days later, as the Federal Register document; the EU
// publishes one sanctions action as a Decision and a Regulation; a company
// scan finds a rule the Federal Register sync already stored.
//
// A later version points at the first one through `regulations.duplicate_of`
// (one level only: the first version never points anywhere). Nothing is
// merged or deleted. Each version is still judged per firm; the lists show
// the first version as the card and the others as "also published as" links
// (src/lib/duplicates.ts). The exception is shown there too: once the
// official document for an announcement is matched, the document is the
// card and the announcement its link. The pointer still runs from the
// document to the announcement, since one announcement can cover several.
//
// Three rules need no AI: they compare identifiers the publishers put in the
// title or the link. The fourth, announcement to Federal Register document,
// has nothing to compare (the titles differ), so one small model call per
// new document asks which of the agency's recent announcements, if any,
// announced it.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { callClaude, toolInput } from './ai/client.ts'
import { MODEL_FOR } from './ai/models.ts'

const MODEL = MODEL_FOR.announcementMatch
const FUNCTION_NAME = 'group-duplicates'

// Two versions of one act (EU Decision and Regulation, two parts of one FCA
// bulletin) are published within days of each other.
export const PAIR_DAYS = 7
// An agency's announcement runs ahead of the Federal Register by days or
// weeks; a few documents are published just before their press release.
export const ANNOUNCEMENT_LEAD_DAYS = 60
export const ANNOUNCEMENT_LAG_DAYS = 3
// A scan dates a rule by when it was announced or last changed, so its date
// can be months from the Federal Register's; a same-titled document further
// away than this is more likely an earlier stage of the rulemaking.
const SCAN_TITLE_DAYS = 120
const SUMMARY_CHARS = 900
// A press release names every rule in its package only in the body, well
// past what the feed gives as its summary.
export const ANNOUNCEMENT_CHARS = 3000
const ANCHOR_CHARS = 60
const MIN_TITLE_CHARS = 12

export interface Version {
  id: string
  source: string
  title: string
  agency: string | null
  summary: string | null
  published_date: string | null
  source_url: string
  duplicate_of: string | null
  created_at: string
}

export const VERSION_COLUMNS = 'id, source, title, agency, summary, published_date, source_url, duplicate_of, created_at'

// Feeds whose agency publishes the official document in the Federal
// Register afterwards, with that agency's name there.
export const ANNOUNCING_AGENCIES: Record<string, string> = {
  sec_news: 'Securities and Exchange Commission',
  ftc_news: 'Federal Trade Commission',
  cfpb_news: 'Consumer Financial Protection Bureau',
}

// Feeds where one publication can be listed twice under different
// reference numbers (FCA: "GC26/6: Primary Market Bulletin No. 66" and
// "FG26/8: Primary Market Bulletin No. 66").
export const SAME_TITLE_SOURCES = ['fca_publications', 'pra_publications', 'esma_news', 'uk_legislation', 'uk_sanctions', 'ofsi', 'sec_news', 'ftc_news', 'cfpb_news']

const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

const normalised = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()

// "Council Implementing Regulation (EU) 2026/2191 of 28 September 2026
// implementing Regulation (EC) No 1183/2005 concerning restrictive measures
// in view of the situation in the Democratic Republic of the Congo": the
// date of the act and the regime it concerns are the same on the Decision
// published with it.
export function sanctionsActKey(title: string): string | null {
  const match = title.match(/ of (\d{1,2} \w+ \d{4}) .*?concerning (restrictive measures.+)$/i)
  return match ? `${match[1]}|${normalised(match[2])}` : null
}

const instrument = (title: string): 'regulation' | 'decision' | null =>
  /^Council (Implementing )?Regulation\b/i.test(title) ? 'regulation' : /^Council (Implementing )?Decision\b/i.test(title) ? 'decision' : null

// The title without the publisher's reference number in front of it.
export function titleKey(title: string): string | null {
  const key = normalised(title.replace(/^[A-Z]{1,4}\d{1,4}\/\d{1,4}:\s*/, ''))
  return key.length >= MIN_TITLE_CHARS ? key : null
}

// A Federal Register document number inside a link to federalregister.gov
// or govinfo.gov, e.g. ".../documents/2026/10/06/2026-20466/adviser-and-…".
export function federalRegisterNumber(url: string): string | null {
  if (!/federalregister\.gov|govinfo\.gov/i.test(url)) return null
  return url.match(/\b(20\d{2}-\d{5})\b/)?.[1] ?? null
}

export interface Link {
  secondary: string
  primary: string
}

// EU sanctions: a Decision and a Regulation with the same act date and
// regime are one action. Only an unambiguous pair is linked; two actions on
// one regime on one day (four instruments) are left as they are. The
// Regulation is the card: it is the one that binds businesses directly.
export function sanctionsPairs(rows: Version[]): Link[] {
  const groups = new Map<string, Version[]>()
  for (const row of rows) {
    const key = sanctionsActKey(row.title)
    if (key && instrument(row.title)) groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const links: Link[] = []
  for (const group of groups.values()) {
    if (group.length !== 2) continue
    const regulation = group.find(r => instrument(r.title) === 'regulation')
    const decision = group.find(r => instrument(r.title) === 'decision')
    if (regulation && decision && near(regulation, decision, PAIR_DAYS)) links.push({ secondary: decision.id, primary: regulation.id })
  }
  return links
}

const near = (a: Version, b: Version, days: number) => !!a.published_date && !!b.published_date && daysBetween(a.published_date, b.published_date) <= days

const firstPublished = (a: Version, b: Version) => (a.published_date ?? '').localeCompare(b.published_date ?? '') || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

// Same source, same title once the reference number is dropped, published
// within days: the first one is the card.
export function sameTitleGroups(rows: Version[]): Link[] {
  const groups = new Map<string, Version[]>()
  for (const row of rows) {
    const key = titleKey(row.title)
    if (key) groups.set(`${row.source}|${key}`, [...(groups.get(`${row.source}|${key}`) ?? []), row])
  }
  const links: Link[] = []
  for (const group of groups.values()) {
    const [first, ...later] = [...group].sort(firstPublished)
    for (const row of later) if (near(first, row, PAIR_DAYS)) links.push({ secondary: row.id, primary: first.id })
  }
  return links
}

// A company scan's result that is a Federal Register document RegWay already
// holds: the link carries its document number, or the title is the same as
// exactly one document's. The Federal Register row is the card (it is the
// document itself; the scan's row is a pointer to it).
export function scanResultLinks(scanned: Version[], federalRegister: (Version & { external_id: string })[]): Link[] {
  const byNumber = new Map(federalRegister.map(d => [d.external_id, d]))
  const byTitle = new Map<string, Version[]>()
  for (const doc of federalRegister) byTitle.set(normalised(doc.title), [...(byTitle.get(normalised(doc.title)) ?? []), doc])

  const links: Link[] = []
  for (const row of scanned) {
    const number = federalRegisterNumber(row.source_url)
    const sameTitle = byTitle.get(normalised(row.title)) ?? []
    const titled = normalised(row.title).length >= MIN_TITLE_CHARS && sameTitle.length === 1 && (!row.published_date || near(row, sameTitle[0], SCAN_TITLE_DAYS)) ? sameTitle[0] : undefined
    const doc = (number && byNumber.get(number)) || titled
    if (doc) links.push({ secondary: row.id, primary: doc.id })
  }
  return links
}

// The announcements that could have announced this document: the same
// agency's, from up to 60 days before it to a few days after.
export function announcementsFor(document: Version, announcements: Version[]): Version[] {
  if (!document.published_date) return []
  const published = Date.parse(document.published_date)
  return announcements.filter(a => {
    if (ANNOUNCING_AGENCIES[a.source] !== document.agency || !a.published_date) return false
    const days = (published - Date.parse(a.published_date)) / 86_400_000
    return days <= ANNOUNCEMENT_LEAD_DAYS && days >= -ANNOUNCEMENT_LAG_DAYS
  })
}

// The body of a press release, from its page's text: from where the feed's
// summary (the release's opening words) starts, so the site's navigation is
// left out. Empty when the opening can't be found; the summary is used then.
export function announcementBody(pageText: string, announcement: Pick<Version, 'summary' | 'title'>): string {
  for (const anchor of [announcement.summary, announcement.title]) {
    const start = anchor ? pageText.indexOf(anchor.slice(0, ANCHOR_CHARS)) : -1
    if (start >= 0) return pageText.slice(start, start + ANNOUNCEMENT_CHARS)
  }
  return ''
}

// Notices of exchanges' and FINRA's own rule filings: the SEC never
// announces these in a press release.
export const neverAnnounced = (document: Version) => /^Self-Regulatory Organizations\b/i.test(document.title)

const INSTRUCTIONS = `A U.S. regulator announces a rulemaking in a press release and publishes the official document in the Federal Register days or weeks later, usually under a different, more technical title.

Below is one Federal Register document, then the same agency's recent press releases, numbered from 1.

Decide which press release, if any, announced this exact document: the same rule, proposal, order, exemption or request for comment. One press release can announce a package of several documents voted on together, each described in a sentence or a bullet of its text, so it is fine if other documents belong to the same press release. A press release about the same general subject that announces a different action is not a match. Most documents were never announced in a press release: if none clearly announced this one, answer 0.`

// Which of `announcements` announced `document`: its index, or null. One
// model call; the caller has already checked there is something to compare.
// `bodies`: each press release's fuller text by id, where it could be read.
export async function matchAnnouncement(admin: SupabaseClient, document: Version, announcements: Version[], bodies: Map<string, string> = new Map()): Promise<number | null> {
  const result = await callClaude({
    model: MODEL,
    max_tokens: 400,
    // A yes/no link, not prose: the same pair must get the same answer.
    temperature: 0,
    tool_choice: { type: 'tool', name: 'submit_match' },
    tools: [
      {
        name: 'submit_match',
        description: 'Say which press release announced the Federal Register document.',
        input_schema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'One sentence: what the document does and what the chosen press release announced, or why none fits.' },
            press_release: { type: 'integer', description: 'The number of the press release that announced this document, or 0 if none did.' },
          },
          required: ['reason', 'press_release'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${INSTRUCTIONS}

FEDERAL REGISTER DOCUMENT (${document.agency ?? 'agency n/a'}, published ${document.published_date ?? 'n/a'})
Title: ${document.title}
Summary: ${(document.summary ?? 'none').slice(0, SUMMARY_CHARS)}

PRESS RELEASES
${announcements.map((a, i) => `${i + 1}. [${a.published_date ?? 'date n/a'}] ${a.title}\n   ${bodies.get(a.id) || (a.summary ?? 'no summary').slice(0, SUMMARY_CHARS)}`).join('\n')}`,
      },
    ],
  }, { usage: { admin, functionName: FUNCTION_NAME } })
  const chosen = Number(toolInput<{ press_release?: number }>(result, 'submit_match')?.press_release)
  return Number.isInteger(chosen) && chosen >= 1 && chosen <= announcements.length ? chosen - 1 : null
}

// Points `secondary` at `primary` (or at whatever `primary` itself points
// at), and brings along anything that pointed at `secondary`, so links stay
// one level deep. Returns false when nothing changed.
export async function linkDuplicate(admin: SupabaseClient, link: Link): Promise<boolean> {
  if (link.secondary === link.primary) return false
  const { data: rows, error } = await admin.from('regulations').select('id, duplicate_of').in('id', [link.secondary, link.primary])
  if (error) throw error
  const primary = (rows ?? []).find(r => r.id === link.primary)
  const secondary = (rows ?? []).find(r => r.id === link.secondary)
  if (!primary || !secondary) return false

  const root = (primary.duplicate_of as string | null) ?? link.primary
  if (root === link.secondary || secondary.duplicate_of === root) return false

  const { error: pointError } = await admin.from('regulations').update({ duplicate_of: root }).eq('id', link.secondary)
  if (pointError) throw pointError
  const { error: followError } = await admin.from('regulations').update({ duplicate_of: root }).eq('duplicate_of', link.secondary)
  if (followError) throw followError
  return true
}

// Of `regulationIds`, the ones that still need their own analysis for this
// firm: a later version whose first version is already matched to the firm
// is shown under that one, so its analysis is only written if someone opens
// it on a page where it stands alone (the on-demand path).
//
// Not so for the official document that follows an agency's announcement:
// it takes the announcement's place as the card (roadmap 16b.1), and its
// analysis, written from the official text, is the one people read.
export async function withoutCoveredDuplicates(admin: SupabaseClient, firmId: string, regulationIds: string[]): Promise<string[]> {
  if (regulationIds.length === 0) return regulationIds
  const { data: versions, error } = await admin.from('regulations').select('id, source, duplicate_of').in('id', regulationIds).not('duplicate_of', 'is', null)
  if (error || !versions?.length) return regulationIds

  const firstIds = [...new Set(versions.map(v => v.duplicate_of as string))]
  const [{ data: matched, error: matchedError }, { data: firsts }] = await Promise.all([
    admin.from('regulation_relevance').select('regulation_id').eq('firm_id', firmId).in('regulation_id', firstIds).not('relevance_reason', 'like', 'NOT_RELEVANT:%'),
    admin.from('regulations').select('id, source').in('id', firstIds),
  ])
  if (matchedError || !matched?.length) return regulationIds

  const announcements = new Set((firsts ?? []).filter(f => f.source in ANNOUNCING_AGENCIES).map(f => f.id))
  const supersedes = (v: { source: string; duplicate_of: string }) => v.source === 'federal_register' && announcements.has(v.duplicate_of)
  const matchedFirst = new Set(matched.map(m => m.regulation_id))
  const covered = new Set(versions.filter(v => matchedFirst.has(v.duplicate_of) && !supersedes(v)).map(v => v.id))
  return regulationIds.filter(id => !covered.has(id))
}
