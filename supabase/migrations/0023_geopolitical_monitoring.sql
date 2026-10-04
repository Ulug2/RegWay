-- Geopolitical monitoring, including sanctions (roadmap Priority order item
-- 1; spec §8). The `geopolitical` category value already exists (migration
-- 0012); this adds what matching it needs.
--
-- `countries`: which countries a development concerns, extracted at ingest
-- by `_shared/countries.ts`. Empty means global or unspecified (e.g. a
-- tariff on all imports). `match-geopolitical-relevance` filters candidates
-- by overlap with an entity's own locations before any AI call, so the
-- GIN index serves that `&&` query.

alter table regulations add column countries text[] not null default '{}';

create index regulations_countries_idx on regulations using gin (countries);

-- Every matcher selects "newest N of one category"; without this they sort
-- the whole table to find them.
create index regulations_category_published_idx on regulations (category, published_date desc);

alter table regulations drop constraint regulations_source_check;
alter table regulations add constraint regulations_source_check
  check (source in ('federal_register', 'sec_edgar', 'ai_search', 'manual', 'sec_enforcement', 'sec_admin_proceedings', 'finra_enforcement', 'state_travel_advisories'));

-- OFAC (sanctions) and BIS (export controls) documents were synced as
-- `regulatory`, but none was ever evaluated by match-relevance (0 relevance
-- rows), so moving them changes no existing match. sync-federal-register
-- now classifies them as geopolitical itself; this brings the existing rows
-- in line until the next backfill run fills in their `countries`.
update regulations
set category = 'geopolitical'
where source = 'federal_register'
  and agency in ('Foreign Assets Control Office', 'Industry and Security Bureau');

-- State Department travel advisories, alongside the other daily syncs.
select cron.schedule(
  'sync-travel-advisories-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/sync-travel-advisories',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_SgKsz7b5OpfcHAXoJUGJ5A_54kK75Zw'
    ),
    body := '{}'::jsonb
  );
  $$
);
