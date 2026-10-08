-- Fact provenance (roadmap item 16).
--
-- Where each recorded fact about a firm, fund or portfolio company came
-- from, and when it was last confirmed: one entry per questionnaire answer,
-- keyed like `profile` and the column-backed answers (name, website, …):
--
--   { "supplier_locations": { "source": "user", "confirmed_at": "2026-10-08T…" },
--     "adviser_registration": { "source": "document", "document": "Form ADV, March 2026", "confirmed_at": "…" } }
--
-- Beside `profile`, not inside it: every reader of `profile` (the matchers,
-- the footprints, the analyses) keeps reading plain values. An answer with
-- no entry was recorded before this column existed; the row's
-- `profile_updated_at` is the latest it can have been entered.

alter table firms add column profile_meta jsonb not null default '{}';
alter table funds add column profile_meta jsonb not null default '{}';
alter table portfolio_companies add column profile_meta jsonb not null default '{}';
