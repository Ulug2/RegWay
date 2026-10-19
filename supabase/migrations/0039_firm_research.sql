-- Research on the web after onboarding (roadmap item 18).
--
-- After onboarding (or on request from Profile), `research-firm` searches
-- the web for the firm, its funds and its portfolio companies and proposes
-- facts, each with the page it came from. A proposal is not a fact: it
-- enters the profile only when a member confirms it (then with
-- profile_meta source "web" and the link), so matching, analyses and the
-- Skeptic never rest on something no one stood behind. Until then only the
-- chat sees it, labelled as unconfirmed.
--
-- firm_research_runs: one row per run; the latest drives the dashboard
-- card. firm_findings: what a run proposed, and what the firm decided.
--
-- Written by the function with the service role. Members read both and may
-- change only a finding's status (confirm or reject it).

create table firm_research_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id) on delete cascade,
  -- unsure: the firm could not be told apart from others on the web, so
  -- nothing was proposed.
  status text not null default 'running' check (status in ('running', 'done', 'unsure', 'failed')),
  -- Why a run was unsure or failed, in words for the user.
  note text,
  found int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index firm_research_runs_firm_idx on firm_research_runs (firm_id, started_at desc);

create table firm_findings (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id) on delete cascade,
  run_id uuid not null references firm_research_runs (id) on delete cascade,
  scope text not null check (scope in ('firm', 'fund', 'company')),
  -- The fund or company it is about; null for the firm itself and for a
  -- fund or company found that the firm has not entered (field new_entity).
  entity_id uuid,
  -- A questionnaire question id (src/lib/questionnaire.ts), or new_entity.
  field text not null,
  -- In the question's own shape (a select option, a list of options, a
  -- location, text). For new_entity: {name, website, description}.
  value jsonb not null,
  -- What the profile said when the run found something different.
  recorded jsonb,
  source_url text not null,
  -- The words on that page the finding rests on.
  quote text not null default '',
  -- superseded: a later run replaced it before anyone decided.
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'superseded')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index firm_findings_firm_idx on firm_findings (firm_id, status);
create index firm_findings_run_idx on firm_findings (run_id);

alter table firm_research_runs enable row level security;
alter table firm_findings enable row level security;

create policy "members read own research runs" on firm_research_runs
  for select using (firm_id = (select auth_firm_id()));
create policy "members read own findings" on firm_findings
  for select using (firm_id = (select auth_firm_id()));
create policy "members decide own findings" on firm_findings
  for update using (firm_id = (select auth_firm_id())) with check (firm_id = (select auth_firm_id()));

revoke insert, update, delete on firm_research_runs from authenticated, anon;
revoke insert, update, delete on firm_findings from authenticated, anon;
grant update (status, decided_at) on firm_findings to authenticated;
