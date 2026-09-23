# Implement: recurring schedule for `sync-federal-register`

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `prompts/05-cron-schedule-investigate.md`: database
timezone is UTC, `pg_cron` (1.6.4) and `pg_net` (0.20.4) are available but
not installed, no existing cron jobs, and the sync function needs no
special auth beyond a valid Supabase key in the Authorization header (the
publishable/anon key is sufficient and safe to embed — it's designed to be
public-facing).

**Timezone assumption**: "7am" is being scheduled as 7am UTC since that's
the database's actual timezone and none other was specified. Flag this
prominently in the final report so the user can say if they meant their own
local time instead — don't silently guess and move on if there's any
ambiguity signal from them later.

## Steps

1. Create `supabase/migrations/0003_schedule_federal_register_sync.sql`:
   - `create extension if not exists pg_cron;` and
     `create extension if not exists pg_net;` (guard with `if not exists`
     since they may already be enabled by the time this runs).
   - `select cron.schedule('sync-federal-register-daily', '0 7 * * *', $$
     ... $$)` where the job body calls `net.http_post` against
     `https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-federal-register`
     with headers `Content-Type: application/json` and
     `Authorization: Bearer <publishable key>`, and an empty JSON body.
   - Name the job something unambiguous (`sync-federal-register-daily`) so
     it's easy to find/modify later.
2. Apply it with `supabase db push`.
3. Verify the job was actually created: `select jobid, schedule, command,
   active from cron.job;` — confirm schedule is `0 7 * * *` and `active` is
   true.
4. Do **not** wait around for 7am UTC to naturally fire — instead manually
   invoke the exact same `net.http_post` call the cron job would run (or
   just re-run the existing manual curl/browser-based trigger) to prove the
   URL/auth/body combination actually works, since a syntactically valid
   cron job that calls a broken request would silently fail forever.
5. Optionally, check `cron.job_run_details` after it's had at least one
   scheduled or manual-equivalent run to confirm success (status
   `succeeded`, not `failed`).

## Verify

- `select * from cron.job where jobname = 'sync-federal-register-daily';`
  shows the job, active, correct schedule.
- The manual equivalent-request test in step 4 returns the same
  `{"synced": N, ...}` shape the function normally returns, not an auth
  error.
- Report back: job name, exact schedule, confirmed timezone (UTC), and the
  test-call result. Explicitly restate the UTC assumption in the summary.
