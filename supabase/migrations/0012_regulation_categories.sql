-- Adds a monitoring category to regulations, per the "Firm/Fund/Portfolio
-- Company journey" spec: regulatory developments, enforcement actions, and
-- geopolitical developments are three distinct categories on the same entity
-- pages. Every existing row (and the Federal Register sync) is regulatory, so
-- this defaults safely with no behavior change.
--
-- Also widens the `source` check constraint to allow the new SEC enforcement
-- source used by `sync-sec-enforcement`.

alter table regulations add column category text not null default 'regulatory'
  check (category in ('regulatory', 'enforcement', 'geopolitical'));

create index regulations_category_idx on regulations(category);

alter table regulations drop constraint regulations_source_check;
alter table regulations add constraint regulations_source_check
  check (source in ('federal_register', 'sec_edgar', 'ai_search', 'manual', 'sec_enforcement'));
