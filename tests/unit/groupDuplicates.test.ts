import { describe, expect, it } from 'vitest'
import { fakeClient, hasFilter, setClient, type Query, type Resolver } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { promptText, stubModel } from './helpers/firm'
import { SERVICE_KEY } from './helpers/setup'

const today = new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  source: 'federal_register',
  title: id,
  agency: 'Securities and Exchange Commission',
  summary: null,
  published_date: today,
  source_url: `https://example.test/${id}`,
  duplicate_of: null,
  created_at: '2026-10-06T12:00:00Z',
  ...over,
})

const ANNOUNCEMENT = row('news', { source: 'sec_news', title: 'SEC Proposal Would Address How Advisers Can Custody Crypto Assets', published_date: daysAgo(5) })
const DOCUMENT = row('doc', { title: 'Adviser and Regulated Fund Custody Rules; Crypto Custody Rules', summary: 'The Commission is proposing new custody rules.' })
const DECISION = row('eu-d', { source: 'eu_sanctions', title: 'Council Decision (CFSP) 2026/2192 of 28 September 2026 amending Decision (CFSP) 2024/1484 concerning restrictive measures in view of the situation in Russia' })
const REGULATION = row('eu-r', { source: 'eu_sanctions', title: 'Council Implementing Regulation (EU) 2026/2193 of 28 September 2026 implementing Regulation (EU) 2024/1485 concerning restrictive measures in view of the situation in Russia' })
const SCAN = row('scan', { source: 'ai_search', title: 'Crypto custody proposal', source_url: 'https://www.federalregister.gov/documents/2026/10/06/2026-20466/adviser-custody', published_date: null })

interface State {
  // Rows group-duplicates hasn't looked at yet, by kind.
  feeds?: unknown[]
  scans?: unknown[]
  documents?: unknown[]
  // Everything already stored that they can be compared with.
  stored?: Record<string, unknown>[]
}

const filter = (q: Query, name: string, column: string) => q.filters.find(f => f[0] === name && f[1] === column)
const unchecked = (q: Query) => hasFilter(q, 'is', 'duplicates_checked_at', null)

function database(state: State): Resolver {
  const stored = state.stored ?? []
  return q => {
    if (q.table !== 'regulations' || q.op !== 'select') return
    if (q.columns === 'id, duplicate_of') return { data: stored.filter(r => (filter(q, 'in', 'id')![2] as string[]).includes(r.id as string)) }
    if (unchecked(q) && hasFilter(q, 'eq', 'source', 'ai_search')) return { data: state.scans ?? [] }
    if (unchecked(q) && hasFilter(q, 'eq', 'source', 'federal_register')) return { data: state.documents ?? [] }
    if (unchecked(q)) return { data: state.feeds ?? [] }
    if (hasFilter(q, 'eq', 'source', 'federal_register')) return { data: stored.filter(r => r.source === 'federal_register').map(r => ({ ...r, external_id: '2026-20466' })) }
    const sources = filter(q, 'in', 'source')?.[2] as string[] | undefined
    return { data: stored.filter(r => sources?.includes(r.source as string)) }
  }
}

async function run(state: State, body: unknown = {}) {
  const db = fakeClient(database(state))
  setClient(db)
  const { handler, background } = await loadHandler('group-duplicates')
  const res = await handler(post('group-duplicates', { token: SERVICE_KEY, body }))
  await Promise.all(background)
  const updates = db.ran('regulations', 'update')
  return {
    res,
    db,
    links: updates.filter(u => (u.payload as { duplicate_of?: string }).duplicate_of && filter(u, 'eq', 'id')).map(u => `${filter(u, 'eq', 'id')![2]} -> ${(u.payload as { duplicate_of: string }).duplicate_of}`),
    checked: updates.filter(u => (u.payload as { duplicates_checked_at?: string }).duplicates_checked_at).flatMap(u => filter(u, 'in', 'id')![2] as string[]),
    recorded: db.ran('sync_runs', 'insert').map(q => q.payload as { source: string; ok: boolean; detail: string; stats: { backlog: boolean } }),
  }
}

describe('group-duplicates', () => {
  it('refuses anything but the service key (one rule spends AI money)', async () => {
    const { handler } = await loadHandler('group-duplicates')
    const calls = stubFetch(() => undefined)
    expect((await handler(post('group-duplicates'))).status).toBe(401)
    expect((await handler(post('group-duplicates', { token: 'test-anon-key' }))).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('does nothing, calls no model and leaves no record when there is nothing new', async () => {
    const calls = stubFetch(() => undefined)
    const { res, db, recorded } = await run({})
    expect(res.status).toBe(202)
    expect(calls).toEqual([])
    expect(db.ran('regulations', 'update')).toEqual([])
    expect(recorded).toEqual([])
  })

  it('looks only at rows it has not checked, from the last 90 days', async () => {
    stubFetch(() => undefined)
    const { db } = await run({})
    const [feeds, scans, documents] = [0, 1, 2].map(i => db.ran('regulations', 'select')[i])
    for (const q of [feeds, scans, documents]) expect(unchecked(q)).toBe(true)
    expect(hasFilter(feeds, 'gte', 'published_date', daysAgo(90))).toBe(true)
    // Federal Register documents only from agencies whose announcements RegWay reads.
    expect(filter(documents, 'in', 'agency')![2]).toEqual(['Securities and Exchange Commission', 'Federal Trade Commission', 'Consumer Financial Protection Bureau'])
    expect(hasFilter(documents, 'is', 'duplicate_of', null)).toBe(true)
  })

  it('links an EU Decision to its Regulation and a scan result to its Federal Register document without any AI call', async () => {
    const calls = stubFetch(() => undefined)
    const { links, checked, recorded } = await run({ feeds: [DECISION, REGULATION], scans: [SCAN], stored: [DECISION, REGULATION, SCAN, DOCUMENT] })
    expect(calls).toEqual([])
    expect(links).toEqual(['eu-d -> eu-r', 'scan -> doc'])
    expect(checked.sort()).toEqual(['eu-d', 'eu-r', 'scan'])
    expect(recorded).toMatchObject([{ source: 'duplicates', ok: true, detail: '3 checked, 2 linked, 0 AI calls' }])
  })

  it("asks the model about a new document only when its agency has a recent announcement, and links it under that announcement", async () => {
    const { model } = stubModel({ submit_match: { reason: 'Same proposal.', press_release: 1 } })
    const sro = row('sro', { title: 'Self-Regulatory Organizations; FINRA; Notice of Filing of a Proposed Rule Change' })
    const ftc = row('ftc-doc', { agency: 'Federal Trade Commission' })
    const { links, checked } = await run({ documents: [DOCUMENT, sro, ftc], stored: [ANNOUNCEMENT, DOCUMENT] })

    expect(model).toHaveLength(1)
    expect(promptText(model[0])).toContain('Title: Adviser and Regulated Fund Custody Rules; Crypto Custody Rules')
    expect(links).toEqual(['doc -> news'])
    // The two with nothing to compare against are done too: no call, no re-check.
    expect(checked.sort()).toEqual(['doc', 'ftc-doc', 'sro'])
  })

  it("reads the press release's page once however many documents are compared with it", async () => {
    const pages: string[] = []
    const release = { ...ANNOUNCEMENT, summary: 'The SEC today proposed', source_url: 'https://www.sec.test/press/2026-100' }
    const { model } = stubModel({ submit_match: { reason: 'x', press_release: 1 } }, url => {
      pages.push(url.href)
      return new Response(`<html><nav>Menu</nav><p>The SEC today proposed custody rules and recordkeeping amendments. ${'Detail. '.repeat(80)}</p></html>`)
    })
    await run({ documents: [DOCUMENT, row('doc-2', { title: 'Custody Recordkeeping Amendments' })], stored: [release] })
    expect(pages).toEqual(['https://www.sec.test/press/2026-100'])
    expect(model).toHaveLength(2)
    for (const call of model) expect(promptText(call)).toContain('The SEC today proposed custody rules and recordkeeping amendments.')
    expect(promptText(model[0])).not.toContain('Menu')
  })

  it('links nothing when the model says no announcement fits', async () => {
    stubModel({ submit_match: { reason: 'Different subject.', press_release: 0 } })
    const { links, checked } = await run({ documents: [DOCUMENT], stored: [ANNOUNCEMENT, DOCUMENT] })
    expect(links).toEqual([])
    expect(checked).toEqual(['doc'])
  })

  it('re-opens documents published around a new announcement, which were compared before it existed', async () => {
    stubFetch(() => undefined)
    const { db } = await run({ feeds: [ANNOUNCEMENT], stored: [ANNOUNCEMENT] })
    const reopen = db.ran('regulations', 'update').find(u => (u.payload as Record<string, unknown>).duplicates_checked_at === null)!
    expect(hasFilter(reopen, 'eq', 'agency', 'Securities and Exchange Commission')).toBe(true)
    expect(hasFilter(reopen, 'is', 'duplicate_of', null)).toBe(true)
    expect(hasFilter(reopen, 'gte', 'published_date', daysAgo(8))).toBe(true)
    expect(hasFilter(reopen, 'lte', 'published_date', new Date(Date.parse(daysAgo(5)) + 60 * 86_400_000).toISOString().slice(0, 10))).toBe(true)
  })

  it('leaves a document unchecked when the AI provider refuses the call, so the next run retries it, and records the failure', async () => {
    stubModel({ submit_match: () => jsonResponse({ error: { message: 'credit balance is too low' } }, 400) })
    const { links, checked, recorded } = await run({ feeds: [DECISION, REGULATION], documents: [DOCUMENT], stored: [ANNOUNCEMENT, DECISION, REGULATION, DOCUMENT] })
    // The rules that need no AI still ran.
    expect(links).toEqual(['eu-d -> eu-r'])
    expect(checked.sort()).toEqual(['eu-d', 'eu-r'])
    expect(recorded).toHaveLength(1)
    expect(recorded[0].ok).toBe(false)
    expect(recorded[0].detail).toContain('credit balance is too low')
    expect(recorded[0].stats.backlog).toBe(true)
  })

  it("makes a read once more when the database refuses a new function's first query", async () => {
    stubFetch(() => undefined)
    let refused = false
    const answers = database({ feeds: [DECISION, REGULATION], stored: [DECISION, REGULATION] })
    const db = fakeClient(q => {
      if (q.table === 'regulations' && q.op === 'select' && !refused) {
        refused = true
        return { error: { message: 'JWT issued at future' } }
      }
      return answers(q)
    })
    setClient(db)
    const { handler, background } = await loadHandler('group-duplicates')
    await handler(post('group-duplicates', { token: SERVICE_KEY }))
    await Promise.all(background)
    expect(db.ran('sync_runs', 'insert').map(q => q.payload)).toMatchObject([{ ok: true, detail: '2 checked, 1 linked, 0 AI calls' }])
  })

  it('a dry run reports the links with both titles and writes nothing', async () => {
    stubModel({ submit_match: { reason: 'Same proposal.', press_release: 1 } })
    const { res, db } = await run({ feeds: [DECISION, REGULATION], documents: [DOCUMENT], stored: [ANNOUNCEMENT, DECISION, REGULATION, DOCUMENT] }, { dryRun: true })
    const body = await res.json()
    expect(body.links).toEqual([
      { secondary: 'eu-d', primary: 'eu-r', rule: 'sanctions pair', secondaryTitle: DECISION.title, primaryTitle: REGULATION.title },
      { secondary: 'doc', primary: 'news', rule: 'announcement', secondaryTitle: DOCUMENT.title, primaryTitle: ANNOUNCEMENT.title },
    ])
    expect(db.ran('regulations', 'update')).toEqual([])
    expect(db.ran('sync_runs', 'insert')).toEqual([])
  })
})
