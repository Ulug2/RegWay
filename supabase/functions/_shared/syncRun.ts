// Records a sync function's outcome into `sync_runs`, so a failing data
// source shows up as a stated limitation on the dashboard instead of just
// silently looking like "nothing relevant found." Never throws — a failure
// to record a run must never mask (or crash) the sync it's recording.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export async function recordSyncRun(admin: SupabaseClient, source: string, ok: boolean, detail: string): Promise<void> {
  try {
    await admin.from('sync_runs').insert({ source, ok, detail: detail.slice(0, 500) })
  } catch (err) {
    console.error('failed to record sync run', source, (err as Error).message)
  }
}
