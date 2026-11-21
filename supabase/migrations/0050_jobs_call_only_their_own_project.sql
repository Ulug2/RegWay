-- Scheduled jobs call only the project they run in.
--
-- Every job used to have the hosted project's address written into it, so
-- any local database (`supabase start`) called the production functions on
-- the same timers. `seed.sql` removes the jobs on start and reset, but a
-- migration applied later with `supabase migration up` scheduled them
-- again: on 2026-11-21 a developer's laptop had been calling production's
-- sync functions every half hour (refused since 0044, which requires the
-- service key).
--
-- Now every job calls `private.call_function(name)`, which reads the
-- project's own address and service key from Vault and does nothing when
-- either is missing. Production has both; a local database has neither, so
-- its jobs run and call nothing. Same job names and schedules as before.
--
-- Set the address once per project, before this migration (never in a
-- migration; supabase/README.md):
--   select vault.create_secret('https://<project ref>.supabase.co', 'project_url');

-- A project that already has the service key (production) must have the
-- address too, or every job would stop silently.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'service_role_key')
     and not exists (select 1 from vault.secrets where name = 'project_url') then
    raise exception 'Vault has service_role_key but no project_url: add project_url first (supabase/README.md)';
  end if;
end $$;

create function private.call_function(fn text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
  if base is null or key is null then
    return null;
  end if;
  if fn !~ '^[a-z0-9-]+$' then
    raise exception 'call_function: bad function name %', fn;
  end if;
  return net.http_post(
    url := rtrim(base, '/') || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || key,
      'apikey', key
    ),
    body := '{}'::jsonb
  );
end
$$;
-- Only the job runner (postgres, the owner) calls it.
revoke all on function private.call_function(text) from public, anon, authenticated;

-- `cron.schedule` with an existing name replaces that job's schedule and
-- command; a job a local seed removed is created again, now harmless.
select cron.schedule(job_name, cron_expr, format('select private.call_function(%L)', fn))
from (values
  ('sync-federal-register-30min',   '*/30 * * * *',       'sync-federal-register'),
  ('sync-regulator-feeds-30min',    '5,35 * * * *',       'sync-regulator-feeds'),
  ('sync-sec-enforcement-hourly',   '15 * * * *',         'sync-sec-enforcement'),
  ('sync-finra-enforcement-hourly', '20 * * * *',         'sync-finra-enforcement'),
  ('sync-sec-admin-proceedings-3h', '25 */3 * * *',       'sync-sec-admin-proceedings'),
  ('sync-travel-advisories-6h',     '0 */6 * * *',        'sync-travel-advisories'),
  ('group-duplicates-30min',        '8,38 * * * *',       'group-duplicates'),
  ('run-matching-30min',            '10,40 * * * *',      'run-matching'),
  ('apply-profile-changes-1min',    '* * * * *',          'apply-profile-changes'),
  ('send-match-alerts-30min',       '25,55 * * * *',      'send-match-alerts'),
  ('ai-outage-email-15min',         '3,18,33,48 * * * *', 'ai-outage-email')
) as jobs (job_name, cron_expr, fn);
