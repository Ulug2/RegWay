-- Widens `regulations.source` for the two new enforcement sync functions
-- (`sync-sec-admin-proceedings`, `sync-finra-enforcement`) and schedules both
-- alongside the existing Federal Register and SEC litigation-release syncs.

alter table regulations drop constraint regulations_source_check;
alter table regulations add constraint regulations_source_check
  check (source in ('federal_register', 'sec_edgar', 'ai_search', 'manual', 'sec_enforcement', 'sec_admin_proceedings', 'finra_enforcement'));

select cron.schedule(
  'sync-sec-admin-proceedings-daily',
  '30 11 * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-sec-admin-proceedings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-finra-enforcement-daily',
  '45 11 * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-finra-enforcement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
    ),
    body := '{}'::jsonb
  );
  $$
);
