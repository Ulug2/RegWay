-- Detailed per-firm impact breakdowns and user dismissal of regulations.

-- A dismissed regulation stays as a (tiny) row so the AI matcher and company
-- scans see it as already handled and never resurface it. Restoring clears it.
alter table regulation_relevance add column dismissed_at timestamptz;

create policy "members update own relevance links" on regulation_relevance
  for update using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());

-- AI-generated analysis of one regulation for one firm (summary + per-entity
-- impact). Written only by edge functions (service role); members read their own.
create table regulation_impacts (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references regulations(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  content jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  unique (regulation_id, firm_id)
);

create index regulation_impacts_firm_id_idx on regulation_impacts(firm_id);

alter table regulation_impacts enable row level security;

create policy "members read own impacts" on regulation_impacts
  for select using (firm_id = auth_firm_id());
