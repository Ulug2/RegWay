-- Runs on a LOCAL database only, after the migrations, on `supabase start`
-- and `supabase db reset`. `supabase db push` does not run it (unless given
-- `--include-seed`: never do that against the hosted project).
--
-- The migrations schedule the sync and matching jobs. Since 0050 they call
-- nothing without the project's address in Vault (a local database has
-- none); before 0050 they called production. Remove them anyway. To pull
-- data into a local database, call the local function by hand instead (see
-- docs/onboarding.md).
--
-- Guard: the hosted project keeps its service key in Vault under
-- 'service_role_key' (supabase/README.md); a local database has no such
-- secret. If it is there, this is not a throwaway database: do nothing.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'service_role_key') then
    raise notice 'seed.sql: service_role_key found in Vault, leaving scheduled jobs alone';
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job;
end $$;
