// Emails each person when something new matches their firm, one of its
// funds or one of its portfolio companies (roadmap item 12, Phase 3;
// migration 0043). One email per person per run, listing the headlines
// (_shared/matchAlerts.ts); nothing on a run with nothing new. No AI call.
//
// What counts as new: a match (regulation_relevance) that is relevant (not
// NOT_RELEVANT, including the Skeptic's rejections), not dismissed, on the
// first version of a development (later versions go under it), made after
// the person's `alerts_since`, and not already emailed to them
// (match_alert_items). Also left out: what a firm's first day of matching
// finds (FIRST_DAY_HOURS), which the person sees on the dashboard while
// setting up rather than as a long email.
//
// A person seen for the first time gets an email_preferences row (alerts
// on, from now) and no email that run, so switching this on never sends
// the history. A failed send records nothing; the next run tries again
// (while the match is inside LOOKBACK_HOURS).
//
//   POST /functions/v1/send-match-alerts   {}                  (cron)
//   POST /functions/v1/send-match-alerts   { "dryRun": true }  — say what would be sent, send and write nothing
//   Authorization: Bearer <service key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { sendEmail } from '../_shared/email.ts'
import { headlinesOf, matchAlertEmail, type AlertMatch } from '../_shared/matchAlerts.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

const SOURCE = 'match_alerts'
// How far back a run looks. Longer than any gap between runs, so a missed
// run or a failed send is caught up by the next.
const LOOKBACK_HOURS = 48
const FIRST_DAY_HOURS = 24
const MAX_ROWS = 2000
// More than this in one email is a backlog, not an alert: the email lists
// the newest and says how many more are on the dashboard.
const MAX_HEADLINES = 25

type Row = {
  id: string
  firm_id: string
  fund_id: string | null
  portfolio_company_id: string | null
  relevance_reason: string | null
  dismissed_at: string | null
  created_at: string
  regulations: { id: string; title: string; agency: string | null; published_date: string | null; duplicate_of: string | null } | null
  funds: { name: string } | null
  portfolio_companies: { name: string } | null
}

type Recipient = { user_id: string; email: string; match_alerts: boolean | null; alerts_since: string | null }

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

async function firmsById(admin: SupabaseClient, ids: string[]): Promise<Map<string, { name: string; created_at: string }>> {
  const { data, error } = await admin.from('firms').select('id, name, created_at').in('id', ids)
  if (error) throw new Error(`firms: ${error.message}`)
  return new Map((data ?? []).map((f: { id: string; name: string; created_at: string }) => [f.id, f]))
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== key) return json({ error: 'Service key required' }, 401)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key)
  const dryRun = (await req.json().catch(() => ({})))?.dryRun === true

  const { data, error } = await admin
    .from('regulation_relevance')
    .select('id, firm_id, fund_id, portfolio_company_id, relevance_reason, dismissed_at, created_at, regulations(id, title, agency, published_date, duplicate_of), funds(name), portfolio_companies(name)')
    .gt('created_at', hoursAgo(LOOKBACK_HOURS))
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  if (error) return json({ error: `regulation_relevance: ${error.message}` }, 500)

  const rows = ((data ?? []) as unknown as Row[]).filter(r => r.regulations && !r.regulations.duplicate_of && !r.relevance_reason?.startsWith('NOT_RELEVANT:'))
  if (!rows.length) return json({ firms: 0, emails: 0 })

  const byFirm = new Map<string, Row[]>()
  for (const r of rows) byFirm.set(r.firm_id, [...(byFirm.get(r.firm_id) ?? []), r])

  let firms: Map<string, { name: string; created_at: string }>
  try {
    firms = await firmsById(admin, [...byFirm.keys()])
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  const sent: { email: string; headlines: number }[] = []
  const failures: string[] = []
  let newPeople = 0

  for (const [firmId, firmRows] of byFirm) {
    const firm = firms.get(firmId)
    if (!firm) continue
    const firstDayEnds = new Date(new Date(firm.created_at).getTime() + FIRST_DAY_HOURS * 3600_000).toISOString()
    const candidates = firmRows.filter(r => r.created_at > firstDayEnds)
    if (!candidates.length) continue

    const { data: people, error: peopleError } = await admin.rpc('alert_recipients', { p_firm_id: firmId })
    if (peopleError) {
      failures.push(`recipients for ${firmId}: ${peopleError.message}`)
      continue
    }

    for (const person of (people ?? []) as Recipient[]) {
      // First time seen: alerts on from now, nothing sent for the past.
      if (person.match_alerts === null) {
        newPeople++
        if (!dryRun) await admin.from('email_preferences').upsert({ user_id: person.user_id }, { onConflict: 'user_id', ignoreDuplicates: true })
        continue
      }
      if (!person.match_alerts || !person.alerts_since) continue

      const fresh = candidates.filter(r => r.created_at > person.alerts_since!)
      if (!fresh.length) continue
      const { data: done, error: doneError } = await admin.from('match_alert_items').select('relevance_id').eq('user_id', person.user_id).in('relevance_id', fresh.map(r => r.id))
      if (doneError) {
        failures.push(`sent items for ${person.user_id}: ${doneError.message}`)
        continue
      }
      const already = new Set((done ?? []).map((d: { relevance_id: string }) => d.relevance_id))
      const unsent = fresh.filter(r => !already.has(r.id))
      if (!unsent.length) continue

      const matches: AlertMatch[] = unsent.map(r => ({
        relevanceId: r.id,
        regulationId: r.regulations!.id,
        title: r.regulations!.title,
        agency: r.regulations!.agency,
        publishedDate: r.regulations!.published_date,
        appliesTo: r.portfolio_companies?.name ?? r.funds?.name ?? firm.name,
      }))
      const headlines = headlinesOf(matches)
      const shown = headlines.slice(0, MAX_HEADLINES)
      const email = matchAlertEmail(firm.name, shown, headlines.length - shown.length)

      if (dryRun) {
        sent.push({ email: person.email, headlines: headlines.length })
        continue
      }
      const result = await sendEmail({ to: [person.email], ...email })
      if (!result.sent) {
        failures.push(`${person.email}: ${result.reason}`)
        continue
      }
      // Every unsent match counts as emailed, including those past
      // MAX_HEADLINES: the email said how many more there are.
      const { error: recordError } = await admin
        .from('match_alert_items')
        .upsert(unsent.map(r => ({ relevance_id: r.id, user_id: person.user_id, firm_id: firmId, resend_id: result.id })), { onConflict: 'relevance_id,user_id', ignoreDuplicates: true })
      if (recordError) failures.push(`recording for ${person.email}: ${recordError.message}`)
      sent.push({ email: person.email, headlines: headlines.length })
    }
  }

  const summary = { firms: byFirm.size, emails: sent.length, newPeople, failures }
  if (!dryRun && (sent.length || failures.length)) {
    await recordSyncRun(admin, SOURCE, failures.length === 0, `${sent.length} alert emails${failures.length ? `; failed: ${failures.join('; ')}` : ''}`, summary)
  }
  return json(dryRun ? { ...summary, dryRun: true, wouldSend: sent } : summary, failures.length && !sent.length ? 502 : 200)
})
