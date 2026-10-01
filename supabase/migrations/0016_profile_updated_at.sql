-- Lightweight "last verified" signal: one timestamp per firm/fund/portfolio
-- company, refreshed whenever its profile form is saved (see `toRow()` in
-- questionnaire.ts, the single funnel for all three). Deliberately not
-- per-fact provenance ({value, source, confirmed_at}) — every fact today has
-- exactly one source (the user typing it in); that distinction only becomes
-- meaningful once a second source (e.g. document-derived enrichment) exists,
-- which isn't built yet. This just answers "how stale is this profile."

alter table firms add column profile_updated_at timestamptz;
alter table funds add column profile_updated_at timestamptz;
alter table portfolio_companies add column profile_updated_at timestamptz;
