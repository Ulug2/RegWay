-- AI work after a profile edit waits for the edits to stop (roadmap 16b.2).
--
-- A save that changes a fact used to trigger its AI work at once: the
-- analyses of what the entity is matched to were rewritten and recent
-- rejections re-judged. Someone correcting several answers in a row paid
-- for each save. Now a save only records here what it calls for;
-- `apply-profile-changes` (every minute) does the work once, five minutes
-- after the firm's last change.
--
-- Members insert rows for their own firm and nothing else: the columns they
-- may set exclude `changed_at` (always now), `continuing` and `rounds`, so
-- the wait cannot be skipped from the browser.

create table profile_changes (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id) on delete cascade,
  scope text not null check (scope in ('firm', 'fund', 'company')),
  entity_id uuid,
  -- Rewrite the analyses of what this entity is matched to.
  refresh_impacts boolean not null default false,
  -- Re-judge recent regulatory and enforcement items rejected on the old facts.
  rediscover boolean not null default false,
  -- The same for geopolitical items (a location changed).
  geopolitical boolean not null default false,
  -- Written by the job: a re-check that needed another batch (continued
  -- without forgetting verdicts again), and how many runs it has taken.
  continuing boolean not null default false,
  rounds int not null default 0,
  changed_at timestamptz not null default now()
);

create index profile_changes_firm_idx on profile_changes (firm_id, changed_at);

alter table profile_changes enable row level security;

create policy "members record own profile changes" on profile_changes
  for insert with check (firm_id = auth_firm_id());
create policy "members read own profile changes" on profile_changes
  for select using (firm_id = auth_firm_id());

revoke insert, update, delete on profile_changes from authenticated, anon;
grant insert (firm_id, scope, entity_id, refresh_impacts, rediscover, geopolitical) on profile_changes to authenticated;

select cron.schedule(
  'apply-profile-changes-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/apply-profile-changes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
      'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
