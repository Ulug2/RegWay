// Does the AI work a profile edit calls for, once the edits have stopped
// (roadmap 16b.2). A save records what it needs in `profile_changes`; this
// runs every minute and, for each firm whose last change is at least five
// minutes old, does all of it in one go:
//
//   - rewrites the analyses of what each edited entity is matched to
//     (refresh-entity-impacts),
//   - re-judges recent items the matchers rejected on the old facts
//     (match-relevance and match-enforcement-relevance with `reevaluate`),
//   - the same for geopolitical items when a location changed.
//
// Several edits in those minutes cost one round of AI calls instead of one
// per save. A re-check that needs more than one batch is continued on the
// following runs, without forgetting verdicts again.
//
// A minute with nothing due is one small query. Service key only.
//
//   POST /functions/v1/apply-profile-changes   {}
//   Authorization: Bearer <service key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'
import { automaticAiPaused } from '../_shared/ai/switch.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const SOURCE = 'profile_changes'
export const QUIET_MINUTES = 5
// Same as each matcher's BATCH_SIZE: a call that judged this many may have
// left more behind.
const MATCHER_BATCH = 40
// Runs spent on one firm's changes (continuations and failed attempts)
// before they are dropped: enough for a matcher's window of 200 items.
const MAX_ROUNDS = 6
const FIRM_CONCURRENCY = 3
const CALL_TIMEOUT_MS = 140_000

interface Change {
  id: string
  firm_id: string
  scope: 'firm' | 'fund' | 'company'
  entity_id: string | null
  refresh_impacts: boolean
  rediscover: boolean
  geopolitical: boolean
  continuing: boolean
  rounds: number
  changed_at: string
}

interface Stats {
  firms: number
  calls: number
  continued: number
  dropped: number
  errors: string[]
}

async function call(fn: string, body: Record<string, unknown>, key: string): Promise<{ evaluated?: number }> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  })
  const reply = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${fn}: ${reply.error ?? `HTTP ${res.status}`}`)
  return reply
}

// Everything one firm's pending changes call for, as one round of calls.
async function applyFirm(admin: SupabaseClient, key: string, firmId: string, changes: Change[], cutoff: string, stats: Stats): Promise<void> {
  const ids = changes.map(c => c.id)
  const rounds = Math.max(...changes.map(c => c.rounds))
  if (rounds >= MAX_ROUNDS) {
    stats.dropped++
    await admin.from('profile_changes').delete().in('id', ids)
    return
  }

  // Claimed by deleting: a run that starts while this one is still working
  // (the matchers take over a minute) finds nothing and pays for nothing.
  const { data: claimed, error: claimError } = await admin.from('profile_changes').delete().in('id', ids).select('id')
  if (claimError) throw new Error(claimError.message)
  if (!claimed?.length) return

  // Only continuation rows left: judge the next batch, forget nothing.
  const reevaluate = changes.some(c => !c.continuing)
  const jobs: Promise<{ evaluated?: number }>[] = []
  if (changes.some(c => c.rediscover)) {
    jobs.push(call('match-relevance', { firmId, reevaluate }, key), call('match-enforcement-relevance', { firmId, reevaluate }, key))
  }
  if (changes.some(c => c.geopolitical && !c.continuing)) jobs.push(call('match-geopolitical-relevance', { firmId, reevaluate: true }, key))
  const matcherJobs = jobs.length

  const entities = new Map(changes.filter(c => c.refresh_impacts).map(c => [`${c.scope}:${c.entity_id ?? ''}`, c]))
  for (const c of entities.values()) jobs.push(call('refresh-entity-impacts', { firmId, scope: c.scope, ...(c.entity_id ? { entityId: c.entity_id } : {}) }, key))
  stats.calls += jobs.length

  let results: { evaluated?: number }[]
  try {
    results = await Promise.all(jobs)
  } catch (err) {
    // Put back for the next run, a limited number of times (the AI provider
    // refusing calls would otherwise be retried every minute for good).
    const message = (err as Error).message.slice(0, 200)
    if (!stats.errors.includes(message)) stats.errors.push(message)
    await admin.from('profile_changes').insert(changes.map(({ id: _id, ...c }) => ({ ...c, rounds: rounds + 1 })))
    return
  }

  // A full batch may have left more behind: one more row, due at once.
  const backlog = results.slice(0, matcherJobs).some(r => (r.evaluated ?? 0) >= MATCHER_BATCH)
  if (backlog) {
    stats.continued++
    await admin.from('profile_changes').insert({ firm_id: firmId, scope: 'firm', rediscover: true, continuing: true, rounds: rounds + 1, changed_at: cutoff })
  }
}

async function run(admin: SupabaseClient, key: string): Promise<Stats> {
  const stats: Stats = { firms: 0, calls: 0, continued: 0, dropped: 0, errors: [] }
  const { data, error } = await admin.from('profile_changes').select('*').order('changed_at').limit(1000)
  if (error) throw new Error(error.message)

  const cutoff = new Date(Date.now() - QUIET_MINUTES * 60_000).toISOString()
  const byFirm = new Map<string, Change[]>()
  for (const change of (data ?? []) as Change[]) byFirm.set(change.firm_id, [...(byFirm.get(change.firm_id) ?? []), change])
  // A firm is due when its latest change is old enough: a newer edit
  // restarts the wait for everything pending.
  const due = [...byFirm].filter(([, changes]) => changes.every(c => c.changed_at <= cutoff))
  stats.firms = due.length

  let next = 0
  const worker = async () => {
    while (next < due.length) {
      const [firmId, changes] = due[next++]
      await applyFirm(admin, key, firmId, changes, cutoff, stats).catch(err => stats.errors.push((err as Error).message.slice(0, 200)))
    }
  }
  await Promise.all(Array.from({ length: Math.min(FIRM_CONCURRENCY, due.length) }, worker))
  return stats
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== key) return json({ error: 'Service key required' }, 401)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key)
  // The edits stay queued and are handled once automatic AI work resumes.
  if (automaticAiPaused()) return json({ paused: true })

  // Respond at once: cron doesn't wait, and the matchers take a minute or
  // more. A run with nothing due leaves no record.
  EdgeRuntime.waitUntil(
    run(admin, key)
      .then(stats => {
        if (stats.firms === 0 && stats.errors.length === 0) return
        const detail = `${stats.firms} firms, ${stats.calls} calls${stats.continued ? `, ${stats.continued} continuing` : ''}${stats.dropped ? `, ${stats.dropped} dropped` : ''}${stats.errors.length ? `; errors: ${stats.errors.join(' | ')}` : ''}`
        return recordSyncRun(admin, SOURCE, stats.errors.length === 0, detail, stats)
      })
      .catch(err => recordSyncRun(admin, SOURCE, false, (err as Error).message)),
  )
  return json({ started: true }, 202)
})
