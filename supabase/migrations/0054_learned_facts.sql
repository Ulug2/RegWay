-- Facts learned from what users type (Sidekick §17.6).
--
-- A member's chat message or re-check note ("we don't import batteries")
-- may state a lasting fact about the firm, a fund or a company. One small
-- AI call proposes it, in the questionnaire's own fields, as a suggestion
-- beside the web research's: nothing enters the profile until a member
-- confirms it in Profile → Suggested facts.
--
-- firm_findings now holds both. origin says where a suggestion came from;
-- a web one keeps its research run and page, a typed one has neither and
-- keeps the member's own words in `quote`.

alter table firm_findings
  alter column run_id drop not null,
  alter column source_url drop not null;

alter table firm_findings
  add column origin text not null default 'web' check (origin in ('web', 'chat', 'recheck')),
  -- The chat message it was learned from, or the development re-checked.
  add column origin_ref uuid,
  add constraint firm_findings_web_has_source check (origin <> 'web' or (run_id is not null and source_url is not null));
