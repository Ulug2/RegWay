-- Tracks each sync function's outcome so a failing data source can be shown
-- to users as a stated limitation instead of silently looking like "nothing
-- relevant found." Written only by the sync functions themselves (service
-- role, bypasses RLS); readable by any signed-in user since it's
-- platform-wide operational status, not per-firm data (same exposure level
-- as `regulations` itself).

create table sync_runs (
  id bigint generated always as identity primary key,
  source text not null,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  detail text
);

create index sync_runs_source_ran_at_idx on sync_runs(source, ran_at desc);

alter table sync_runs enable row level security;

create policy "authenticated users read sync runs" on sync_runs
  for select to authenticated using (true);
