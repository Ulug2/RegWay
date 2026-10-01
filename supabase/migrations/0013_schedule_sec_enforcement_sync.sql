-- Schedules the SEC enforcement sync alongside the existing Federal Register
-- sync. Offset by 15 minutes so the two don't fire in the same instant.

select cron.schedule(
  'sync-sec-enforcement-daily',
  '15 11 * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-sec-enforcement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
    ),
    body := '{}'::jsonb
  );
  $$
);
