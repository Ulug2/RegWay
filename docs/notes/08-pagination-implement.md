# Implement: pagination for `sync-federal-register`

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `docs/notes/07-pagination-investigate.md`: plain `&page=N`
pagination works correctly (verified with live curl calls, no
overlap/duplication between pages), a page past `total_pages` returns HTTP
200 with an empty `results` array (clean stop condition, not an error),
and real current volume is tiny (~18 rows across 9 days) — so this is a
safety fix for scale/backfill scenarios, not something currently breaking.

## Steps

1. In `supabase/functions/sync-federal-register/index.ts`, wrap the
   existing fetch in a loop:
   - Keep `per_page=100`.
   - Increment `page` starting at 1.
   - Stop when `results.length === 0` (handles both "no more results" and
     acts as a safety net even if `total_pages` accounting is ever off) OR
     when `page` exceeds a hard safety cap — use **20 pages (2,000
     documents)** as that cap, generous for any realistic daily/weekly sync
     or even a multi-month backfill, while still bounding a pathological
     request (e.g. an operator accidentally passing a `since` date years in
     the past).
   - Accumulate `results` across all pages into the existing `documents`
     array before mapping to `rows` and upserting — keep the single
     `upsert` call at the end rather than upserting per-page, to keep the
     existing dedup/error-handling behavior unchanged.
2. Update the JSON response to also report how many pages were actually
   fetched (e.g. `{ synced, since, agencies, pages }`) so future manual
   checks can immediately tell if pagination kicked in.
3. Keep the existing `since`/agency/type query params exactly as they are —
   this change is purely about not silently dropping results beyond page 1,
   not about changing what's queried.

## Verify

- `pnpm exec tsc --noEmit` (Deno/edge function code isn't covered by the
  root `tsc` config, but confirm the rest of the repo still typechecks
  cleanly after the edit).
- Redeploy: `supabase functions deploy sync-federal-register`.
- Manually trigger it (curl or the `net.http_post`-style call used for the
  cron job) with a **wide** `?since=` date deliberately chosen to exceed
  100 combined results across the 9 agencies (e.g. several months back —
  check the investigation's per-agency counts to pick a safe wide window),
  and confirm the response's `pages` count is greater than 1 and `synced`
  reflects more than 100 rows, proving the loop actually executed multiple
  requests rather than just changing code that never runs in practice.
- Confirm via psql that the actual row count in `regulations` for
  `source = 'federal_register'` matches what the function reported, and
  spot-check that rows from a later page (not just the first 100) are
  really present.
- Re-run a normal-window sync afterward (or just let the existing daily
  cron behave normally) to confirm typical daily operation still works
  and doesn't accidentally cap at 20 pages under normal volume.
