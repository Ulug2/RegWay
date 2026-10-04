-- Live regulation monitoring, Phase 1a (roadmap Priority order item 2).
--
-- 1. Structured stats on sync_runs, so `run-matching` can record what it did
--    (evaluated, relevant, whether a backlog remains) and its next run can
--    decide whether there's anything to do.
-- 2. Realtime on regulation_relevance, so an open dashboard picks up new
--    matches without a refresh. Realtime applies the table's RLS ("members
--    read own relevance links"), so a subscriber only receives its own
--    firm's rows.
-- 3. Schedule: the Federal Register sync every 30 minutes instead of daily,
--    and run-matching 10 minutes after each sync.
--
-- run-matching spends AI money across every firm, so unlike the syncs it
-- must not be callable with the publishable key (which ships in the
-- frontend). The cron job sends the service key, read from Vault by name.
-- Set it once per project (not in a migration, so it's never committed):
--
--   select vault.create_secret('<service key>', 'service_role_key');
--
-- Until it exists the job sends no valid key and run-matching refuses it.

alter table sync_runs add column stats jsonb;

alter publication supabase_realtime add table regulation_relevance;

select cron.unschedule('sync-federal-register-daily');

select cron.schedule(
  'sync-federal-register-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-federal-register',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'run-matching-30min',
  '10,40 * * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/run-matching',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
      'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
