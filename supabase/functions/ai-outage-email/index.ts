// Emails the owner when RegWay's AI stops working (roadmap 17a.3).
//
// The Anthropic credit ran out on 2026-10-08 and nobody noticed for nine
// days. The dashboard banner (migration 0038) shows only to someone who
// opens the dashboard; this sends an email instead. It reads the same
// ai_status() the banner reads: failing = three or more failed AI calls
// since the last one that worked.
//
// One email per outage: an outage is identified by when it began
// (`ai_status().since`), recorded in `ai_outage_emails` once the email has
// gone. A run while the AI works, or for an outage already emailed, sends
// nothing. If sending fails, nothing is recorded, so the next run tries
// again. Makes no AI call. Runs every 15 minutes (migration 0042).
//
//   POST /functions/v1/ai-outage-email   {}                (cron)
//   POST /functions/v1/ai-outage-email   { "test": true }  — send a test email now, record nothing
//   Authorization: Bearer <service key>
//
// Settings: RESEND_API_KEY (secret), ALERT_EMAIL_TO (comma-separated;
// default team@regwayai.com), EMAIL_FROM (optional, _shared/email.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { AI_FAILURE_MESSAGES, type AiFailure } from '../_shared/ai/client.ts'
import { addressesFrom, sendEmail } from '../_shared/email.ts'

const DEFAULT_TO = 'team@regwayai.com'

type Status = { failing: boolean; reason: string | null; since: string | null }

export function outageEmail(reason: string | null, since: string): { subject: string; text: string } {
  const failure = (reason && reason in AI_FAILURE_MESSAGES ? reason : 'other') as AiFailure
  const fix: Record<AiFailure, string> = {
    credit: 'Top up the Anthropic account: console.anthropic.com → Billing.',
    auth: 'Check ANTHROPIC_API_KEY in the Supabase secrets; the key may have been revoked.',
    rate_limited: 'Usually passes by itself. If it lasts, check the Anthropic rate limits for the account.',
    unavailable: 'Usually passes by itself. Check status.anthropic.com.',
    timeout: 'Usually passes by itself. Check status.anthropic.com.',
    other: 'Look at the failed calls: usage_events where ok = false, newest first, column error.',
  }
  const started = new Date(since).toUTCString()
  return {
    subject: `RegWay's AI has stopped working (${failure.replace('_', ' ')})`,
    text: [
      `RegWay's AI calls have been failing since ${started}.`,
      '',
      `Why: ${AI_FAILURE_MESSAGES[failure]}`,
      `What to do: ${fix[failure]}`,
      '',
      'Until it is fixed there is no matching, no new analyses, no company scans and no chat answers. Signed-in users see a banner on the dashboard.',
      '',
      'You get this email once per outage.',
    ].join('\n'),
  }
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== key) return json({ error: 'Service key required' }, 401)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key)
  const to = addressesFrom(Deno.env.get('ALERT_EMAIL_TO') || DEFAULT_TO)

  const body = await req.json().catch(() => ({}))
  if (body?.test === true) {
    const result = await sendEmail({ to, subject: 'RegWay email test', text: "This is a test from RegWay's AI outage email. If you can read it, RegWay can email you when the AI stops working." })
    return json(result, result.sent ? 200 : 502)
  }

  const { data, error } = await admin.rpc('ai_status')
  if (error) return json({ error: `ai_status: ${error.message}` }, 500)
  const status = (Array.isArray(data) ? data[0] : data) as Status | null
  if (!status?.failing || !status.since) return json({ failing: false })

  const { data: earlier, error: readError } = await admin.from('ai_outage_emails').select('since').eq('since', status.since).maybeSingle()
  if (readError) return json({ error: `ai_outage_emails: ${readError.message}` }, 500)
  if (earlier) return json({ failing: true, emailed: 'already' })

  const result = await sendEmail({ to, ...outageEmail(status.reason, status.since) })
  if (!result.sent) {
    console.error('ai-outage-email: not sent:', result.reason)
    return json({ failing: true, emailed: false, reason: result.reason }, 502)
  }

  const { error: writeError } = await admin.from('ai_outage_emails').insert({ since: status.since, reason: status.reason, recipients: to, resend_id: result.id })
  if (writeError) console.error('ai-outage-email: sent but not recorded:', writeError.message)
  return json({ failing: true, emailed: true })
})
