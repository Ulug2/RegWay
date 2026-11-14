// Sends an email through Resend (resend.com), from the regwayai.com domain
// verified there on 2026-11-14. The one way RegWay sends email; the AI
// outage email uses it first, the email alerts will too.
//
// Needs RESEND_API_KEY (a Supabase secret, never in a file in the
// repository). Without it nothing is sent and the caller is told why, so a
// local database or a missing secret never fails a job silently.

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
export const DEFAULT_FROM = 'RegWay <alerts@regwayai.com>'

export interface Email {
  to: string[]
  subject: string
  text: string
}

export type SendResult = { sent: true; id: string } | { sent: false; reason: string }

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { sent: false, reason: 'RESEND_API_KEY is not set' }
  if (!email.to.length) return { sent: false, reason: 'no recipient' }
  try {
    const res = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') || DEFAULT_FROM, to: email.to, subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { sent: false, reason: `Resend ${res.status}: ${String(body?.message ?? '').slice(0, 200)}` }
    return { sent: true, id: String(body?.id ?? '') }
  } catch (err) {
    return { sent: false, reason: `Resend unreachable: ${(err as Error).message}` }
  }
}

// Comma-separated addresses from a setting, e.g. ALERT_EMAIL_TO.
export function addressesFrom(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(a => a.includes('@'))
}
