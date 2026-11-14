import { afterEach, describe, expect, it } from 'vitest'
import { fakeClient, setClient, type Query } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { SERVICE_KEY, setEnv } from './helpers/setup'
import { headlinesOf, matchAlertEmail } from '../../supabase/functions/_shared/matchAlerts'

const FIRM = { id: 'firm-1', name: 'Harbor Capital', created_at: '2026-10-01T00:00:00Z' }
const SINCE = '2026-11-01T00:00:00Z'
const PERSON = { user_id: 'user-1', email: 'dana@harbor.com', match_alerts: true, alerts_since: SINCE }

const reg = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, agency: 'SEC', published_date: '2026-11-13', duplicate_of: null, ...extra })
const row = (id: string, regulation: ReturnType<typeof reg>, extra: Record<string, unknown> = {}) => ({
  id,
  firm_id: FIRM.id,
  fund_id: null,
  portfolio_company_id: null,
  relevance_reason: 'Applies because…',
  dismissed_at: null,
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  regulations: regulation,
  funds: null,
  portfolio_companies: null,
  ...extra,
})

async function run(opts: { rows?: unknown[]; people?: unknown[]; emailedBefore?: string[]; firm?: typeof FIRM; resend?: Response; body?: unknown; token?: string } = {}) {
  const db = fakeClient((q: Query) => {
    if (q.table === 'regulation_relevance') return { data: opts.rows ?? [] }
    if (q.table === 'firms') return { data: [opts.firm ?? FIRM] }
    if (q.table === 'alert_recipients') return { data: opts.people ?? [PERSON] }
    if (q.table === 'match_alert_items' && q.op === 'select') return { data: (opts.emailedBefore ?? []).map(relevance_id => ({ relevance_id })) }
  })
  setClient(db)
  const { handler } = await loadHandler('send-match-alerts')
  const calls = stubFetch(url => (url.hostname === 'api.resend.com' ? (opts.resend ?? jsonResponse({ id: 'email-1' })) : undefined))
  const res = await handler(post('send-match-alerts', { token: opts.token ?? SERVICE_KEY, body: opts.body }))
  return { res, body: await res.json(), db, calls, sent: calls.map(c => JSON.parse(String(c.init?.body))) }
}

describe('send-match-alerts', () => {
  afterEach(() => setEnv('RESEND_API_KEY', undefined))

  it('takes the service key only', async () => {
    const { res } = await run({ token: 'someone' })
    expect(res.status).toBe(401)
  })

  it('emails one list of headlines per person and records what was sent', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const rule = reg('reg-1', 'Amendments to Form PF')
    const { body, sent, db } = await run({
      rows: [
        row('rel-1', rule),
        row('rel-2', rule, { fund_id: 'fund-2', funds: { name: 'Fund II' } }),
        row('rel-3', reg('reg-2', 'EPA air permit rule'), { portfolio_company_id: 'co-1', portfolio_companies: { name: 'Acme Corp' } }),
      ],
    })
    expect(body).toMatchObject({ emails: 1, failures: [] })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual(['dana@harbor.com'])
    expect(sent[0].subject).toBe('2 new developments for Harbor Capital')
    expect(sent[0].text).toContain('• Amendments to Form PF')
    expect(sent[0].text).toContain('Applies to: Harbor Capital, Fund II')
    expect(sent[0].text).toContain('Applies to: Acme Corp')
    expect(sent[0].text).toContain('https://www.regwayai.com/developments/reg-2')
    expect(sent[0].html).toContain('Open your dashboard')
    expect(db.ran('match_alert_items', 'upsert')[0].payload).toEqual(
      ['rel-1', 'rel-2', 'rel-3'].map(relevance_id => ({ relevance_id, user_id: 'user-1', firm_id: 'firm-1', resend_id: 'email-1' })),
    )
  })

  it('leaves out rejected, later-version and already-emailed matches', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { sent } = await run({
      rows: [
        row('rel-1', reg('reg-1', 'Kept')),
        row('rel-2', reg('reg-2', 'Rejected by the Skeptic'), { relevance_reason: 'NOT_RELEVANT: Reviewed: no' }),
        row('rel-3', reg('reg-3', 'A later version', { duplicate_of: 'reg-1' })),
        row('rel-4', reg('reg-4', 'Already emailed')),
      ],
      emailedBefore: ['rel-4'],
    })
    expect(sent[0].subject).toBe('New for Harbor Capital: Kept')
    expect(sent[0].text).not.toContain('Rejected')
    expect(sent[0].text).not.toContain('later version')
    expect(sent[0].text).not.toContain('Already emailed')
  })

  it('sends nothing when everything new was already emailed', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls } = await run({ rows: [row('rel-1', reg('reg-1', 'Old news'))], emailedBefore: ['rel-1'] })
    expect(body.emails).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('sends nothing to someone who turned alerts off, or for matches before they turned them on', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const off = await run({ rows: [row('rel-1', reg('reg-1', 'X'))], people: [{ ...PERSON, match_alerts: false }] })
    expect(off.calls).toHaveLength(0)
    const later = await run({ rows: [row('rel-1', reg('reg-1', 'X'))], people: [{ ...PERSON, alerts_since: new Date().toISOString() }] })
    expect(later.calls).toHaveLength(0)
  })

  it('starts someone new from now: a preferences row, no email for the past', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls, db } = await run({ rows: [row('rel-1', reg('reg-1', 'X'))], people: [{ ...PERSON, match_alerts: null, alerts_since: null }] })
    expect(calls).toHaveLength(0)
    expect(body.newPeople).toBe(1)
    expect(db.ran('email_preferences', 'upsert')[0].payload).toEqual({ user_id: 'user-1' })
  })

  it("skips a firm's first day of matching", async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { calls } = await run({ rows: [row('rel-1', reg('reg-1', 'X'))], firm: { ...FIRM, created_at: new Date(Date.now() - 2 * 3600_000).toISOString() } })
    expect(calls).toHaveLength(0)
  })

  it('records nothing when the send fails, so the next run tries again', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { res, body, db } = await run({ rows: [row('rel-1', reg('reg-1', 'X'))], resend: jsonResponse({ message: 'nope' }, 500) })
    expect(res.status).toBe(502)
    expect(body.failures[0]).toContain('Resend 500')
    expect(db.ran('match_alert_items', 'upsert')).toHaveLength(0)
    expect(db.ran('sync_runs', 'insert')[0].payload).toMatchObject({ source: 'match_alerts', ok: false })
  })

  it('a dry run says what it would send and sends nothing', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls, db } = await run({ rows: [row('rel-1', reg('reg-1', 'X'))], body: { dryRun: true } })
    expect(body).toMatchObject({ dryRun: true, wouldSend: [{ email: 'dana@harbor.com', headlines: 1 }] })
    expect(calls).toHaveLength(0)
    expect(db.ran('match_alert_items')).toHaveLength(1) // the lookup only
    expect(db.ran('match_alert_items', 'upsert')).toHaveLength(0)
  })
})

describe('matchAlertEmail', () => {
  const h = (id: string, title: string, date: string | null = '2026-11-13') => ({ regulationId: id, title, agency: 'SEC', publishedDate: date, appliesTo: ['Harbor Capital'] })

  it('puts the newest first and one line per development', () => {
    const list = headlinesOf([
      { relevanceId: 'a', regulationId: 'r1', title: 'Older', agency: null, publishedDate: '2026-11-01', appliesTo: 'Fund I' },
      { relevanceId: 'b', regulationId: 'r2', title: 'Newer', agency: null, publishedDate: '2026-11-10', appliesTo: 'Acme' },
      { relevanceId: 'c', regulationId: 'r1', title: 'Older', agency: null, publishedDate: '2026-11-01', appliesTo: 'Fund II' },
    ])
    expect(list.map(x => [x.title, x.appliesTo])).toEqual([['Newer', ['Acme']], ['Older', ['Fund I', 'Fund II']]])
  })

  it('escapes titles in the HTML and says how many more are on the dashboard', () => {
    const email = matchAlertEmail('Harbor <Capital>', [h('r1', 'Rule <b>X</b> & Y')], 4)
    expect(email.subject).toBe('5 new developments for Harbor <Capital>')
    expect(email.html).toContain('Rule &lt;b&gt;X&lt;/b&gt; &amp; Y')
    expect(email.html).not.toContain('<b>X</b>')
    expect(email.html).toContain('…and 4 more on your dashboard.')
    expect(email.text).toContain('SEC · Nov 13, 2026')
  })
})
