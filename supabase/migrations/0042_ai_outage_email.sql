-- An email to the owner when RegWay's AI stops working (roadmap 17a.3).
--
-- The dashboard banner (0038) shows only to someone who opens the
-- dashboard. The ai-outage-email function reads the same ai_status() every
-- 15 minutes and emails once per outage, through Resend.
--
-- ai_outage_emails: one row per outage emailed, keyed by when the outage
-- began (ai_status().since). Service role only: no policies.

create table ai_outage_emails (
  since timestamptz primary key,
  reason text,
  recipients text[] not null default '{}',
  resend_id text,
  sent_at timestamptz not null default now()
);

alter table ai_outage_emails enable row level security;

-- 0038 granted ai_status() to signed-in users; the function calls it with
-- the service key.
grant execute on function ai_status() to service_role;

-- Every 15 minutes, at :03/:18/:33/:48 (off the other jobs' minutes).
-- Service key, like run-matching. No AI call: a run that finds the AI
-- working makes one query.
select cron.schedule(
  'ai-outage-email-15min',
  '3,18,33,48 * * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/ai-outage-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
      'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
