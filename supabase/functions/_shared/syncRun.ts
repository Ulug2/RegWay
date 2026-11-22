// Records a sync function's outcome into `sync_runs`, so a failing data
// source shows up as a stated limitation on the dashboard instead of just
// silently looking like "nothing relevant found." Never throws — a failure
// to record a run must never mask (or crash) the sync it's recording.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

// `stats`: optional structured outcome a later run can read back (see
// run-matching, which decides from its last run whether a backlog remains).
export async function recordSyncRun(admin: SupabaseClient, source: string, ok: boolean, detail: string, stats?: unknown): Promise<void> {
  try {
    await admin.from('sync_runs').insert({ source, ok, detail: detail.slice(0, 500), stats: stats ?? null })
  } catch (err) {
    console.error('failed to record sync run', source, (err as Error).message)
  }
}
