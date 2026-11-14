import { SERVICE_KEY } from './helpers/setup'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, setClient } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'

const SEC = { name: 'Securities and Exchange Commission', slug: 'securities-and-exchange-commission', parent_id: null }
const HHS = { name: 'Health and Human Services Department', slug: 'health-and-human-services-department', parent_id: null }
const CMS = { name: 'Centers for Medicare & Medicaid Services', slug: 'centers-for-medicare-medicaid-services', parent_id: 221 }
const TREASURY = { name: 'Treasury Department', slug: 'treasury-department', parent_id: null }
const OFAC = { name: 'Foreign Assets Control Office', slug: 'foreign-assets-control-office', parent_id: 497 }
const PRESIDENT = { name: 'Executive Office of the President', slug: 'executive-office-of-the-president', parent_id: null }

const doc = (over: Record<string, unknown>) => ({
  document_number: '2026-00001',
  title: 'A rule',
  abstract: null,
  publication_date: '2026-10-02',
  effective_on: null,
  html_url: 'https://www.federalregister.gov/d/x',
  agencies: [SEC],
  type: 'Rule',
  ...over,
})

const medicareRule = doc({ document_number: '2026-19001', title: 'Medicare Program; Hospital Outpatient Payment', agencies: [HHS, CMS], abstract: 'Updates payment rates.' })
const scheduledRule = doc({ document_number: '2026-19100', title: 'Form PF; Reporting Requirements', publication_date: '2026-10-05' })
const ofacRule = doc({ document_number: '2026-19002', title: 'Iranian Transactions and Sanctions Regulations', agencies: [TREASURY, OFAC] })
const finraNotice = doc({ document_number: '2026-19003', type: 'Notice', title: 'Self-Regulatory Organizations; Financial Industry Regulatory Authority, Inc.; Notice of Filing' })
const exchangeNotice = doc({ document_number: '2026-19004', type: 'Notice', title: 'Self-Regulatory Organizations; Cboe Exchange, Inc.; Notice of Filing' })
const sdnNotice = doc({ document_number: '2026-19005', type: 'Notice', title: 'Notice of OFAC Sanctions Actions', agencies: [TREASURY, OFAC], abstract: 'OFAC is publishing the names of persons placed on the SDN List.' })
const tariffProclamation = doc({ document_number: '2026-19006', type: 'Presidential Document', title: 'Adjusting Imports of Timber and Lumber Into the United States', agencies: [PRESIDENT] })
const heritageMonth = doc({ document_number: '2026-19007', type: 'Presidential Document', title: 'National Hispanic Heritage Month, 2026', agencies: [PRESIDENT] })

const STATE = { name: 'State Department', slug: 'state-department', parent_id: null }
const itarRule = doc({ document_number: '2026-19008', title: 'International Traffic in Arms Regulations: Syria Country Policy Revision', agencies: [STATE] })
const passportRule = doc({ document_number: '2026-19009', title: 'Passports: Expanding Online Passport Renewal Overseas', agencies: [STATE] })

const FAA = { name: 'Federal Aviation Administration', slug: 'federal-aviation-administration', parent_id: 492 }
const COAST_GUARD = { name: 'Coast Guard', slug: 'coast-guard', parent_id: 227 }
const NOAA = { name: 'National Oceanic and Atmospheric Administration', slug: 'national-oceanic-and-atmospheric-administration', parent_id: 54 }
const faaDocs = [
  doc({ document_number: '2026-19020', title: 'Normalizing Unmanned Aircraft Systems Beyond Visual Line of Sight Operations', agencies: [FAA] }),
  doc({ document_number: '2026-19021', title: 'Airworthiness Directives; Airbus SAS Airplanes', agencies: [FAA] }),
  doc({ document_number: '2026-19022', title: 'Establishment of Class E Airspace; Selmer, TN', agencies: [FAA] }),
  doc({ document_number: '2026-19023', title: 'Standard Instrument Approach Procedures, and Takeoff Minimums; Miscellaneous Amendments', agencies: [FAA] }),
]
const coastGuardDocs = [
  doc({ document_number: '2026-19030', title: 'Cybersecurity in the Marine Transportation System', agencies: [COAST_GUARD] }),
  doc({ document_number: '2026-19031', title: 'Safety Zone; Fireworks Display, San Francisco Bay, CA', agencies: [COAST_GUARD] }),
  doc({ document_number: '2026-19032', title: 'Drawbridge Operation Regulation; Bay St. Louis, MS', agencies: [COAST_GUARD] }),
]
const noaaDocs = [
  doc({ document_number: '2026-19040', title: 'Licensing of Private Remote Sensing Space Systems', agencies: [NOAA] }),
  doc({ document_number: '2026-19041', title: 'Fisheries of the Exclusive Economic Zone Off Alaska; Pacific Cod', agencies: [NOAA] }),
  doc({ document_number: '2026-19042', title: 'Takes of Marine Mammals Incidental to Specified Activities', agencies: [NOAA] }),
]

const SDN_TEXT = `<html><pre>DEPARTMENT OF THE TREASURY. Notice of OFAC Sanctions Actions. ${'The following persons are blocked. [GRAPHIC] [TIFF OMITTED] '.repeat(8)} (Authority: E.O. 13902.)</pre></html>`

type Row = { external_id: string; category: string; countries: string[]; agency: string; jurisdiction: string; on_public_inspection: boolean; raw: { countries_from_full_text: boolean; raw_text_url: string } }

// Routes the Federal Register API by which feed is asking (page 1 only),
// and serves the SDN notice's text from GovInfo while Federal Register
// itself answers with its CAPTCHA redirect.
function federalRegister(opts: { readBefore?: boolean; heavy?: boolean } = {}) {
  const db = fakeClient(q => (q.table === 'regulations' && q.op === 'select' && opts.readBefore ? { data: [{ external_id: '2026-19005', countries: ['Iran'] }] } : undefined))
  setClient(db)
  const calls = stubFetch(url => {
    if (url.pathname === '/api/v1/documents.json') {
      if (url.searchParams.get('page') !== '1') return jsonResponse({ results: [] })
      const types = url.searchParams.getAll('conditions[type][]').join(',')
      const agencies = url.searchParams.getAll('conditions[agencies][]')
      if (types === 'PRESDOCU') return jsonResponse({ results: [tariffProclamation, heritageMonth] })
      if (agencies[0] === 'state-department') return jsonResponse({ results: [itarRule, passportRule] })
      if (agencies[0] === 'federal-aviation-administration') return jsonResponse({ results: opts.heavy ? faaDocs : [] })
      if (agencies[0] === 'coast-guard') return jsonResponse({ results: opts.heavy ? coastGuardDocs : [] })
      if (agencies[0] === 'national-oceanic-and-atmospheric-administration') return jsonResponse({ results: opts.heavy ? noaaDocs : [] })
      if (types === 'RULE,PRORULE') return jsonResponse({ results: [medicareRule, scheduledRule, ofacRule] })
      if (agencies[0] === 'securities-and-exchange-commission') return jsonResponse({ results: [finraNotice, exchangeNotice] })
      if (agencies[0] === 'foreign-assets-control-office') return jsonResponse({ results: [sdnNotice] })
      return jsonResponse({ results: [] })
    }
    if (url.hostname === 'www.federalregister.gov') {
      return { ok: true, status: 200, redirected: true, url: 'https://unblock.federalregister.gov/', text: async () => 'captcha', body: { cancel: async () => {} } } as unknown as Response
    }
    if (url.hostname === 'www.govinfo.gov') return new Response(SDN_TEXT)
  })
  return { db, calls }
}

async function sync(opts: { readBefore?: boolean; heavy?: boolean } = {}) {
  const { db, calls } = federalRegister(opts)
  const { handler } = await loadHandler('sync-federal-register')
  const res = await handler(post('sync-federal-register', { token: SERVICE_KEY }))
  const rows = (db.ran('regulations', 'upsert')[0]?.payload ?? []) as Row[]
  return { res, db, calls, row: (id: string) => rows.find(r => r.external_id === id)!, rows }
}

beforeEach(() => {
  // Saturday afternoon Eastern; the next issue is dated Monday 2026-10-05.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-03T18:00:00Z'))
  return () => vi.useRealTimers()
})

describe('sync-federal-register', () => {
  it('keeps the documents each feed is for and drops the rest', async () => {
    const { rows, res } = await sync()
    expect(rows.map(r => r.external_id).sort()).toEqual(['2026-19001', '2026-19002', '2026-19003', '2026-19005', '2026-19006', '2026-19008', '2026-19100'])
    expect(await res.json()).toMatchObject({ synced: 7, geopolitical: 4, notYetPublished: 1, fullTextReads: 1 })
  })

  it('files sanctions, export-control and trade documents as geopolitical', async () => {
    const { row } = await sync()
    expect(row('2026-19001').category).toBe('regulatory')
    expect(row('2026-19003').category).toBe('regulatory')
    expect(row('2026-19002').category).toBe('geopolitical')
    expect(row('2026-19005').category).toBe('geopolitical')
    expect(row('2026-19006').category).toBe('geopolitical')
  })

  it("takes the State Department's defense trade (ITAR) rules, tagged by country, and none of its other rules", async () => {
    const { row, rows } = await sync()
    expect(row('2026-19008')).toMatchObject({ category: 'geopolitical', countries: ['Syria'], agency: 'State Department' })
    expect(rows.find(r => r.external_id === '2026-19009')).toBeUndefined()
  })

  it('asks for the registry agencies added on 2026-10-08, by bureau and not by parent department', async () => {
    const { calls } = await sync()
    const asked = calls.map(c => new URL(c.url)).filter(u => u.pathname === '/api/v1/documents.json').flatMap(u => u.searchParams.getAll('conditions[agencies][]'))
    for (const slug of ['national-credit-union-administration', 'federal-communications-commission', 'pipeline-and-hazardous-materials-safety-administration', 'consumer-product-safety-commission', 'defense-department', 'investment-security-office']) {
      expect(asked).toContain(slug)
    }
    for (const parent of ['transportation-department', 'homeland-security-department', 'commerce-department', 'treasury-department']) {
      expect(asked).not.toContain(parent)
    }
  })

  it('takes the general rules of the FAA, the Coast Guard and NOAA and leaves their routine, place-specific ones', async () => {
    const { rows, row } = await sync({ heavy: true })
    const ids = rows.map(r => r.external_id)
    expect(ids).toEqual(expect.arrayContaining(['2026-19020', '2026-19030', '2026-19040']))
    for (const routine of ['2026-19021', '2026-19022', '2026-19023', '2026-19031', '2026-19032', '2026-19041', '2026-19042']) expect(ids).not.toContain(routine)
    expect(row('2026-19020')).toMatchObject({ category: 'regulatory', agency: 'Federal Aviation Administration' })
  })

  it('labels a document by the specific bureau, not its parent department', async () => {
    const { row } = await sync()
    expect(row('2026-19001').agency).toBe('Centers for Medicare & Medicaid Services')
    expect(row('2026-19002').agency).toBe('Foreign Assets Control Office')
    expect(row('2026-19002').jurisdiction).toBe('Foreign Assets Control Office · Federal')
  })

  it('reads countries from the title and abstract', async () => {
    const { row } = await sync()
    expect(row('2026-19002').countries).toEqual(['Iran'])
    expect(row('2026-19001').countries).toEqual([])
    // "Into the United States" names no foreign country: a global measure.
    expect(row('2026-19006').countries).toEqual([])
  })

  it("reads an SDN notice's country from the order its full text cites, via GovInfo when Federal Register blocks", async () => {
    const { row, calls } = await sync()
    expect(row('2026-19005').countries).toEqual(['Iran'])
    expect(row('2026-19005').raw.countries_from_full_text).toBe(true)
    const textFetches = calls.filter(c => c.url.pathname !== '/api/v1/documents.json').map(c => c.url.href)
    expect(textFetches).toEqual([
      'https://www.federalregister.gov/documents/full_text/text/2026/10/02/2026-19005.txt',
      'https://www.govinfo.gov/content/pkg/FR-2026-10-02/html/2026-19005.htm',
    ])
  })

  it('does not download a notice again once its full text has been read', async () => {
    const { row, calls, res } = await sync({ readBefore: true })
    expect(calls.filter(c => c.url.pathname !== '/api/v1/documents.json')).toEqual([])
    expect(row('2026-19005').countries).toEqual(['Iran'])
    expect(row('2026-19005').raw.countries_from_full_text).toBe(true)
    expect(await res.json()).toMatchObject({ fullTextReads: 0 })
  })

  it('flags a document scheduled for a future issue as not yet published', async () => {
    const { row } = await sync()
    expect(row('2026-19100').on_public_inspection).toBe(true)
    expect(row('2026-19001').on_public_inspection).toBe(false)
  })

  it('clears the flag once the issue date arrives (Eastern time)', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:30:00Z')) // still Sunday 23:30 in New York
    expect((await sync()).row('2026-19100').on_public_inspection).toBe(true)
    vi.setSystemTime(new Date('2026-10-05T04:30:00Z')) // Monday 00:30 in New York
    expect((await sync()).row('2026-19100').on_public_inspection).toBe(false)
  })

  it('looks back 7 days by default and accepts an explicit start date', async () => {
    const { calls } = await sync()
    expect(calls[0].url.searchParams.get('conditions[publication_date][gte]')).toBe('2026-09-26')

    const { calls: backfill } = federalRegister()
    const { handler } = await loadHandler('sync-federal-register')
    await handler(new Request('http://supabase.test/functions/v1/sync-federal-register?since=2026-01-01', { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } }))
    expect(backfill[0].url.searchParams.get('conditions[publication_date][gte]')).toBe('2026-01-01')
  })

  it.each([
    ['a date more than 400 days back', '2020-01-01'],
    ['something that is not a date', 'yesterday'],
    ['an impossible date', '2026-13-45'],
  ])('refuses %s without calling the Federal Register', async (_, since) => {
    const { calls, db } = federalRegister()
    const { handler } = await loadHandler('sync-federal-register')
    const res = await handler(new Request(`http://supabase.test/functions/v1/sync-federal-register?since=${since}`, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}` } }))
    expect(res.status).toBe(400)
    expect(calls).toEqual([])
    expect(db.queries).toEqual([])
  })

  it('records a successful run with per-feed counts', async () => {
    const { db } = await sync()
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({
      source: 'federal_register',
      ok: true,
      detail: '7 synced, 4 geopolitical (rules 3, finraNotices 1, ofacNotices 1, tradeActions 0, defenseTradeControls 1, aviationRules 0, coastGuardRules 0, oceansAndAtmosphereRules 0, presidentialDocuments 1); 1 not yet published',
    })
  })

  it('records a failed run when the Federal Register API is down', async () => {
    const db = fakeClient()
    setClient(db)
    stubFetch(() => new Response('Service Unavailable', { status: 503 }))
    const { handler } = await loadHandler('sync-federal-register')
    const res = await handler(post('sync-federal-register', { token: SERVICE_KEY }))
    expect(res.status).toBe(500)
    expect(db.ran('regulations', 'upsert')).toEqual([])
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ source: 'federal_register', ok: false })
  })
})
