-- Geopolitical monitoring, Phase 2 (roadmap item 13): UK and EU sanctions
-- sources, polled by `sync-regulator-feeds` with the other regulator feeds
-- (supabase/functions/_shared/regulatorFeeds.ts). Stored as `geopolitical`
-- with the countries each names; match-geopolitical-relevance reads them
-- only for firms connected to the UK or the EU.

alter table regulations drop constraint regulations_source_check;
alter table regulations add constraint regulations_source_check
  check (source in (
    'federal_register', 'sec_edgar', 'ai_search', 'manual',
    'sec_enforcement', 'sec_admin_proceedings', 'finra_enforcement', 'state_travel_advisories',
    'sec_news', 'cftc_news', 'cftc_enforcement', 'ftc_news', 'cfpb_news',
    'fca_publications', 'pra_publications', 'uk_legislation', 'esma_news', 'eur_lex',
    'eu_sanctions', 'uk_sanctions', 'ofsi'
  ));
