-- DOJ press releases (issue #41): a new enforcement source, polled hourly by
-- `sync-doj-press-releases`, which keeps only releases about companies
-- (False Claims Act settlements, antitrust, FCPA, sanctions and export
-- cases, environmental settlements; `_shared/doj.ts`). Judged per firm by
-- match-enforcement-relevance like the SEC and FINRA cases.

alter table regulations drop constraint regulations_source_check;
alter table regulations add constraint regulations_source_check
  check (source in (
    'federal_register', 'sec_edgar', 'ai_search', 'manual',
    'sec_enforcement', 'sec_admin_proceedings', 'finra_enforcement', 'state_travel_advisories',
    'sec_news', 'cftc_news', 'cftc_enforcement', 'ftc_news', 'cfpb_news',
    'fca_publications', 'pra_publications', 'uk_legislation', 'esma_news', 'eur_lex',
    'eu_sanctions', 'uk_sanctions', 'ofsi',
    'doj_press'
  ));

-- Calls only this project's own functions (0050): a local database, with no
-- address or key in Vault, schedules the job and calls nothing.
select cron.schedule('sync-doj-press-releases-hourly', '45 * * * *', $$select private.call_function('sync-doj-press-releases')$$);
