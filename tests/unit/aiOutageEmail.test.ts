import { afterEach, describe, expect, it } from 'vitest'
import { fakeClient, setClient, type Query } from './helpers/fakeSupabase'
import { jsonResponse, loadHandler, post, stubFetch } from './helpers/handler'
import { SERVICE_KEY, setEnv } from './helpers/setup'

const SINCE = '2026-11-14T10:00:00+00:00'
const FAILING = { failing: true, reason: 'credit', since: SINCE }

async function run(opts: { status?: unknown; emailedBefore?: boolean; resend?: Response; token?: string; body?: unknown } = {}) {
  const db = fakeClient((q: Query) => {
    if (q.table === 'ai_status') return { data: [opts.status ?? FAILING] }
    if (q.table === 'ai_outage_emails' && q.op === 'select') return { data: opts.emailedBefore ? { since: SINCE } : null }
  })
  setClient(db)
  const { handler } = await loadHandler('ai-outage-email')
  const calls = stubFetch(url => (url.hostname === 'api.resend.com' ? (opts.resend ?? jsonResponse({ id: 'email-1' })) : undefined))
  const res = await handler(post('ai-outage-email', { token: opts.token ?? SERVICE_KEY, body: opts.body }))
  return { res, body: await res.json(), db, calls }
}

describe('ai-outage-email', () => {
  afterEach(() => {
    setEnv('RESEND_API_KEY', undefined)
    setEnv('ALERT_EMAIL_TO', undefined)
  })

  it('takes the service key only', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { res, calls } = await run({ token: 'someone-else' })
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('sends nothing while the AI works', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls, db } = await run({ status: { failing: false, reason: null, since: null } })
    expect(body).toEqual({ failing: false })
    expect(calls).toHaveLength(0)
    expect(db.ran('ai_outage_emails')).toHaveLength(0)
  })

  it('emails the owner once when the AI starts failing, and records it', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls, db } = await run()
    expect(body).toEqual({ failing: true, emailed: true })

    expect(calls).toHaveLength(1)
    expect(calls[0].url.toString()).toBe('https://api.resend.com/emails')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    const sent = JSON.parse(String(calls[0].init?.body))
    expect(sent.from).toBe('RegWay <alerts@regwayai.com>')
    expect(sent.to).toEqual(['team@regwayai.com'])
    expect(sent.subject).toBe("RegWay's AI has stopped working (credit)")
    expect(sent.text).toContain('run out of credit')
    expect(sent.text).toContain('console.anthropic.com')

    expect(db.ran('ai_outage_emails', 'insert')[0].payload).toEqual({ since: SINCE, reason: 'credit', recipients: ['team@regwayai.com'], resend_id: 'email-1' })
  })

  it('does not email again for an outage already emailed', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls, db } = await run({ emailedBefore: true })
    expect(body).toEqual({ failing: true, emailed: 'already' })
    expect(calls).toHaveLength(0)
    expect(db.ran('ai_outage_emails', 'insert')).toHaveLength(0)
  })

  it('sends to the addresses in ALERT_EMAIL_TO', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    setEnv('ALERT_EMAIL_TO', 'a@regwayai.com, b@regwayai.com')
    const { calls } = await run()
    expect(JSON.parse(String(calls[0].init?.body)).to).toEqual(['a@regwayai.com', 'b@regwayai.com'])
  })

  it('records nothing when sending fails, so the next run tries again', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { res, body, db } = await run({ resend: jsonResponse({ message: 'Domain not verified' }, 403) })
    expect(res.status).toBe(502)
    expect(body).toMatchObject({ emailed: false, reason: 'Resend 403: Domain not verified' })
    expect(db.ran('ai_outage_emails', 'insert')).toHaveLength(0)
  })

  it('says so without the Resend key, and calls nobody', async () => {
    const { res, body, calls } = await run()
    expect(res.status).toBe(502)
    expect(body.reason).toBe('RESEND_API_KEY is not set')
    expect(calls).toHaveLength(0)
  })

  it('treats an unknown reason as "other"', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { calls } = await run({ status: { failing: true, reason: 'something new', since: SINCE } })
    const sent = JSON.parse(String(calls[0].init?.body))
    expect(sent.subject).toBe("RegWay's AI has stopped working (other)")
    expect(sent.text).toContain('usage_events')
  })

  it('sends a test email on request, whatever the status, and records nothing', async () => {
    setEnv('RESEND_API_KEY', 're_test')
    const { body, calls, db } = await run({ body: { test: true }, status: { failing: false, reason: null, since: null } })
    expect(body).toEqual({ sent: true, id: 'email-1' })
    expect(JSON.parse(String(calls[0].init?.body)).subject).toBe('RegWay email test')
    expect(db.ran('ai_status')).toHaveLength(0)
    expect(db.ran('ai_outage_emails')).toHaveLength(0)
  })
})
