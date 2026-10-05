// Scheduled matching (roadmap Priority order item 2): runs each enrolled
// firm's regulatory, enforcement and geopolitical matchers so newly
// synced developments reach existing firms, not only firms that onboard
// after them. Before this, matchers ran only at onboarding (and the
// geopolitical one on dashboard load), so firm and fund pages froze.
//
// Pipeline: sync (cron, free) → run-matching (cron, 10 min later) → each
// matcher pre-filters and only calls Claude for unevaluated candidates.
//
// Cheap when quiet: the run is skipped outright if no development or firm
// arrived since the last recorded run and that run left no backlog. Each
// matcher call evaluates at most one batch; a backlog (a new firm, a burst
// of documents) clears over successive runs rather than one long one.
//
// Only firms listed in `scheduled_matching_firms` are matched (migration
// 0029): each run costs AI money per firm, so test and dormant accounts are
// left out. Enrolling a firm, or a re-check after one of its profile edits
// (migration 0030), counts as work, so the backlog clears over the next
// runs.
//
// Every run that does work is recorded in `sync_runs` (source `matching`)
// with stats; a failing run (e.g. the AI provider refusing calls) shows in
// the dashboard's failing-source banner.
//
// Service key only: this spends AI money across firms, so the
// publishable key that cron uses for the syncs is refused.
//
//   POST /functions/v1/run-matching   {}            (cron)
//   POST /functions/v1/run-matching   { "force": true }   — run even if nothing changed
//   Authorization: Bearer <service key>

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { handleOptions, json } from '../_shared/cors.ts'
import { recordSyncRun } from '../_shared/syncRun.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const SOURCE = 'matching'
const MATCHERS = ['match-relevance', 'match-enforcement-relevance', 'match-geopolitical-relevance'] as const
// Same as each matcher's BATCH_SIZE: a call that evaluated this many may
// have left more behind. (Matchers report rows written, which can exceed the
// items evaluated when one item touches several entities; the worst case is
// one extra no-op run.)
const MATCHER_BATCH = 40
const CONCURRENCY = 6
const CALL_TIMEOUT_MS = 140_000

interface RunStats {
  firms: number
  calls: number
  evaluated: number
  relevant: number
  backlog: boolean
  errors: string[]
}

// Nothing to do when no development arrived since the last recorded run, no
// firm was enrolled or asked for a re-check since (`requested_at`, set on
// enrolment and after a profile edit), and that run cleared its backlog.
async function hasWork(admin: SupabaseClient): Promise<boolean> {
  const { data: last } = await admin
    .from('sync_runs')
    .select('ran_at, ok, stats')
    .eq('source', SOURCE)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!last || !last.ok || (last.stats as RunStats | null)?.backlog !== false) return true

  const since = last.ran_at as string
  const [regs, firms] = await Promise.all([
    admin.from('regulations').select('id', { count: 'exact', head: true }).gt('created_at', since),
    admin.from('scheduled_matching_firms').select('firm_id', { count: 'exact', head: true }).gt('requested_at', since),
  ])
  return (regs.count ?? 0) > 0 || (firms.count ?? 0) > 0
}

async function callMatcher(name: string, firmId: string, key: string): Promise<{ evaluated: number; relevant: number }> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ firmId }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { evaluated: body.evaluated ?? 0, relevant: body.relevant ?? 0 }
}

async function runAll(admin: SupabaseClient, key: string): Promise<RunStats> {
  const { data: firms, error } = await admin.from('scheduled_matching_firms').select('firm_id')
  if (error) throw error

  const jobs = (firms ?? []).flatMap(f => MATCHERS.map(m => ({ firmId: f.firm_id as string, matcher: m })))
  const stats: RunStats = { firms: firms?.length ?? 0, calls: jobs.length, evaluated: 0, relevant: 0, backlog: false, errors: [] }

  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const { firmId, matcher } = jobs[next++]
      try {
        const r = await callMatcher(matcher, firmId, key)
        stats.evaluated += r.evaluated
        stats.relevant += r.relevant
        if (r.evaluated >= MATCHER_BATCH) stats.backlog = true
      } catch (err) {
        // One message per distinct failure, so an outage reads as one line.
        const message = `${matcher}: ${(err as Error).message}`.slice(0, 200)
        if (!stats.errors.includes(message)) stats.errors.push(message)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))
  return stats
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== key) return json({ error: 'Service key required' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key)
  const body = await req.json().catch(() => ({}))

  if (body?.force !== true && !(await hasWork(admin))) return json({ skipped: true })

  // Respond at once; the matchers take a minute or more and cron doesn't
  // wait for the result. The outcome is recorded in sync_runs.
  EdgeRuntime.waitUntil(
    runAll(admin, key)
      .then(stats => {
        const detail = `${stats.firms} firms, ${stats.calls} matcher calls: ${stats.evaluated} evaluated, ${stats.relevant} relevant${stats.backlog ? ', backlog remains' : ''}${stats.errors.length ? `; errors: ${stats.errors.join(' | ')}` : ''}`
        return recordSyncRun(admin, SOURCE, stats.errors.length === 0, detail, stats)
      })
      .catch(err => recordSyncRun(admin, SOURCE, false, (err as Error).message)),
  )
  return json({ started: true }, 202)
})
