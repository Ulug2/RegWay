-- Schedules the Federal Register sync to run automatically. Before this,
-- nothing ever triggered `sync-federal-register` on its own — it only ran
-- when manually invoked during development, which meant the `regulations`
-- table silently went stale between manual runs.
--
-- Fires daily at 07:00 UTC (this database's timezone — confirmed via
-- `show timezone;` before writing this migration).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-federal-register-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-federal-register',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Publishable/anon key: safe to embed, this function does no
      -- caller-identity check of its own (unlike match-relevance,
      -- company-regulations, harvey-chat) — it only needs to pass
      -- Supabase's own API gateway JWT check, then uses its own
      -- SUPABASE_SERVICE_ROLE_KEY secret internally for the actual write.
      'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
    ),
    body := '{}'::jsonb
  );
  $$
);
