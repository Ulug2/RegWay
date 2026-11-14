-- Email alerts: an email when something new matches the firm, one of its
-- funds or one of its portfolio companies (roadmap item 12, Phase 3).
--
-- Decided by the owner on 2026-11-14: every match counts ("high priority"
-- = anything matched to the firm, a fund or a company); alerts are on for
-- everyone and can be turned off in Profile → Account; the email lists the
-- headlines and sends people to the dashboard. The send-match-alerts
-- function runs every 30 minutes, after run-matching, and sends one email
-- per person per run, only when something new was matched.

-- One row per person, created the first time send-match-alerts sees them
-- (or when they change the setting). Matches made before `alerts_since`
-- are never emailed, so switching alerts on doesn't send the backlog.
create table email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  match_alerts boolean not null default true,
  alerts_since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_preferences enable row level security;

create policy "members read own email preferences" on email_preferences
  for select using (user_id = auth.uid());
create policy "members create own email preferences" on email_preferences
  for insert with check (user_id = auth.uid());
create policy "members update own email preferences" on email_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Which match each person was emailed about, so nothing is sent twice.
-- Service role only: no policies.
create table match_alert_items (
  relevance_id uuid not null references regulation_relevance(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  resend_id text,
  sent_at timestamptz not null default now(),
  primary key (relevance_id, user_id)
);

create index match_alert_items_user_sent_idx on match_alert_items(user_id, sent_at desc);

alter table match_alert_items enable row level security;

-- The people of a firm with their sign-in email and their setting (null
-- when they have no email_preferences row yet). auth.users is not readable
-- through the API, hence a function. Service role only.
create function alert_recipients(p_firm_id uuid)
returns table (user_id uuid, email text, match_alerts boolean, alerts_since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, p.match_alerts, p.alerts_since
  from firm_members m
  join auth.users u on u.id = m.user_id
  left join email_preferences p on p.user_id = m.user_id
  where m.firm_id = p_firm_id and u.email is not null;
$$;

revoke all on function alert_recipients(uuid) from public, anon, authenticated;
grant execute on function alert_recipients(uuid) to service_role;

-- Every 30 minutes at :25/:55, 15 minutes after run-matching (:10/:40).
-- No AI call.
select cron.schedule(
  'send-match-alerts-30min',
  '25,55 * * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/send-match-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
      'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
