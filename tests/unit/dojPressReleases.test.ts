import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeClient, setClient } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { SERVICE_KEY } from './helpers/setup'
import { keepRelease, releaseDate, releaseRow, selectReleases, type DojRelease } from '../../supabase/functions/_shared/doj'

// Real releases from the DOJ API (16–21 Nov 2026), bodies shortened.
const RELEASES: DojRelease[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/doj-press-releases.json'), 'utf8'))
const byTitle = (part: string) => RELEASES.find(r => r.title.includes(part))!

const release = (title: string, topics: string[], office = 'USAO - New York, Southern'): DojRelease => ({
  uuid: title,
  title,
  url: `https://www.justice.gov/pr/${encodeURIComponent(title)}`,
  date: '1795262400',
  topic: topics.map(name => ({ name })),
  component: [{ name: office }],
})

describe('DOJ press releases: which are kept', () => {
  it('keeps settlements, company pleas, merger decisions and contractor settlements', () => {
    for (const part of ['InnovAge Agrees to Pay', 'Blue Ocean International Bank', 'NextEra', 'Three Government Contractors', 'Adelphi Technology']) {
      expect(keepRelease(byTitle(part)), part).toBe(true)
    }
  })

  it('drops cases against people, even on a company topic', () => {
    for (const part of ['Moving Company Sentenced', 'Robinhood Employee', 'Pharmacy Owner', 'bank fraud scheme', 'Ransomware']) {
      expect(keepRelease(byTitle(part)), part).toBe(false)
    }
  })

  it('drops topics that are never about companies, and office round-ups', () => {
    expect(keepRelease(byTitle('Sinaloa Cartel'))).toBe(false)
    expect(keepRelease(byTitle('Collection and Enforcement Efforts'))).toBe(false)
    expect(keepRelease(release('Acme Corp. Agrees to Pay $5M', ['Drug Trafficking']))).toBe(false)
  })

  it('keeps an Antitrust Division release whatever its topic', () => {
    expect(keepRelease(release('Justice Department Requires Divestiture in Grocery Deal', [], 'Antitrust Division'))).toBe(true)
    expect(keepRelease(release('Former Executive Sentenced for Bid Rigging', [], 'Antitrust Division'))).toBe(false)
  })

  it('does not read "bank fraud" as a bank', () => {
    expect(keepRelease(release('Dallas Tax Preparer Admits Bank Fraud', ['Financial Fraud']))).toBe(false)
    expect(keepRelease(release('First Coast Bank Admits Bank Secrecy Act Failures', ['Financial Fraud']))).toBe(true)
  })
})

describe('DOJ press releases: the batch', () => {
  it('keeps the same release posted by two offices once', () => {
    const innovAge = RELEASES.filter(r => r.title.includes('InnovAge'))
    expect(innovAge.length).toBe(2)
    const kept = selectReleases(RELEASES)
    expect(kept.filter(r => r.title.includes('InnovAge'))).toHaveLength(1)
    expect(kept.map(r => r.title.slice(0, 20))).toEqual([
      'Blue Ocean Internati',
      'Justice Department’s',
      'PACE Organization In',
      'Three Government Con',
      'Adelphi Technology, ',
    ])
  })

  it('reads a release with no topics, which the API sends as ""', () => {
    const noTopic = { ...release('Acme Corp. Agrees to Pay $5M', []), topic: '' }
    expect(keepRelease(noTopic)).toBe(false)
    expect(keepRelease({ ...noTopic, component: [{ name: 'Antitrust Division' }] })).toBe(true)
    expect(releaseRow({ ...noTopic, component: '' }).agency).toBe('Department of Justice')
  })

  it('skips malformed items instead of failing the sync', () => {
    const broken = [{ title: 'Acme Corp. Agrees to Pay' } as DojRelease, null as unknown as DojRelease]
    expect(selectReleases(broken)).toEqual([])
  })
})

describe('DOJ press releases: the stored row', () => {
  it('is an enforcement item with the office, topics and plain text', () => {
    const row = releaseRow(byTitle('Adelphi Technology'))
    expect(row).toMatchObject({
      source: 'doj_press',
      category: 'enforcement',
      external_id: byTitle('Adelphi Technology').uuid,
      agency: 'Department of Justice (USAO - Kentucky, Western)',
      jurisdiction: 'Federal',
      published_date: '2026-11-16',
      effective_date: null,
      source_url: byTitle('Adelphi Technology').url,
    })
    expect(row.raw.topics).toContain('False Claims Act')
    expect(row.raw.narrative_text).not.toMatch(/<[a-z]/i)
    expect(row.raw.narrative_text).not.toMatch(/&(nbsp|amp|#\d+);/)
  })

  it('decodes entities in the title', () => {
    const row = releaseRow(release('Smith &amp; Sons LLC Agrees to Pay', ['Tax']))
    expect(row.title).toBe('Smith & Sons LLC Agrees to Pay')
  })

  it('gives no date rather than a wrong one', () => {
    expect(releaseDate({ ...release('x', []), date: '' })).toBeNull()
    expect(releaseDate({ ...release('x', []), date: 'soon' })).toBeNull()
  })
})

describe('sync-doj-press-releases', () => {
  async function sync(opts: { known?: string[]; status?: number } = {}) {
    const db = fakeClient(q => {
      if (q.table === 'regulations' && q.op === 'select') return { data: (opts.known ?? []).map(external_id => ({ external_id })) }
    })
    setClient(db)
    const { handler } = await loadHandler('sync-doj-press-releases')
    const fetched = stubFetch(url => {
      if (url.hostname !== 'www.justice.gov') return undefined
      if (opts.status) return new Response('blocked', { status: opts.status })
      return jsonResponse({ results: url.searchParams.get('page') === '0' ? RELEASES : [] })
    })
    const res = await handler(post('sync-doj-press-releases', { token: SERVICE_KEY }))
    const rows = db.ran('regulations', 'upsert').flatMap(u => u.payload as { external_id: string; source: string }[])
    return { res, body: await res.json(), db, rows, fetched }
  }

  it('reads two pages and stores the kept releases not already stored', async () => {
    const known = byTitle('Blue Ocean').uuid
    const { body, rows, fetched, db } = await sync({ known: [known] })
    expect(fetched.map(c => c.url.searchParams.get('page'))).toEqual(['0', '1'])
    expect(body).toEqual({ fetched: RELEASES.length, kept: 5, new: 4 })
    expect(rows.map(r => r.external_id)).not.toContain(known)
    expect(rows.every(r => r.source === 'doj_press')).toBe(true)
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ source: 'doj_press', ok: true })
  })

  it('records a failure when the API refuses', async () => {
    const { res, rows, db } = await sync({ status: 403 })
    expect(res.status).toBe(500)
    expect(rows).toEqual([])
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ source: 'doj_press', ok: false })
  })
})
