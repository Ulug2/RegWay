# Investigate: recurring schedule for `sync-federal-register`

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit anything or run any
`create`/`schedule`/DDL statements yet.

Context: `plans/regway-mvp-roadmap.md`, "Fix real US regulation coverage,"
item 1. Nothing currently schedules `sync-federal-register` — it has only
ever run when manually triggered. The requirement is a daily run at **7am**.
Timezone was not specified by the user — assume UTC (pg_cron's default
in a standard Postgres setup, and Supabase-managed databases default to UTC
unless configured otherwise) but confirm this directly rather than assuming,
and flag it clearly in the output so the user can correct it if they meant
their own local time.

## Steps

1. Connect via the same psql pattern used earlier in this project
   (`.env.local` → `PROJECT_DB_PASSWORD`, pooler host
   `aws-0-us-west-2.pooler.supabase.com:6543`) and run `show timezone;` to
   confirm the database's actual configured timezone. Do not assume UTC —
   verify it.
2. Check whether `pg_cron` and `pg_net` extensions are already installed/
   available: `select * from pg_available_extensions where name in
   ('pg_cron','pg_net');` and `select * from pg_extension where extname in
   ('pg_cron','pg_net');`. Note whether they need to be created or are
   already active.
3. Check for any existing cron jobs to avoid creating a duplicate:
   `select * from cron.job;` (this will error with "relation does not
   exist" if `pg_cron` isn't installed yet — that's expected and fine to
   report, not a failure).
4. Confirm the exact deployed function URL and what Authorization header it
   needs. Read `supabase/functions/sync-federal-register/index.ts` — note
   that it does NOT check the caller's identity at all (unlike
   `match-relevance`/`company-regulations`/`harvey-chat`, which validate
   the Authorization header); it only needs to pass Supabase's own API
   gateway JWT check, then uses its own `SUPABASE_SERVICE_ROLE_KEY` secret
   internally for the actual DB write. So the anon/publishable key is
   sufficient for the cron-triggered call — confirm this reasoning holds by
   re-reading the file, and get the current publishable key value from
   `.env.local` (`VITE_SUPABASE_ANON_KEY`).
5. Work out the exact cron expression for "daily at 7am" in whatever
   timezone step 1 confirmed (`0 7 * * *` if UTC).

## Output

A precise, ready-to-execute plan: whether extensions need creating, the
exact `cron.schedule(...)` / `net.http_post(...)` SQL to run (with the real
function URL and auth header, using the safe-to-embed publishable key — not
the service role key), the exact cron expression, and the timezone
assumption clearly flagged for confirmation.
