-- Re-enables `sync-sec-admin-proceedings`, unscheduled in migration 0015
-- after it was found to hang indefinitely. Root cause since confirmed and
-- fixed: the one fetch in that function with no timeout (the PDF-extraction
-- call to Claude) now has a 45s AbortSignal, verified live to time out
-- cleanly instead of hanging. Same schedule as before (11:30am UTC).

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
