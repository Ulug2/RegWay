-- Live regulation monitoring, Phase 2 (roadmap item 12).
--
-- 1. New sources: the regulator feeds polled by `sync-regulator-feeds`
--    (U.S. agencies' own announcements, UK and EU sources; the list and each
--    feed's keep-rule are in supabase/functions/_shared/regulatorFeeds.ts).
--    (`cftc_news` and `cftc_enforcement` are allowed but unused: the CFTC
--    blocks the edge functions' addresses, found after this was applied.)
-- 2. Schedule: those feeds every 30 minutes, five minutes after the Federal
--    Register sync, so run-matching (at :10 and :40) sees both.
-- 3. The enforcement and travel-advisory syncs leave their once-a-day slots:
--    each only reads a feed and fetches pages for entries it hasn't stored,
--    so polling more often costs nothing and no AI. SEC administrative
--    proceedings stays the least frequent (PDF-heavy; see 0015 and 0021).

alter table regulations drop constraint regulations_source_check;
alter table regulations add constraint regulations_source_check
  check (source in (
    'federal_register', 'sec_edgar', 'ai_search', 'manual',
    'sec_enforcement', 'sec_admin_proceedings', 'finra_enforcement', 'state_travel_advisories',
    'sec_news', 'cftc_news', 'cftc_enforcement', 'ftc_news', 'cfpb_news',
    'fca_publications', 'pra_publications', 'uk_legislation', 'esma_news', 'eur_lex'
  ));

-- The matchers read candidates by source and category, newest first.
create index regulations_source_category_published_idx on regulations (source, category, published_date desc);

create or replace function pg_temp.schedule_sync(job text, cron_expr text, fn text) returns void language plpgsql as $fn$
begin
  perform cron.schedule(
    job,
    cron_expr,
    format(
      $cmd$
      select net.http_post(
        url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/%s',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
        ),
        body := '{}'::jsonb
      );
      $cmd$,
      fn
    )
  );
end
$fn$;

select pg_temp.schedule_sync('sync-regulator-feeds-30min', '5,35 * * * *', 'sync-regulator-feeds');

select cron.unschedule('sync-sec-enforcement-daily');
select cron.unschedule('sync-finra-enforcement-daily');
select cron.unschedule('sync-sec-admin-proceedings-daily');
select cron.unschedule('sync-travel-advisories-daily');

select pg_temp.schedule_sync('sync-sec-enforcement-hourly', '15 * * * *', 'sync-sec-enforcement');
select pg_temp.schedule_sync('sync-finra-enforcement-hourly', '20 * * * *', 'sync-finra-enforcement');
select pg_temp.schedule_sync('sync-sec-admin-proceedings-3h', '25 */3 * * *', 'sync-sec-admin-proceedings');
select pg_temp.schedule_sync('sync-travel-advisories-6h', '0 */6 * * *', 'sync-travel-advisories');
