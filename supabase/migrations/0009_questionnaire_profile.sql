-- Questionnaire answers. The handful of fields the AI functions already read
-- stay as real columns (hq_location, jurisdictions, sectors, regions,
-- offerings, structure, size) and are derived from the answers on save. The
-- long tail of questionnaire answers lives in a per-entity `profile` jsonb so
-- new questions don't need a migration each. Completion is computed in the app
-- from the question registry (src/lib/questionnaire.ts).

alter table firms add column website text;
alter table firms add column profile jsonb not null default '{}';

alter table funds add column profile jsonb not null default '{}';

alter table portfolio_companies add column website text;
alter table portfolio_companies add column profile jsonb not null default '{}';
