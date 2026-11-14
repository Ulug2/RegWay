-- The sync functions now accept only the service key (they used to accept
-- the public key, which is in every browser: anyone could run them, and
-- sync-sec-admin-proceedings spends AI credit on each new item). Their
-- timers are rescheduled to send the service key from Vault, like the
-- other jobs. Same names and schedules as before.

create or replace function pg_temp.schedule_sync(job_name text, cron_expr text, fn text) returns void language plpgsql as $fn$
begin
  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;
  perform cron.schedule(
    job_name,
    cron_expr,
    format(
      $cmd$
      select net.http_post(
        url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/%s',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
          'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
        ),
        body := '{}'::jsonb
      );
      $cmd$,
      fn
    )
  );
end
$fn$;

select pg_temp.schedule_sync('sync-federal-register-30min', '*/30 * * * *', 'sync-federal-register');
select pg_temp.schedule_sync('sync-regulator-feeds-30min', '5,35 * * * *', 'sync-regulator-feeds');
select pg_temp.schedule_sync('sync-sec-enforcement-hourly', '15 * * * *', 'sync-sec-enforcement');
select pg_temp.schedule_sync('sync-finra-enforcement-hourly', '20 * * * *', 'sync-finra-enforcement');
select pg_temp.schedule_sync('sync-sec-admin-proceedings-3h', '25 */3 * * *', 'sync-sec-admin-proceedings');
select pg_temp.schedule_sync('sync-travel-advisories-6h', '0 */6 * * *', 'sync-travel-advisories');
